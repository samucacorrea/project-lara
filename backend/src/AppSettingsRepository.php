<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class AppSettingsRepository
{
    private const DEFAULT_ID = 1;

    public function __construct(private readonly PDO $connection)
    {
    }

    public function get(): array
    {
        $statement = $this->connection->prepare('SELECT * FROM app_settings WHERE id = :id');
        $statement->execute([':id' => self::DEFAULT_ID]);

        $record = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$record) {
            $this->createDefault();
            return $this->get();
        }

        $record['role_permissions'] = $this->decodeRolePermissions($record['role_permissions'] ?? null);
        return $record;
    }

    public function update(array $payload): array
    {
        $current = $this->get();

        $statement = $this->connection->prepare(
            'UPDATE app_settings
                SET tool_name = :tool_name,
                    logo_url = :logo_url,
                    favicon_url = :favicon_url,
                    role_permissions = :role_permissions,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = :id'
        );

        $statement->execute([
            ':id' => self::DEFAULT_ID,
            ':tool_name' => trim((string) ($payload['tool_name'] ?? $current['tool_name'] ?? 'Project Lara')) ?: 'Project Lara',
            ':logo_url' => array_key_exists('logo_url', $payload) ? $this->normalizeNullableString($payload['logo_url']) : $current['logo_url'],
            ':favicon_url' => array_key_exists('favicon_url', $payload) ? $this->normalizeNullableString($payload['favicon_url']) : $current['favicon_url'],
            ':role_permissions' => json_encode(
                is_array($payload['role_permissions'] ?? null) ? $payload['role_permissions'] : $current['role_permissions'],
                JSON_THROW_ON_ERROR
            ),
        ]);

        return $this->get();
    }

    private function createDefault(): void
    {
        $statement = $this->connection->prepare(
            'INSERT INTO app_settings (id, tool_name, role_permissions)
             VALUES (:id, :tool_name, :role_permissions)'
        );

        $statement->execute([
            ':id' => self::DEFAULT_ID,
            ':tool_name' => 'Project Lara',
            ':role_permissions' => json_encode($this->defaultRolePermissions(), JSON_THROW_ON_ERROR),
        ]);
    }

    private function decodeRolePermissions(mixed $value): array
    {
        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        if (is_array($value)) {
            return $value;
        }

        return $this->defaultRolePermissions();
    }

    private function normalizeNullableString(mixed $value): ?string
    {
        $normalized = trim((string) $value);
        return $normalized !== '' ? $normalized : null;
    }

    private function defaultRolePermissions(): array
    {
        return [
            'admin' => [
                'dashboard_list' => true,
                'dashboard_create' => true,
                'builder' => true,
                'constructor' => true,
                'manage_data_sources' => true,
                'manage_schema' => true,
                'admin_settings' => true,
            ],
            'standard' => [
                'dashboard_list' => true,
                'dashboard_create' => true,
                'builder' => true,
                'constructor' => true,
                'manage_data_sources' => false,
                'manage_schema' => false,
                'admin_settings' => false,
            ],
            'viewer' => [
                'dashboard_list' => true,
                'dashboard_create' => false,
                'builder' => false,
                'constructor' => false,
                'manage_data_sources' => false,
                'manage_schema' => false,
                'admin_settings' => false,
            ],
        ];
    }
}
