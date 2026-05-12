<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use ProjectLara\ExternalConnectionRepository;
use ProjectLara\ExternalConnectionSecretRepository;

final class TikTokOAuthService
{
    private const AUTHORIZE_URL = 'https://business-api.tiktok.com/portal/auth';
    private const TOKEN_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';

    public function __construct(
        private readonly ExternalConnectionRepository $externalConnectionRepository,
        private readonly ExternalConnectionSecretRepository $secretRepository,
        private readonly TokenService $tokenService
    ) {
    }

    public function buildAuthorizationUrl(array $connection, array $user): string
    {
        $appId = trim((string) getenv('TIKTOK_APP_ID'));
        $redirectUri = $this->getRedirectUri();

        if ($appId === '' || $redirectUri === '') {
            throw new InvalidArgumentException('TikTok OAuth não está configurado no servidor.');
        }

        $state = $this->tokenService->issuePayload([
            'sub' => (int) $user['id'],
            'role' => (string) $user['role'],
            'connection_id' => (int) $connection['id'],
            'provider' => 'tiktok_ads',
            'exp' => time() + 900,
            'iat' => time(),
        ]);

        return self::AUTHORIZE_URL . '?' . http_build_query([
            'app_id' => $appId,
            'redirect_uri' => $redirectUri,
            'state' => $state,
        ]);
    }

    public function handleCallback(string $authCode, string $state): array
    {
        $payload = $this->tokenService->validate($state);
        $connectionId = (int) ($payload['connection_id'] ?? 0);

        if ($connectionId <= 0 || ($payload['provider'] ?? null) !== 'tiktok_ads') {
            throw new InvalidArgumentException('Estado OAuth inválido para TikTok Ads.');
        }

        $connection = $this->externalConnectionRepository->find($connectionId);
        if (!$connection || ($connection['provider'] ?? '') !== 'tiktok_ads') {
            throw new InvalidArgumentException('Conexão TikTok Ads não encontrada.');
        }

        $tokens = $this->exchangeAuthorizationCode($authCode);
        $data = isset($tokens['data']) && is_array($tokens['data']) ? $tokens['data'] : $tokens;
        $accessToken = (string) ($data['access_token'] ?? '');
        $refreshToken = (string) ($data['refresh_token'] ?? '');
        $advertiserIds = isset($data['advertiser_ids']) && is_array($data['advertiser_ids']) ? $data['advertiser_ids'] : [];

        if ($accessToken === '') {
            throw new InvalidArgumentException('TikTok não retornou access token.');
        }

        $this->secretRepository->upsert($connectionId, 'access_token', $accessToken);
        if ($refreshToken !== '') {
            $this->secretRepository->upsert($connectionId, 'refresh_token', $refreshToken);
        }

        $config = is_array($connection['config_json'] ?? null) ? $connection['config_json'] : [];
        $config['pending_authorization'] = false;
        $config['authorized_at'] = gmdate('c');
        $config['oauth_provider'] = 'tiktok';
        if (isset($data['expires_in'])) {
            $config['access_token_expires_at'] = gmdate('c', time() + (int) $data['expires_in']);
        }
        if (isset($data['refresh_expires_in'])) {
            $config['refresh_token_expires_at'] = gmdate('c', time() + (int) $data['refresh_expires_in']);
        }
        if ($advertiserIds !== []) {
            $config['advertiser_ids'] = $advertiserIds;
        }

        $this->externalConnectionRepository->update($connectionId, [
            'status' => 'connected',
            'config_json' => $config,
        ]);

        return [
            'connection_id' => $connectionId,
            'provider' => 'tiktok_ads',
        ];
    }

    private function exchangeAuthorizationCode(string $authCode): array
    {
        $appId = trim((string) getenv('TIKTOK_APP_ID'));
        $secret = trim((string) getenv('TIKTOK_SECRET'));
        $redirectUri = $this->getRedirectUri();

        if ($appId === '' || $secret === '' || $redirectUri === '') {
            throw new InvalidArgumentException('Credenciais TikTok ausentes no ambiente.');
        }

        $body = json_encode([
            'app_id' => $appId,
            'secret' => $secret,
            'auth_code' => $authCode,
            'grant_type' => 'authorized_code',
            'redirect_uri' => $redirectUri,
        ], JSON_THROW_ON_ERROR);

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\n" .
                    'Content-Length: ' . strlen($body) . "\r\n",
                'content' => $body,
                'ignore_errors' => true,
                'timeout' => 20,
            ],
        ]);

        $response = @file_get_contents(self::TOKEN_URL, false, $context);
        $rawHeaders = $http_response_header ?? [];
        $statusLine = $rawHeaders[0] ?? '';
        preg_match('/\s(\d{3})\s/', $statusLine, $matches);
        $statusCode = isset($matches[1]) ? (int) $matches[1] : 0;
        $payload = is_string($response) && $response !== '' ? json_decode($response, true) : null;

        if ($statusCode < 200 || $statusCode >= 300 || !is_array($payload)) {
            throw new InvalidArgumentException('Falha ao trocar o código OAuth do TikTok Ads.');
        }

        if (isset($payload['code']) && (int) $payload['code'] !== 0) {
            $message = isset($payload['message']) ? (string) $payload['message'] : 'Falha ao autenticar no TikTok Ads.';
            throw new InvalidArgumentException($message);
        }

        return $payload;
    }

    private function getRedirectUri(): string
    {
        $configured = trim((string) getenv('TIKTOK_REDIRECT_URI'));
        if ($configured !== '') {
            return $configured;
        }

        $appUrl = rtrim((string) getenv('APP_URL'), '/');
        if ($appUrl === '') {
            return '';
        }

        return $appUrl . '/oauth/tiktok/callback';
    }
}
