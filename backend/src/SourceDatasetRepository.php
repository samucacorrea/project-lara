<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class SourceDatasetRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function all(): array
    {
        $statement = $this->connection->query('SELECT * FROM source_datasets ORDER BY id DESC');

        return array_map(
            fn (array $record): array => $this->hydrate($record),
            $statement->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    public function find(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM source_datasets WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ? $this->hydrate($record) : null;
    }

    public function findBySlug(string $slug): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM source_datasets WHERE slug = :slug LIMIT 1');
        $statement->execute([':slug' => $slug]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ? $this->hydrate($record) : null;
    }

    public function listForSource(string $sourceKind, int $sourceRefId): array
    {
        $statement = $this->connection->prepare(
            'SELECT * FROM source_datasets WHERE source_kind = :source_kind AND source_ref_id = :source_ref_id ORDER BY id DESC'
        );
        $statement->execute([
            ':source_kind' => $sourceKind,
            ':source_ref_id' => $sourceRefId,
        ]);

        return array_map(
            fn (array $record): array => $this->hydrate($record),
            $statement->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    public function create(array $payload): array
    {
        $statement = $this->connection->prepare(
            'INSERT INTO source_datasets (source_kind, source_ref_id, account_ref_id, name, slug, dataset_type, grain, warehouse_schema, warehouse_table, primary_date_field, status, field_catalog_json) VALUES (:source_kind, :source_ref_id, :account_ref_id, :name, :slug, :dataset_type, :grain, :warehouse_schema, :warehouse_table, :primary_date_field, :status, :field_catalog_json)'
        );
        $statement->execute([
            ':source_kind' => (string) $payload['source_kind'],
            ':source_ref_id' => (int) $payload['source_ref_id'],
            ':account_ref_id' => isset($payload['account_ref_id']) ? (int) $payload['account_ref_id'] : null,
            ':name' => trim((string) $payload['name']),
            ':slug' => trim((string) $payload['slug']),
            ':dataset_type' => (string) ($payload['dataset_type'] ?? 'raw'),
            ':grain' => $payload['grain'] ?? null,
            ':warehouse_schema' => (string) ($payload['warehouse_schema'] ?? 'raw'),
            ':warehouse_table' => (string) $payload['warehouse_table'],
            ':primary_date_field' => $payload['primary_date_field'] ?? null,
            ':status' => (string) ($payload['status'] ?? 'ready'),
            ':field_catalog_json' => $this->encodeJson($payload['field_catalog_json'] ?? null),
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
            'UPDATE source_datasets SET source_kind = :source_kind, source_ref_id = :source_ref_id, account_ref_id = :account_ref_id, name = :name, slug = :slug, dataset_type = :dataset_type, grain = :grain, warehouse_schema = :warehouse_schema, warehouse_table = :warehouse_table, primary_date_field = :primary_date_field, status = :status, field_catalog_json = :field_catalog_json, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute([
            ':id' => $id,
            ':source_kind' => (string) ($payload['source_kind'] ?? $existing['source_kind']),
            ':source_ref_id' => (int) ($payload['source_ref_id'] ?? $existing['source_ref_id']),
            ':account_ref_id' => array_key_exists('account_ref_id', $payload)
                ? ($payload['account_ref_id'] !== null ? (int) $payload['account_ref_id'] : null)
                : $existing['account_ref_id'],
            ':name' => trim((string) ($payload['name'] ?? $existing['name'])),
            ':slug' => trim((string) ($payload['slug'] ?? $existing['slug'])),
            ':dataset_type' => (string) ($payload['dataset_type'] ?? $existing['dataset_type']),
            ':grain' => $payload['grain'] ?? $existing['grain'],
            ':warehouse_schema' => (string) ($payload['warehouse_schema'] ?? $existing['warehouse_schema']),
            ':warehouse_table' => (string) ($payload['warehouse_table'] ?? $existing['warehouse_table']),
            ':primary_date_field' => $payload['primary_date_field'] ?? $existing['primary_date_field'],
            ':status' => (string) ($payload['status'] ?? $existing['status']),
            ':field_catalog_json' => $this->encodeJson($payload['field_catalog_json'] ?? $existing['field_catalog_json'] ?? null),
        ]);

        return $this->find($id);
    }

    public function delete(int $id): bool
    {
        $statement = $this->connection->prepare('DELETE FROM source_datasets WHERE id = :id');

        return $statement->execute([':id' => $id]);
    }

    private function hydrate(array $record): array
    {
        $record['id'] = (int) $record['id'];
        $record['source_ref_id'] = (int) $record['source_ref_id'];
        $record['account_ref_id'] = isset($record['account_ref_id']) ? (int) $record['account_ref_id'] : null;

        if (isset($record['field_catalog_json']) && is_string($record['field_catalog_json'])) {
            $record['field_catalog_json'] = $this->decodeJson($record['field_catalog_json']);
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
