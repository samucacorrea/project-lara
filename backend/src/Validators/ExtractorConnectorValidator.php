<?php

declare(strict_types=1);

namespace ProjectLara\Validators;

use InvalidArgumentException;

final class ExtractorConnectorValidator
{
    private const PROVIDERS = [
        'google_ads',
        'google_analytics',
        'microsoft_clarity',
        'meta_ads',
        'meta_organic',
        'tiktok_ads',
        'custom',
    ];

    private const AUTH_TYPES = ['oauth', 'api_key', 'service_account', 'access_token', 'none'];

    public static function validate(array $payload, bool $isUpdate = false): void
    {
        foreach (['name', 'provider', 'target_table'] as $field) {
            if (!$isUpdate && empty($payload[$field])) {
                throw new InvalidArgumentException(sprintf('O campo %s é obrigatório.', $field));
            }
        }

        if (isset($payload['provider']) && !in_array($payload['provider'], self::PROVIDERS, true)) {
            throw new InvalidArgumentException('Fornecedor de extrator inválido.');
        }

        if (isset($payload['auth_type']) && !in_array($payload['auth_type'], self::AUTH_TYPES, true)) {
            throw new InvalidArgumentException('Tipo de autenticação inválido.');
        }

        if (isset($payload['target_table']) && !preg_match('/^[A-Za-z0-9_]+$/', $payload['target_table'])) {
            throw new InvalidArgumentException('Use apenas letras, números e _ para nome da tabela.');
        }

        if (isset($payload['config']) && !is_array($payload['config'])) {
            throw new InvalidArgumentException('Configuração deve ser um objeto JSON.');
        }
    }
}
