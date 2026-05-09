<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class DatasetNodeRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function listForDefinition(int $datasetDefinitionId): array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_nodes WHERE dataset_definition_id = :dataset_definition_id ORDER BY id ASC');
        $statement->execute([':dataset_definition_id' => $datasetDefinitionId]);

        return array_map(
            fn (array $record): array => $this->hydrate($record),
            $statement->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    public function find(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_nodes WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ? $this->hydrate($record) : null;
    }

    public function create(array $payload): array
    {
        $statement = $this->connection->prepare(
            'INSERT INTO dataset_nodes (dataset_definition_id, node_type, source_dataset_id, label, pos_x, pos_y, config_json) VALUES (:dataset_definition_id, :node_type, :source_dataset_id, :label, :pos_x, :pos_y, :config_json)'
        );
        $statement->execute([
            ':dataset_definition_id' => (int) $payload['dataset_definition_id'],
            ':node_type' => (string) ($payload['node_type'] ?? 'source'),
            ':source_dataset_id' => isset($payload['source_dataset_id']) ? (int) $payload['source_dataset_id'] : null,
            ':label' => trim((string) $payload['label']),
            ':pos_x' => (float) ($payload['pos_x'] ?? 0),
            ':pos_y' => (float) ($payload['pos_y'] ?? 0),
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
            'UPDATE dataset_nodes SET node_type = :node_type, source_dataset_id = :source_dataset_id, label = :label, pos_x = :pos_x, pos_y = :pos_y, config_json = :config_json, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute([
            ':id' => $id,
            ':node_type' => (string) ($payload['node_type'] ?? $existing['node_type']),
            ':source_dataset_id' => array_key_exists('source_dataset_id', $payload)
                ? ($payload['source_dataset_id'] !== null ? (int) $payload['source_dataset_id'] : null)
                : $existing['source_dataset_id'],
            ':label' => trim((string) ($payload['label'] ?? $existing['label'])),
            ':pos_x' => (float) ($payload['pos_x'] ?? $existing['pos_x']),
            ':pos_y' => (float) ($payload['pos_y'] ?? $existing['pos_y']),
            ':config_json' => $this->encodeJson($payload['config_json'] ?? $existing['config_json'] ?? null),
        ]);

        return $this->find($id);
    }

    public function delete(int $id): bool
    {
        $statement = $this->connection->prepare('DELETE FROM dataset_nodes WHERE id = :id');

        return $statement->execute([':id' => $id]);
    }

    private function hydrate(array $record): array
    {
        $record['id'] = (int) $record['id'];
        $record['dataset_definition_id'] = (int) $record['dataset_definition_id'];
        $record['source_dataset_id'] = isset($record['source_dataset_id']) ? (int) $record['source_dataset_id'] : null;
        $record['pos_x'] = (float) $record['pos_x'];
        $record['pos_y'] = (float) $record['pos_y'];

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
