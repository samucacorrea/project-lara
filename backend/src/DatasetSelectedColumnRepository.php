<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class DatasetSelectedColumnRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function listForDefinition(int $datasetDefinitionId): array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_selected_columns WHERE dataset_definition_id = :dataset_definition_id ORDER BY sort_order ASC, id ASC');
        $statement->execute([':dataset_definition_id' => $datasetDefinitionId]);

        return array_map(
            static function (array $record): array {
                $record['id'] = (int) $record['id'];
                $record['dataset_definition_id'] = (int) $record['dataset_definition_id'];
                $record['node_id'] = (int) $record['node_id'];
                $record['is_dimension'] = (bool) $record['is_dimension'];
                $record['is_metric'] = (bool) $record['is_metric'];
                $record['sort_order'] = (int) $record['sort_order'];

                return $record;
            },
            $statement->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    public function find(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM dataset_selected_columns WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        if (!$record) {
            return null;
        }

        $record['id'] = (int) $record['id'];
        $record['dataset_definition_id'] = (int) $record['dataset_definition_id'];
        $record['node_id'] = (int) $record['node_id'];
        $record['is_dimension'] = (bool) $record['is_dimension'];
        $record['is_metric'] = (bool) $record['is_metric'];
        $record['sort_order'] = (int) $record['sort_order'];

        return $record;
    }

    public function create(array $payload): array
    {
        $statement = $this->connection->prepare(
            'INSERT INTO dataset_selected_columns (dataset_definition_id, node_id, source_column, output_column, semantic_type, aggregation_type, is_dimension, is_metric, sort_order) VALUES (:dataset_definition_id, :node_id, :source_column, :output_column, :semantic_type, :aggregation_type, :is_dimension, :is_metric, :sort_order)'
        );
        $statement->execute([
            ':dataset_definition_id' => (int) $payload['dataset_definition_id'],
            ':node_id' => (int) $payload['node_id'],
            ':source_column' => trim((string) $payload['source_column']),
            ':output_column' => trim((string) $payload['output_column']),
            ':semantic_type' => $payload['semantic_type'] ?? null,
            ':aggregation_type' => $payload['aggregation_type'] ?? 'none',
            ':is_dimension' => !empty($payload['is_dimension']) ? 1 : 0,
            ':is_metric' => !empty($payload['is_metric']) ? 1 : 0,
            ':sort_order' => (int) ($payload['sort_order'] ?? 0),
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
            'UPDATE dataset_selected_columns SET node_id = :node_id, source_column = :source_column, output_column = :output_column, semantic_type = :semantic_type, aggregation_type = :aggregation_type, is_dimension = :is_dimension, is_metric = :is_metric, sort_order = :sort_order, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute([
            ':id' => $id,
            ':node_id' => (int) ($payload['node_id'] ?? $existing['node_id']),
            ':source_column' => trim((string) ($payload['source_column'] ?? $existing['source_column'])),
            ':output_column' => trim((string) ($payload['output_column'] ?? $existing['output_column'])),
            ':semantic_type' => $payload['semantic_type'] ?? $existing['semantic_type'],
            ':aggregation_type' => $payload['aggregation_type'] ?? $existing['aggregation_type'],
            ':is_dimension' => array_key_exists('is_dimension', $payload) ? (!empty($payload['is_dimension']) ? 1 : 0) : ($existing['is_dimension'] ? 1 : 0),
            ':is_metric' => array_key_exists('is_metric', $payload) ? (!empty($payload['is_metric']) ? 1 : 0) : ($existing['is_metric'] ? 1 : 0),
            ':sort_order' => (int) ($payload['sort_order'] ?? $existing['sort_order']),
        ]);

        return $this->find($id);
    }

    public function delete(int $id): bool
    {
        $statement = $this->connection->prepare('DELETE FROM dataset_selected_columns WHERE id = :id');

        return $statement->execute([':id' => $id]);
    }
}
