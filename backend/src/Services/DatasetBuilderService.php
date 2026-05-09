<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use PDO;
use ProjectLara\DatasetDefinitionRepository;
use ProjectLara\DatasetEdgeRepository;
use ProjectLara\DatasetNodeRepository;
use ProjectLara\DatasetSelectedColumnRepository;
use ProjectLara\Logger;
use ProjectLara\SourceDatasetRepository;

final class DatasetBuilderService
{
    public function __construct(
        private readonly PDO $appConnection,
        private readonly DatasetDefinitionRepository $datasetDefinitionRepository,
        private readonly DatasetNodeRepository $datasetNodeRepository,
        private readonly DatasetEdgeRepository $datasetEdgeRepository,
        private readonly DatasetSelectedColumnRepository $datasetSelectedColumnRepository,
        private readonly SourceDatasetRepository $sourceDatasetRepository,
        private readonly WarehouseService $warehouseService
    ) {
    }

    public function preview(int $datasetDefinitionId, int $limit = 20): array
    {
        $compiled = $this->compile($datasetDefinitionId);
        $safeLimit = max(1, min($limit, 200));
        $sql = $compiled['sql'] . sprintf(' LIMIT %d', $safeLimit);

        $statement = $this->warehouseService->connection()->query($sql);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

        return [
            'dataset' => $compiled['dataset'],
            'sql' => $sql,
            'columns' => array_map(
                static fn (array $column): array => [
                    'output_column' => $column['output_column'],
                    'source_column' => $column['source_column'],
                    'semantic_type' => $column['semantic_type'] ?? null,
                    'aggregation_type' => $column['aggregation_type'] ?? 'none',
                    'is_dimension' => (bool) ($column['is_dimension'] ?? false),
                    'is_metric' => (bool) ($column['is_metric'] ?? false),
                ],
                $compiled['columns']
            ),
            'rows' => $rows,
            'row_count' => count($rows),
        ];
    }

