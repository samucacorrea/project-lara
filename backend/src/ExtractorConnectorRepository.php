<?php

declare(strict_types=1);

namespace ProjectLara;

use InvalidArgumentException;
use PDO;

final class ExtractorConnectorRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function listAll(): array
    {
        $statement = $this->connection->query('SELECT * FROM extractor_connectors ORDER BY updated_at DESC');
        return array_map(fn (array $record): array => $this->hydrate($record), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function find(int $id): array
    {
        $statement = $this->connection->prepare('SELECT * FROM extractor_connectors WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$record) {
            throw new InvalidArgumentException('Extrator não encontrado.');
        }

        return $this->hydrate($record);
    }

    public function create(array $payload): array
    {
        $sql = <<<'SQL'
            INSERT INTO extractor_connectors (name, provider, auth_type, config, target_table, status)
            VALUES (:name, :provider, :auth_type, :config, :target_table, :status)
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':name' => $payload['name'],
            ':provider' => $payload['provider'],
            ':auth_type' => $payload['auth_type'] ?? 'api_key',
            ':config' => json_encode($payload['config'] ?? [], JSON_THROW_ON_ERROR),
            ':target_table' => $payload['target_table'],
            ':status' => $payload['status'] ?? 'draft',
        ]);

        return $this->find((int) $this->connection->lastInsertId());
    }

    public function update(int $id, array $payload): array
    {
        $sql = <<<'SQL'
            UPDATE extractor_connectors
               SET name = :name,
                   provider = :provider,
                   auth_type = :auth_type,
                   config = :config,
                   target_table = :target_table,
                   status = :status,
                   last_synced_at = :last_synced_at,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = :id
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':id' => $id,
            ':name' => $payload['name'],
            ':provider' => $payload['provider'],
            ':auth_type' => $payload['auth_type'] ?? 'api_key',
            ':config' => json_encode($payload['config'] ?? [], JSON_THROW_ON_ERROR),
            ':target_table' => $payload['target_table'],
            ':status' => $payload['status'] ?? 'draft',
            ':last_synced_at' => $payload['last_synced_at'] ?? null,
        ]);

        return $this->find($id);
    }

    public function delete(int $id): void
    {
        $statement = $this->connection->prepare('DELETE FROM extractor_connectors WHERE id = :id');
        $statement->execute([':id' => $id]);
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
