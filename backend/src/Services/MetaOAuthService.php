<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use ProjectLara\ExternalConnectionRepository;
use ProjectLara\ExternalConnectionSecretRepository;

final class MetaOAuthService
{
    public function __construct(
        private readonly ExternalConnectionRepository $externalConnectionRepository,
        private readonly ExternalConnectionSecretRepository $secretRepository,
        private readonly TokenService $tokenService,
        private readonly ExternalAccountDiscoveryService $accountDiscoveryService
    ) {
    }

    public function buildAuthorizationUrl(array $connection, array $user): string
    {
        $clientId = trim((string) getenv('META_CLIENT_ID'));
        $redirectUri = $this->getRedirectUri();
        $scope = trim((string) (getenv('META_ADS_SCOPES') ?: 'ads_read,business_management'));
        $graphVersion = $this->getGraphVersion();

        if ($clientId === '' || $redirectUri === '') {
            throw new InvalidArgumentException('Meta OAuth não está configurado no servidor.');
        }

        $state = $this->tokenService->issuePayload([
            'sub' => (int) $user['id'],
            'role' => (string) $user['role'],
            'connection_id' => (int) $connection['id'],
            'provider' => 'meta_ads',
            'exp' => time() + 900,
            'iat' => time(),
        ]);

        return sprintf('https://www.facebook.com/%s/dialog/oauth', $graphVersion) . '?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'state' => $state,
            'scope' => $scope,
            'response_type' => 'code',
        ]);
    }

    public function handleCallback(string $code, string $state): array
    {
        $payload = $this->tokenService->validate($state);
        $connectionId = (int) ($payload['connection_id'] ?? 0);

        if ($connectionId <= 0 || ($payload['provider'] ?? null) !== 'meta_ads') {
            throw new InvalidArgumentException('Estado OAuth inválido para Meta Ads.');
        }

        $connection = $this->externalConnectionRepository->find($connectionId);
        if (!$connection || ($connection['provider'] ?? '') !== 'meta_ads') {
            throw new InvalidArgumentException('Conexão Meta Ads não encontrada.');
        }

        $shortTokenPayload = $this->exchangeAuthorizationCode($code);
        $accessToken = (string) ($shortTokenPayload['access_token'] ?? '');
        $expiresIn = isset($shortTokenPayload['expires_in']) ? (int) $shortTokenPayload['expires_in'] : null;

        if ($accessToken === '') {
            throw new InvalidArgumentException('Meta não retornou access token.');
        }

        $longLivedTokenPayload = $this->exchangeLongLivedToken($accessToken);
        if (is_array($longLivedTokenPayload) && !empty($longLivedTokenPayload['access_token'])) {
            $accessToken = (string) $longLivedTokenPayload['access_token'];
            $expiresIn = isset($longLivedTokenPayload['expires_in']) ? (int) $longLivedTokenPayload['expires_in'] : $expiresIn;
        }

        $this->secretRepository->upsert($connectionId, 'access_token', $accessToken);

        $config = is_array($connection['config_json'] ?? null) ? $connection['config_json'] : [];
        $config['pending_authorization'] = false;
        $config['authorized_at'] = gmdate('c');
        $config['oauth_provider'] = 'meta';
        $config['scopes'] = trim((string) (getenv('META_ADS_SCOPES') ?: 'ads_read,business_management'));
        if ($expiresIn !== null && $expiresIn > 0) {
            $config['access_token_expires_at'] = gmdate('c', time() + $expiresIn);
        }

        $this->externalConnectionRepository->update($connectionId, [
            'status' => 'connected',
            'config_json' => $config,
        ]);

        try {
            $this->accountDiscoveryService->sync($connectionId);
        } catch (\Throwable) {
            // mantém o OAuth concluído mesmo se o fetch de contas falhar
        }

        return [
            'connection_id' => $connectionId,
            'provider' => 'meta_ads',
        ];
    }

    private function exchangeAuthorizationCode(string $code): array
    {
        $clientId = trim((string) getenv('META_CLIENT_ID'));
        $clientSecret = trim((string) getenv('META_CLIENT_SECRET'));
        $redirectUri = $this->getRedirectUri();

        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            throw new InvalidArgumentException('Credenciais Meta ausentes no ambiente.');
        }

        $url = sprintf('https://graph.facebook.com/%s/oauth/access_token', $this->getGraphVersion())
            . '?' . http_build_query([
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'redirect_uri' => $redirectUri,
                'code' => $code,
            ]);

        return $this->sendGetRequest($url, 'Falha ao trocar o código OAuth da Meta.');
    }

    private function exchangeLongLivedToken(string $shortToken): ?array
    {
        $clientId = trim((string) getenv('META_CLIENT_ID'));
        $clientSecret = trim((string) getenv('META_CLIENT_SECRET'));
        if ($clientId === '' || $clientSecret === '') {
            return null;
        }

        $url = sprintf('https://graph.facebook.com/%s/oauth/access_token', $this->getGraphVersion())
            . '?' . http_build_query([
                'grant_type' => 'fb_exchange_token',
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'fb_exchange_token' => $shortToken,
            ]);

        try {
            return $this->sendGetRequest($url, 'Falha ao gerar token estendido da Meta.');
        } catch (\Throwable) {
            return null;
        }
    }

    private function sendGetRequest(string $url, string $defaultMessage): array
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
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
            $message = $defaultMessage;
            if (is_array($payload) && isset($payload['error']['message'])) {
                $message = (string) $payload['error']['message'];
            }
            throw new InvalidArgumentException($message);
        }

        return $payload;
    }

    private function getRedirectUri(): string
    {
        $configured = trim((string) getenv('META_REDIRECT_URI'));
        if ($configured !== '') {
            return $configured;
        }

        $appUrl = rtrim((string) getenv('APP_URL'), '/');
        if ($appUrl === '') {
            return '';
        }

        return $appUrl . '/oauth/meta/callback';
    }

    private function getGraphVersion(): string
    {
        return trim((string) (getenv('META_GRAPH_VERSION') ?: 'v22.0'));
    }
}