    public function publish(int $datasetDefinitionId): array
    {
        $compiled = $this->compile($datasetDefinitionId);
        $dataset = $compiled['dataset'];
        $warehouseSchema = (string) ($dataset['warehouse_schema'] ?? 'derived');
        $warehouseTable = trim((string) ($dataset['warehouse_table'] ?? ''));

        if ($warehouseTable === '') {
            throw new InvalidArgumentException('Defina warehouse_table para publicar a base derivada.');
        }

        $this->warehouseService->ensureBaseSchemas();
        $qualifiedTable = $this->warehouseService->qualifyTable($warehouseSchema, $warehouseTable);
        $connection = $this->warehouseService->connection();

        $materializationId = $this->startMaterialization($datasetDefinitionId, $warehouseSchema, $warehouseTable, $compiled['sql']);
        $startedAt = microtime(true);

        try {
            $connection->beginTransaction();
            $connection->exec(sprintf('DROP TABLE IF EXISTS %s', $qualifiedTable));
            $connection->exec(sprintf('CREATE TABLE %s AS %s', $qualifiedTable, $compiled['sql']));

            $countStatement = $connection->query(sprintf('SELECT COUNT(*) AS total FROM %s', $qualifiedTable));
            $rowCount = (int) ($countStatement->fetchColumn() ?: 0);
            $connection->commit();

            $this->finishMaterialization($materializationId, 'success', $rowCount, null);
            $updated = $this->datasetDefinitionRepository->update($datasetDefinitionId, [
                'status' => 'published',
                'version' => ((int) ($dataset['version'] ?? 1)) + 1,
            ]);

            Logger::write('dataset_publish', [
                'dataset_definition_id' => $datasetDefinitionId,
                'warehouse_schema' => $warehouseSchema,
                'warehouse_table' => $warehouseTable,
                'row_count' => $rowCount,
                'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
            ]);

            return [
                'status' => 'success',
                'dataset' => $updated,
                'warehouse_schema' => $warehouseSchema,
                'warehouse_table' => $warehouseTable,
                'row_count' => $rowCount,
                'sql' => $compiled['sql'],
            ];
        } catch (\Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }

            $this->finishMaterialization($materializationId, 'error', null, $exception->getMessage());
            $this->datasetDefinitionRepository->update($datasetDefinitionId, ['status' => 'error']);

            throw $exception;
        }
    }

    /**
     * @return array{dataset:array,columns:array<int,array<string,mixed>>,sql:string}
     */
    public function compile(int $datasetDefinitionId): array
    {
        $dataset = $this->datasetDefinitionRepository->find($datasetDefinitionId);
        if (!$dataset) {
            throw new InvalidArgumentException('Base derivada não encontrada.');
        }

        $nodes = $this->datasetNodeRepository->listForDefinition($datasetDefinitionId);
        $edges = $this->datasetEdgeRepository->listForDefinition($datasetDefinitionId);
        $columns = $this->datasetSelectedColumnRepository->listForDefinition($datasetDefinitionId);

        if ($nodes === []) {
            throw new InvalidArgumentException('Adicione ao menos um node na base derivada.');
        }

        if ($columns === []) {
            throw new InvalidArgumentException('Selecione ao menos uma coluna para publicar a base derivada.');
        }

        $nodesById = [];
        foreach ($nodes as $node) {
            $nodesById[(int) $node['id']] = $node;
        }

        $aliases = [];
        foreach ($nodes as $node) {
            $aliases[(int) $node['id']] = 'n' . (int) $node['id'];
        }

        $rootNode = $this->resolveRootNode($nodes, $edges);
        $rootSource = $this->resolveSourceDataset($rootNode);
        $fromClause = sprintf(
            '%s %s',
            $this->warehouseService->qualifyTable((string) $rootSource['warehouse_schema'], (string) $rootSource['warehouse_table']),
            $aliases[(int) $rootNode['id']]
        );

        $joinedNodeIds = [(int) $rootNode['id'] => true];
        $pendingEdges = $edges;
        $joinClauses = [];

        while ($pendingEdges !== []) {
            $appliedInPass = false;

            foreach ($pendingEdges as $index => $edge) {
                $fromNodeId = (int) $edge['from_node_id'];
                $toNodeId = (int) $edge['to_node_id'];

                if (!isset($joinedNodeIds[$fromNodeId]) || isset($joinedNodeIds[$toNodeId])) {
                    continue;
                }

                $toNode = $nodesById[$toNodeId] ?? null;
                if (!$toNode) {
                    throw new InvalidArgumentException('Node de destino não encontrado para um dos joins.');
                }

                $toSource = $this->resolveSourceDataset($toNode);
                $joinClauses[] = sprintf(
                    '%s JOIN %s %s ON %s.%s = %s.%s',
                    strtoupper((string) $edge['join_type']),
                    $this->warehouseService->qualifyTable((string) $toSource['warehouse_schema'], (string) $toSource['warehouse_table']),
                    $aliases[$toNodeId],
                    $aliases[$fromNodeId],
                    $this->warehouseService->quoteIdentifier((string) $edge['from_field']),
                    $aliases[$toNodeId],
                    $this->warehouseService->quoteIdentifier((string) $edge['to_field'])
                );

                $joinedNodeIds[$toNodeId] = true;
                unset($pendingEdges[$index]);
                $appliedInPass = true;
            }

            if (!$appliedInPass) {
                throw new InvalidArgumentException('Não foi possível resolver todos os joins. Verifique se o grafo está conectado a partir de um node raiz.');
            }
        }

        foreach ($nodes as $node) {
            if (!isset($joinedNodeIds[(int) $node['id']])) {
                throw new InvalidArgumentException('Todos os nodes precisam estar conectados à base principal antes da publicação.');
            }
        }

        $selects = [];
        foreach ($columns as $column) {
            $nodeId = (int) $column['node_id'];
            if (!isset($nodesById[$nodeId])) {
                throw new InvalidArgumentException('Uma coluna selecionada referencia um node inexistente.');
            }

            $selects[] = sprintf(
                '%s.%s AS %s',
                $aliases[$nodeId],
                $this->warehouseService->quoteIdentifier((string) $column['source_column']),
                $this->warehouseService->quoteIdentifier((string) $column['output_column'])
            );
        }

        $sql = sprintf(
            'SELECT %s FROM %s %s',
            implode(', ', $selects),
            $fromClause,
            $joinClauses !== [] ? ' ' . implode(' ', $joinClauses) : ''
        );

        return [
            'dataset' => $dataset,
            'columns' => $columns,
            'sql' => trim($sql),
        ];
    }

    private function resolveRootNode(array $nodes, array $edges): array
    {
        $incoming = [];
        foreach ($edges as $edge) {
            $incoming[(int) $edge['to_node_id']] = true;
        }

        foreach ($nodes as $node) {
            if (!isset($incoming[(int) $node['id']])) {
                return $node;
            }
        }

        return $nodes[0];
    }

    private function resolveSourceDataset(array $node): array
    {
        $sourceDatasetId = isset($node['source_dataset_id']) ? (int) $node['source_dataset_id'] : 0;
        if ($sourceDatasetId <= 0) {
            throw new InvalidArgumentException(sprintf('Node "%s" não possui source_dataset_id configurado.', (string) ($node['label'] ?? '')));
        }

        $sourceDataset = $this->sourceDatasetRepository->find($sourceDatasetId);
        if (!$sourceDataset) {
            throw new InvalidArgumentException(sprintf('Source dataset %d não encontrado.', $sourceDatasetId));
        }

        return $sourceDataset;
    }

    private function startMaterialization(int $datasetDefinitionId, string $schema, string $table, string $sql): int
    {
        $statement = $this->appConnection->prepare(
            'INSERT INTO dataset_materializations (dataset_definition_id, status, warehouse_schema, warehouse_table, sql_hash, started_at) VALUES (:dataset_definition_id, :status, :warehouse_schema, :warehouse_table, :sql_hash, NOW())'
        );
        $statement->execute([
            ':dataset_definition_id' => $datasetDefinitionId,
            ':status' => 'running',
            ':warehouse_schema' => $schema,
            ':warehouse_table' => $table,
            ':sql_hash' => hash('sha256', $sql),
        ]);

        return (int) $this->appConnection->lastInsertId();
    }

    private function finishMaterialization(int $materializationId, string $status, ?int $rowCount, ?string $errorMessage): void
    {
        $statement = $this->appConnection->prepare(
            'UPDATE dataset_materializations SET status = :status, row_count = :row_count, error_message = :error_message, finished_at = NOW() WHERE id = :id'
        );
        $statement->execute([
            ':id' => $materializationId,
            ':status' => $status,
            ':row_count' => $rowCount,
            ':error_message' => $errorMessage,
        ]);
    }
}
