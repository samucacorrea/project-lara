<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class DatasetDefinitionRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function all(): array
    {
        $statement = $this->connection->query('SELECT * FROM dataset_definitions ORDER BY id DESC');

        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_definitions WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ?: null;
    }

    public function findBySlug(string $slug): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_definitions WHERE slug = :slug LIMIT 1');
        $statement->execute([':slug' => $slug]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ?: null;
    }

    public function listByUser(int $userId): array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_definitions WHERE user_id = :user_id ORDER BY id DESC');
        $statement->execute([':user_id' => $userId]);

        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    public function create(array $payload): array
    {
        $statement = $this->connection->prepare(
            'INSERT INTO dataset_definitions (user_id, name, slug, description, status, warehouse_schema, warehouse_table, primary_date_field, version) VALUES (:user_id, :name, :slug, :description, :status, :warehouse_schema, :warehouse_table, :primary_date_field, :version)'
        );
        $statement->execute([
            ':user_id' => (int) $payload['user_id'],
            ':name' => trim((string) $payload['name']),
            ':slug' => trim((string) $payload['slug']),
            ':description' => $payload['description'] ?? null,
            ':status' => (string) ($payload['status'] ?? 'draft'),
            ':warehouse_schema' => (string) ($payload['warehouse_schema'] ?? 'derived'),
            ':warehouse_table' => $payload['warehouse_table'] ?? null,
            ':primary_date_field' => $payload['primary_date_field'] ?? null,
            ':version' => (int) ($payload['version'] ?? 1),
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
            'UPDATE dataset_definitions SET user_id = :user_id, name = :name, slug = :slug, description = :description, status = :status, warehouse_schema = :warehouse_schema, warehouse_table = :warehouse_table, primary_date_field = :primary_date_field, version = :version, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute([
            ':id' => $id,
            ':user_id' => (int) ($payload['user_id'] ?? $existing['user_id']),
            ':name' => trim((string) ($payload['name'] ?? $existing['name'])),
            ':slug' => trim((string) ($payload['slug'] ?? $existing['slug'])),
            ':description' => $payload['description'] ?? $existing['description'],
            ':status' => (string) ($payload['status'] ?? $existing['status']),
            ':warehouse_schema' => (string) ($payload['warehouse_schema'] ?? $existing['warehouse_schema']),
            ':warehouse_table' => $payload['warehouse_table'] ?? $existing['warehouse_table'],
            ':primary_date_field' => $payload['primary_date_field'] ?? $existing['primary_date_field'],
            ':version' => (int) ($payload['version'] ?? $existing['version']),
        ]);

        return $this->find($id);
    }

    public function delete(int $id): bool
    {
        $statement = $this->connection->prepare('DELETE FROM dataset_definitions WHERE id = :id');

        return $statement->execute([':id' => $id]);
    }
}
