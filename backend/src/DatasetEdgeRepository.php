<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class DatasetEdgeRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function listForDefinition(int $datasetDefinitionId): array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_edges WHERE dataset_definition_id = :dataset_definition_id ORDER BY id ASC');
        $statement->execute([':dataset_definition_id' => $datasetDefinitionId]);

        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_edges WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ?: null;
    }

    public function create(array $payload): array
    {
        $statement = $this->connection->prepare(
            'INSERT INTO dataset_edges (dataset_definition_id, from_node_id, to_node_id, join_type, from_field, to_field) VALUES (:dataset_definition_id, :from_node_id, :to_node_id, :join_type, :from_field, :to_field)'
        );
        $statement->execute([
            ':dataset_definition_id' => (int) $payload['dataset_definition_id'],
            ':from_node_id' => (int) $payload['from_node_id'],
            ':to_node_id' => (int) $payload['to_node_id'],
            ':join_type' => (string) ($payload['join_type'] ?? 'left'),
            ':from_field' => trim((string) $payload['from_field']),
            ':to_field' => trim((string) $payload['to_field']),
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
            'UPDATE dataset_edges SET from_node_id = :from_node_id, to_node_id = :to_node_id, join_type = :join_type, from_field = :from_field, to_field = :to_field, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute([
            ':id' => $id,
            ':from_node_id' => (int) ($payload['from_node_id'] ?? $existing['from_node_id']),
            ':to_node_id' => (int) ($payload['to_node_id'] ?? $existing['to_node_id']),
            ':join_type' => (string) ($payload['join_type'] ?? $existing['join_type']),
            ':from_field' => trim((string) ($payload['from_field'] ?? $existing['from_field'])),
            ':to_field' => trim((string) ($payload['to_field'] ?? $existing['to_field'])),
        ]);

        return $this->find($id);
    }

    public function delete(int $id): bool
    {
        $statement = $this->connection->prepare('DELETE FROM dataset_edges WHERE id = :id');

        return $statement->execute([':id' => $id]);
    }
}
