<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class DataSourceSchemaRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    /**
     * @return array<string, array{role: string|null, semantic_type: string|null}>
     */
    public function listForTable(int $dataSourceId, string $tableName): array
    {
        $statement = $this->connection->prepare(
            'SELECT column_name, role, semantic_type FROM data_source_schema_overrides WHERE data_source_id = :source AND table_name = :table'
        );
        $statement->execute([
            ':source' => $dataSourceId,
            ':table' => $tableName,
        ]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $map = [];
        foreach ($rows as $row) {
            $column = (string) ($row['column_name'] ?? '');
            if ($column === '') {
                continue;
            }
            $map[strtolower($column)] = [
                'role' => isset($row['role']) ? (string) $row['role'] : null,
                'semantic_type' => isset($row['semantic_type']) ? (string) $row['semantic_type'] : null,
            ];
        }
        return $map;
    }

    /**
     * @param array<int, array{column_name: string, role?: string|null, semantic_type?: string|null}> $columns
     */
    public function replaceForTable(int $dataSourceId, string $tableName, array $columns): void
    {
        $this->connection->beginTransaction();
        try {
            $delete = $this->connection->prepare(
                'DELETE FROM data_source_schema_overrides WHERE data_source_id = :source AND table_name = :table'
            );
            $delete->execute([
                ':source' => $dataSourceId,
                ':table' => $tableName,
            ]);

            if ($columns !== []) {
                $insert = $this->connection->prepare(
                    'INSERT INTO data_source_schema_overrides (data_source_id, table_name, column_name, role, semantic_type)
                     VALUES (:source, :table, :column, :role, :semantic_type)'
                );
                foreach ($columns as $column) {
                    $name = trim((string) ($column['column_name'] ?? ''));
                    if ($name === '') {
                        continue;
                    }
                    $insert->execute([
                        ':source' => $dataSourceId,
                        ':table' => $tableName,
                        ':column' => $name,
                        ':role' => $column['role'] ?? null,
                        ':semantic_type' => $column['semantic_type'] ?? null,
                    ]);
                }
            }

            $this->connection->commit();
        } catch (\Throwable $exception) {
            $this->connection->rollBack();
            throw $exception;
        }
    }
}
