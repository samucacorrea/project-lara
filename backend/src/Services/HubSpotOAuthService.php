<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use ProjectLara\ExternalConnectionRepository;
use ProjectLara\ExternalConnectionSecretRepository;

final class HubSpotOAuthService
{
    private const AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize';
    private const TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';

    public function __construct(
        private readonly ExternalConnectionRepository $externalConnectionRepository,
        private readonly ExternalConnectionSecretRepository $secretRepository,
        private readonly TokenService $tokenService
    ) {
    }

    public function buildAuthorizationUrl(array $connection, array $user): string
    {
        $clientId = trim((string) getenv('HUBSPOT_CLIENT_ID'));
        $redirectUri = $this->getRedirectUri();
        $scopes = trim((string) (getenv('HUBSPOT_SCOPES') ?: 'oauth crm.objects.contacts.read'));

        if ($clientId === '' || $redirectUri === '') {
            throw new InvalidArgumentException('HubSpot OAuth não está configurado no servidor.');
        }

        $state = $this->tokenService->issuePayload([
            'sub' => (int) $user['id'],
            'role' => (string) $user['role'],
            'connection_id' => (int) $connection['id'],
            'provider' => 'hubspot',
            'exp' => time() + 900,
            'iat' => time(),
        ]);

        return self::AUTHORIZE_URL . '?' . http_build_query([
            'client_id' => $clientId,
            'scope' => $scopes,
            'redirect_uri' => $redirectUri,
            'state' => $state,
        ]);
    }

    public function handleCallback(string $code, string $state): array
    {
        $payload = $this->tokenService->validate($state);
        $connectionId = (int) ($payload['connection_id'] ?? 0);

        if ($connectionId <= 0 || ($payload['provider'] ?? null) !== 'hubspot') {
            throw new InvalidArgumentException('Estado OAuth inválido para HubSpot.');
        }

        $connection = $this->externalConnectionRepository->find($connectionId);
        if (!$connection || ($connection['provider'] ?? '') !== 'hubspot') {
            throw new InvalidArgumentException('Conexão HubSpot não encontrada.');
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
        $config['token_type'] = $tokens['token_type'] ?? 'bearer';
        $config['scopes'] = $tokens['scope'] ?? ($tokens['scopes'] ?? null);
        $config['hub_id'] = $tokens['hub_id'] ?? ($tokens['hubId'] ?? null);
        $config['oauth_provider'] = 'hubspot';
        if (isset($tokens['expires_in'])) {
            $config['access_token_expires_at'] = gmdate('c', time() + (int) $tokens['expires_in']);
        }

        $this->externalConnectionRepository->update($connectionId, [
            'status' => 'connected',
            'config_json' => $config,
        ]);

        return [
            'connection_id' => $connectionId,
            'user_id' => (int) ($payload['sub'] ?? 0),
        ];
    }

    private function exchangeAuthorizationCode(string $code): array
    {
        $clientId = trim((string) getenv('HUBSPOT_CLIENT_ID'));
        $clientSecret = trim((string) getenv('HUBSPOT_CLIENT_SECRET'));
        $redirectUri = $this->getRedirectUri();

        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            throw new InvalidArgumentException('Credenciais HubSpot ausentes no ambiente.');
        }

        $body = http_build_query([
            'grant_type' => 'authorization_code',
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'code' => $code,
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
          $message = is_array($payload) && isset($payload['message']) ? (string) $payload['message'] : 'Falha ao trocar o código OAuth do HubSpot.';
          throw new InvalidArgumentException($message);
        }

        return $payload;
    }

    private function getRedirectUri(): string
    {
        $configured = trim((string) getenv('HUBSPOT_REDIRECT_URI'));
        if ($configured !== '') {
            return $configured;
        }

        $appUrl = rtrim((string) getenv('APP_URL'), '/');
        if ($appUrl === '') {
            return '';
        }

        return $appUrl . '/oauth/hubspot/callback';
    }
}
