<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use ProjectLara\ExternalConnectionAccountRepository;
use ProjectLara\ExternalConnectionRepository;
use ProjectLara\ExternalConnectionSecretRepository;

final class ExternalAccountDiscoveryService
{
    public function __construct(
        private readonly ExternalConnectionRepository $connectionRepository,
        private readonly ExternalConnectionSecretRepository $secretRepository,
        private readonly ExternalConnectionAccountRepository $accountRepository
    ) {
    }

    public function sync(int $connectionId): array
    {
        $connection = $this->connectionRepository->find($connectionId);
        if (!$connection) {
            throw new InvalidArgumentException('Conexão externa não encontrada.');
        }

        $accounts = match ((string) ($connection['provider'] ?? '')) {
            'hubspot' => $this->discoverHubSpotAccounts($connection),
            'google_analytics' => $this->discoverGoogleAnalyticsAccounts($connection),
            'google_ads' => $this->discoverGoogleAdsAccounts($connection),
            'meta_ads' => $this->discoverMetaAdsAccounts($connection),
            'tiktok_ads' => $this->discoverTikTokAccounts($connection),
            default => throw new InvalidArgumentException('Descoberta de contas ainda não implementada para este provedor.'),
        };

        return $this->accountRepository->replaceForConnection($connectionId, $accounts);
    }

    private function discoverHubSpotAccounts(array $connection): array
    {
        $accessToken = $this->requireAccessToken((int) $connection['id']);
        $info = $this->jsonRequest(
            'GET',
            'https://api.hubapi.com/oauth/v1/access-tokens/' . rawurlencode($accessToken)
        );

        return [[
            'external_account_id' => (string) ($info['hub_id'] ?? $info['user_id'] ?? 'hubspot'),
            'external_account_name' => (string) ($info['hub_domain'] ?? $info['hub_id'] ?? 'HubSpot account'),
            'external_account_type' => 'portal',
            'is_selected' => true,
            'metadata_json' => $info,
        ]];
    }

    private function discoverGoogleAnalyticsAccounts(array $connection): array
    {
        $accessToken = $this->requireAccessToken((int) $connection['id']);
        $payload = $this->jsonRequest(
            'GET',
            'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
            [
                'Authorization: Bearer ' . $accessToken,
            ]
        );

        $summaries = isset($payload['accountSummaries']) && is_array($payload['accountSummaries'])
            ? $payload['accountSummaries']
            : [];

        return array_map(static function (array $summary): array {
            return [
                'external_account_id' => (string) ($summary['account'] ?? $summary['name'] ?? ''),
                'external_account_name' => (string) ($summary['displayName'] ?? $summary['account'] ?? 'Google Analytics account'),
                'external_account_type' => 'property_group',
                'is_selected' => true,
                'metadata_json' => $summary,
            ];
        }, $summaries);
    }

    private function discoverGoogleAdsAccounts(array $connection): array
    {
        $accessToken = $this->requireAccessToken((int) $connection['id']);
        $developerToken = trim((string) getenv('GOOGLE_ADS_DEVELOPER_TOKEN'));
        if ($developerToken === '') {
            throw new InvalidArgumentException('GOOGLE_ADS_DEVELOPER_TOKEN não configurado.');
        }

        $payload = $this->jsonRequest(
            'POST',
            'https://googleads.googleapis.com/v19/customers:listAccessibleCustomers',
            [
                'Authorization: Bearer ' . $accessToken,
                'developer-token: ' . $developerToken,
            ],
            json_encode(new \stdClass(), JSON_THROW_ON_ERROR)
        );

        $resourceNames = isset($payload['resourceNames']) && is_array($payload['resourceNames'])
            ? $payload['resourceNames']
            : [];

        return array_map(static function (string $resourceName): array {
            return [
                'external_account_id' => $resourceName,
                'external_account_name' => $resourceName,
                'external_account_type' => 'customer',
                'is_selected' => true,
                'metadata_json' => ['resource_name' => $resourceName],
            ];
        }, $resourceNames);
    }

