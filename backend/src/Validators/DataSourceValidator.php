<?php

declare(strict_types=1);

namespace ProjectLara\Validators;

final class DataSourceValidator
{
    private const ALLOWED_TYPES = ['mysql', 'google_sheets', 'bigquery', 'supabase'];

    /**
     * @throws \InvalidArgumentException
     */
    public static function validate(array $payload): void
    {
        if (!isset($payload['name']) || trim((string) $payload['name']) === '') {
            throw new \InvalidArgumentException('Nome é obrigatório.');
        }

        if (!isset($payload['type']) || !in_array($payload['type'], self::ALLOWED_TYPES, true)) {
            throw new \InvalidArgumentException('Tipo inválido. Use mysql, supabase, google_sheets ou bigquery.');
        }

        if (!isset($payload['config']) || !is_array($payload['config'])) {
            throw new \InvalidArgumentException('Configuração precisa ser um objeto JSON.');
        }

        self::validateConfig($payload['type'], $payload['config']);
    }

    private static function validateConfig(string $type, array $config): void
    {
        $requiredMap = [
            'mysql' => ['host', 'port', 'database', 'username', 'password'],
            'supabase' => ['host', 'port', 'database', 'username', 'password'],
            'google_sheets' => ['spreadsheet_id'],
            'bigquery' => ['project_id', 'dataset', 'service_account_json'],
        ];

        foreach ($requiredMap[$type] as $field) {
            if (!array_key_exists($field, $config) || $config[$field] === '') {
                throw new \InvalidArgumentException(sprintf('Campo obrigatório ausente para %s: %s', $type, $field));
            }
        }

        if ($type === 'google_sheets') {
            $worksheets = $config['worksheets'] ?? null;
            $worksheet = $config['worksheet'] ?? null;
            if ((!is_array($worksheets) || $worksheets === []) && (!$worksheet || $worksheet === '')) {
                throw new \InvalidArgumentException('Campo obrigatório ausente para google_sheets: worksheet.');
            }
        }

        if ($type === 'bigquery') {
            $tables = $config['tables'] ?? null;
            $table = $config['table'] ?? null;
            if ((!is_array($tables) || $tables === []) && (!$table || $table === '')) {
                throw new \InvalidArgumentException('Campo obrigatório ausente para bigquery: table.');
            }
        }
    }
}
