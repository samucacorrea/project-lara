<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use ProjectLara\ExternalConnectionRepository;
use ProjectLara\ExternalConnectionSecretRepository;

final class GoogleOAuthService
{
    private const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    public function __construct(
        private readonly ExternalConnectionRepository $externalConnectionRepository,
        private readonly ExternalConnectionSecretRepository $secretRepository,
        private readonly TokenService $tokenService,
        private readonly ExternalAccountDiscoveryService $accountDiscoveryService
    ) {
    }

    public function buildAuthorizationUrl(array $connection, array $user): string
    {
        $provider = (string) ($connection['provider'] ?? '');
        $clientId = trim((string) getenv('GOOGLE_CLIENT_ID'));
        $redirectUri = $this->getRedirectUri();
        $scope = $this->resolveScope($provider);

        if ($clientId === '' || $redirectUri === '' || $scope === '') {
            throw new InvalidArgumentException('Google OAuth não está configurado no servidor.');
        }

        $state = $this->tokenService->issuePayload([
            'sub' => (int) $user['id'],
            'role' => (string) $user['role'],
            'connection_id' => (int) $connection['id'],
            'provider' => $provider,
            'exp' => time() + 900,
            'iat' => time(),
        ]);

        return self::AUTHORIZE_URL . '?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $scope,
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
            'state' => $state,
        ]);
    }

    public function handleCallback(string $code, string $state): array
    {
        $payload = $this->tokenService->validate($state);
        $connectionId = (int) ($payload['connection_id'] ?? 0);
        $provider = (string) ($payload['provider'] ?? '');

        if ($connectionId <= 0 || !in_array($provider, ['google_analytics', 'google_ads'], true)) {
            throw new InvalidArgumentException('Estado OAuth inválido para Google.');
        }

        $connection = $this->externalConnectionRepository->find($connectionId);
        if (!$connection || ($connection['provider'] ?? '') !== $provider) {
            throw new InvalidArgumentException('Conexão Google não encontrada.');
        }

        $tokens = $this->exchangeAuthorizationCode($code);

        if (!empty($tokens['access_token'])) {
            $this->secretRepository->upsert($connectionId, 'access_token', (string) $tokens['access_token']);
        }
        if (!empty($tokens['refresh_token'])) {
            $this->secretRepository->upsert($connectionId, 'refresh_token', (string) $tokens['refresh_token']);
        }

        $config = is_array($connection['config_json'] ?? null) ? $connection['config_json'] : [];
        $config['pending_authorization'] = false;
        $config['authorized_at'] = gmdate('c');
        $config['token_type'] = $tokens['token_type'] ?? 'Bearer';
        $config['scopes'] = $tokens['scope'] ?? $this->resolveScope($provider);
        $config['oauth_provider'] = 'google';
        if (isset($tokens['expires_in'])) {
            $config['access_token_expires_at'] = gmdate('c', time() + (int) $tokens['expires_in']);
        }
        if ($provider === 'google_ads') {
            $developerToken = trim((string) getenv('GOOGLE_ADS_DEVELOPER_TOKEN'));
            if ($developerToken !== '') {
                $config['developer_token_configured'] = true;
            }
        }

        $this->externalConnectionRepository->update($connectionId, [
            'status' => 'connected',
            'config_json' => $config,
        ]);

        try {
            $this->accountDiscoveryService->sync($connectionId);
        } catch (\Throwable) {
            // Não invalida a conexão se a descoberta de contas falhar.
        }

        return [
            'connection_id' => $connectionId,
            'provider' => $provider,
        ];
    }

    private function exchangeAuthorizationCode(string $code): array
    {
        $clientId = trim((string) getenv('GOOGLE_CLIENT_ID'));
        $clientSecret = trim((string) getenv('GOOGLE_CLIENT_SECRET'));
        $redirectUri = $this->getRedirectUri();

        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            throw new InvalidArgumentException('Credenciais Google ausentes no ambiente.');
        }

        $body = http_build_query([
            'code' => $code,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ]);

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n" .
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
            $message = is_array($payload) && isset($payload['error_description'])
                ? (string) $payload['error_description']
                : 'Falha ao trocar o código OAuth do Google.';
            throw new InvalidArgumentException($message);
        }

        return $payload;
    }

    private function getRedirectUri(): string
    {
        $configured = trim((string) getenv('GOOGLE_REDIRECT_URI'));
        if ($configured !== '') {
            return $configured;
        }

        $appUrl = rtrim((string) getenv('APP_URL'), '/');
        if ($appUrl === '') {
            return '';
        }

        return $appUrl . '/oauth/google/callback';
    }

    private function resolveScope(string $provider): string
    {
        if ($provider === 'google_analytics') {
            $scope = trim((string) getenv('GOOGLE_ANALYTICS_SCOPES'));
            return $scope !== '' ? $scope : 'https://www.googleapis.com/auth/analytics.readonly';
        }

        if ($provider === 'google_ads') {
            $scope = trim((string) getenv('GOOGLE_ADS_SCOPES'));
            return $scope !== '' ? $scope : 'https://www.googleapis.com/auth/adwords';
        }

        return '';
    }
}
