<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;

final class TokenService
{
    private string $secret;

    public function __construct(?string $secret = null)
    {
        $this->secret = $secret && $secret !== '' ? $secret : 'project-lara-secret';
    }

    public function issue(array $user, int $ttlSeconds = 28800): string
    {
        return $this->issuePayload([
            'sub' => $user['id'],
            'role' => $user['role'],
            'exp' => time() + $ttlSeconds,
            'iat' => time(),
        ]);
    }

    public function issuePayload(array $payload): string
    {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];

        $segments = [
            $this->base64UrlEncode(json_encode($header, JSON_THROW_ON_ERROR)),
            $this->base64UrlEncode(json_encode($payload, JSON_THROW_ON_ERROR)),
        ];

        $signature = hash_hmac('sha256', implode('.', $segments), $this->secret, true);
        $segments[] = $this->base64UrlEncode($signature);

        return implode('.', $segments);
    }

    public function validate(string $token): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new InvalidArgumentException('Token inválido.');
        }

        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
        $signature = $this->base64UrlDecode($encodedSignature);
        $expectedSignature = hash_hmac('sha256', sprintf('%s.%s', $encodedHeader, $encodedPayload), $this->secret, true);

        if (!hash_equals($expectedSignature, $signature)) {
            throw new InvalidArgumentException('Assinatura inválida.');
        }

        $payloadJson = $this->base64UrlDecode($encodedPayload);
        $payload = json_decode($payloadJson, true, 512, JSON_THROW_ON_ERROR);

        if (!isset($payload['exp']) || (int) $payload['exp'] < time()) {
            throw new InvalidArgumentException('Token expirado.');
        }

        return $payload;
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $padLength = 4 - $remainder;
            $data .= str_repeat('=', $padLength);
        }

        return base64_decode(strtr($data, '-_', '+/'), true) ?: '';
    }
}
