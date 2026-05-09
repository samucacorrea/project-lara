<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use PDO;
use ProjectLara\WarehouseDatabase;

final class WarehouseService
{
    private PDO $connection;

    public function __construct(?PDO $connection = null)
    {
        $this->connection = $connection ?? WarehouseDatabase::connection();
    }

    public function ensureBaseSchemas(): void
    {
        foreach ($this->listManagedSchemas() as $schema) {
            $this->connection->exec(sprintf('CREATE SCHEMA IF NOT EXISTS "%s"', $schema));
        }
    }

    /**
     * @return array{raw:string,derived:string}
     */
    public function getSchemaNames(): array
    {
        return [
            'raw' => getenv('WAREHOUSE_RAW_SCHEMA') ?: 'raw',
            'derived' => getenv('WAREHOUSE_DERIVED_SCHEMA') ?: 'derived',
        ];
    }

    /**
     * @return string[]
     */
    public function listManagedSchemas(): array
    {
        $schemas = array_values($this->getSchemaNames());

        return array_values(array_unique(array_filter($schemas, static fn ($schema) => $schema !== '')));
    }

    public function connection(): PDO
    {
        return $this->connection;
    }

    public function quoteIdentifier(string $identifier): string
    {
        return '"' . str_replace('"', '""', $identifier) . '"';
    }

    public function qualifyTable(string $schema, string $table): string
    {
        return sprintf('%s.%s', $this->quoteIdentifier($schema), $this->quoteIdentifier($table));
    }
}
