<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class DataSourceRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function all(): array
    {
        $statement = $this->connection->query('SELECT * FROM data_sources ORDER BY id DESC');

        return array_map(
            fn (array $record): array => $this->hydrate($record),
            $statement->fetchAll()
        );
    }

    public function find(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM data_sources WHERE id = :id');
        $statement->execute([':id' => $id]);

        $record = $statement->fetch();

        return $record ? $this->hydrate($record) : null;
    }

    public function create(array $payload): array
    {
        $sql = <<<'SQL'
            INSERT INTO data_sources (name, type, description, config, credential_reference, owner_id, status)
            VALUES (:name, :type, :description, :config, :credential_reference, :owner_id, :status)
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':name' => $payload['name'],
            ':type' => $payload['type'],
            ':description' => $payload['description'] ?? null,
            ':config' => json_encode($payload['config'], JSON_THROW_ON_ERROR),
            ':credential_reference' => $payload['credential_reference'] ?? null,
            ':owner_id' => $payload['owner_id'] ?? null,
            ':status' => $payload['status'] ?? 'active',
        ]);

        $id = (int) $this->connection->lastInsertId();

        return $this->find($id) ?? [];
    }

    public function update(int $id, array $payload): ?array
    {
        $sql = <<<'SQL'
            UPDATE data_sources
               SET name = :name,
                   type = :type,
                   description = :description,
                   config = :config,
                   credential_reference = :credential_reference,
                   owner_id = :owner_id,
                   status = :status,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = :id
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':id' => $id,
            ':name' => $payload['name'],
            ':type' => $payload['type'],
            ':description' => $payload['description'] ?? null,
            ':config' => json_encode($payload['config'], JSON_THROW_ON_ERROR),
            ':credential_reference' => $payload['credential_reference'] ?? null,
            ':owner_id' => $payload['owner_id'] ?? null,
            ':status' => $payload['status'] ?? 'active',
        ]);

        return $this->find($id);
    }

    public function delete(int $id): bool
    {
        $statement = $this->connection->prepare('DELETE FROM data_sources WHERE id = :id');

        return $statement->execute([':id' => $id]);
    }

    private function hydrate(array $record): array
    {
        if (isset($record['config']) && is_string($record['config'])) {
            try {
                $record['config'] = json_decode($record['config'], true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                $record['config'] = [];
            }
        }

        return $record;
    }
}