    private function discoverMetaAdsAccounts(array $connection): array
    {
        $accessToken = $this->requireAccessToken((int) $connection['id']);
        $version = trim((string) (getenv('META_GRAPH_VERSION') ?: 'v22.0'));
        $payload = $this->jsonRequest(
            'GET',
            sprintf('https://graph.facebook.com/%s/me/adaccounts?fields=id,name,account_status', $version),
            [
                'Authorization: Bearer ' . $accessToken,
            ]
        );

        $items = isset($payload['data']) && is_array($payload['data']) ? $payload['data'] : [];

        return array_map(static function (array $item): array {
            return [
                'external_account_id' => (string) ($item['id'] ?? ''),
                'external_account_name' => (string) ($item['name'] ?? $item['id'] ?? 'Meta ad account'),
                'external_account_type' => 'ad_account',
                'is_selected' => true,
                'metadata_json' => $item,
            ];
        }, $items);
    }

    private function discoverTikTokAccounts(array $connection): array
    {
        $accessToken = $this->requireAccessToken((int) $connection['id']);
        $appId = trim((string) getenv('TIKTOK_APP_ID'));
        $secret = trim((string) getenv('TIKTOK_SECRET'));
        if ($appId === '' || $secret === '') {
            throw new InvalidArgumentException('Credenciais do TikTok Ads ausentes no ambiente.');
        }

        $payload = $this->jsonRequest(
            'GET',
            'https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?' . http_build_query([
                'app_id' => $appId,
                'secret' => $secret,
            ]),
            [
                'Access-Token: ' . $accessToken,
            ]
        );

        $items = isset($payload['data']['list']) && is_array($payload['data']['list'])
            ? $payload['data']['list']
            : [];

        return array_map(static function (array $item): array {
            return [
                'external_account_id' => (string) ($item['advertiser_id'] ?? $item['id'] ?? ''),
                'external_account_name' => (string) ($item['advertiser_name'] ?? $item['name'] ?? $item['advertiser_id'] ?? 'TikTok advertiser'),
                'external_account_type' => 'advertiser',
                'is_selected' => true,
                'metadata_json' => $item,
            ];
        }, $items);
    }

    private function requireAccessToken(int $connectionId): string
    {
        $token = $this->secretRepository->get($connectionId, 'access_token');
        if (!$token) {
            throw new InvalidArgumentException('Access token não encontrado para esta conexão.');
        }

        return $token;
    }

    private function jsonRequest(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        $normalizedHeaders = array_merge(['Accept: application/json'], $headers);
        if ($body !== null) {
            $normalizedHeaders[] = 'Content-Type: application/json';
            $normalizedHeaders[] = 'Content-Length: ' . strlen($body);
        }

        $context = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $normalizedHeaders) . "\r\n",
                'content' => $body,
                'ignore_errors' => true,
                'timeout' => 20,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        $rawHeaders = $http_response_header ?? [];
        $statusLine = $rawHeaders[0] ?? '';
        preg_match('/\s(\d{3})\s/', $statusLine, $matches);
        $statusCode = isset($matches[1]) ? (int) $matches[1] : 0;
        $payload = is_string($response) && $response !== '' ? json_decode($response, true) : null;

        if ($statusCode < 200 || $statusCode >= 300 || !is_array($payload)) {
            $message = 'Falha ao consultar contas da plataforma.';
            if (is_array($payload) && isset($payload['error']['message'])) {
                $message = (string) $payload['error']['message'];
            } elseif (is_array($payload) && isset($payload['message'])) {
                $message = (string) $payload['message'];
            }
            throw new InvalidArgumentException($message);
        }

        if (isset($payload['code']) && is_numeric($payload['code']) && (int) $payload['code'] !== 0) {
            $message = isset($payload['message']) ? (string) $payload['message'] : 'Falha ao consultar contas da plataforma.';
            throw new InvalidArgumentException($message);
        }

        return $payload;
    }
}
