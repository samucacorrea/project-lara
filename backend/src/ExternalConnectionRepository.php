<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class ExternalConnectionRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function all(): array
    {
        $statement = $this->connection->query('SELECT * FROM external_connections ORDER BY id DESC');

        return array_map(
            fn (array $record): array => $this->hydrate($record),
            $statement->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    public function find(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM external_connections WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ? $this->hydrate($record) : null;
    }

    public function create(array $payload): array
    {
        $statement = $this->connection->prepare(
            'INSERT INTO external_connections (user_id, name, provider, status, auth_type, config_json) VALUES (:user_id, :name, :provider, :status, :auth_type, :config_json)'
        );
        $statement->execute([
            ':user_id' => (int) $payload['user_id'],
            ':name' => trim((string) $payload['name']),
            ':provider' => (string) $payload['provider'],
            ':status' => (string) ($payload['status'] ?? 'draft'),
            ':auth_type' => (string) $payload['auth_type'],
            ':config_json' => $this->encodeJson($payload['config_json'] ?? null),
        ]);

        return $this->find((int) $this->connection->lastInsertId()) ?? [];
    }

    public function update(int $id, array $payload): ?array
    {
        $existing = $this->find($id);
        if (!$existing) {
            return null;
        }

        $statement = $this->connection->prepare(
            'UPDATE external_connections SET user_id = :user_id, name = :name, provider = :provider, status = :status, auth_type = :auth_type, config_json = :config_json, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute([
            ':id' => $id,
            ':user_id' => (int) ($payload['user_id'] ?? $existing['user_id']),
            ':name' => trim((string) ($payload['name'] ?? $existing['name'])),
            ':provider' => (string) ($payload['provider'] ?? $existing['provider']),
            ':status' => (string) ($payload['status'] ?? $existing['status']),
            ':auth_type' => (string) ($payload['auth_type'] ?? $existing['auth_type']),
            ':config_json' => $this->encodeJson($payload['config_json'] ?? $existing['config_json'] ?? null),
        ]);

        return $this->find($id);
    }

    public function delete(int $id): bool
    {
        $statement = $this->connection->prepare('DELETE FROM external_connections WHERE id = :id');

        return $statement->execute([':id' => $id]);
    }

    private function hydrate(array $record): array
    {
        $record['id'] = (int) $record['id'];
        $record['user_id'] = (int) $record['user_id'];

        if (isset($record['config_json']) && is_string($record['config_json'])) {
            $record['config_json'] = $this->decodeJson($record['config_json']);
        }

        return $record;
    }

    private function encodeJson(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return json_encode($value, JSON_THROW_ON_ERROR);
    }

    private function decodeJson(string $value): array
    {
        try {
            $decoded = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
            return is_array($decoded) ? $decoded : [];
        } catch (\JsonException) {
            return [];
        }
    }
}
