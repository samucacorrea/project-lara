<?php

declare(strict_types=1);

namespace ProjectLara;

use InvalidArgumentException;
use PDO;

final class ExtractorJobRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function create(array $payload): array
    {
        $sql = <<<'SQL'
            INSERT INTO extractor_jobs (connector_id, status, target_table, requested_by, rows_processed, error_message, started_at, finished_at)
            VALUES (:connector_id, :status, :target_table, :requested_by, :rows_processed, :error_message, :started_at, :finished_at)
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':connector_id' => $payload['connector_id'],
            ':status' => $payload['status'] ?? 'pending',
            ':target_table' => $payload['target_table'],
            ':requested_by' => $payload['requested_by'] ?? null,
            ':rows_processed' => $payload['rows_processed'] ?? 0,
            ':error_message' => $payload['error_message'] ?? null,
            ':started_at' => $payload['started_at'] ?? null,
            ':finished_at' => $payload['finished_at'] ?? null,
        ]);

        return $this->find((int) $this->connection->lastInsertId());
    }

    public function find(int $id): array
    {
        $statement = $this->connection->prepare('SELECT * FROM extractor_jobs WHERE id = :id');
        $statement->execute([':id' => $id]);
        $job = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$job) {
            throw new InvalidArgumentException('Job não encontrado.');
        }
        return $job;
    }

    public function listForConnector(int $connectorId, int $limit = 25): array
    {
        $statement = $this->connection->prepare('SELECT * FROM extractor_jobs WHERE connector_id = :connector ORDER BY id DESC LIMIT :limit');
        $statement->bindValue(':connector', $connectorId, PDO::PARAM_INT);
        $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
        $statement->execute();
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    public function update(int $id, array $payload): array
    {
        $fields = [];
        $params = [':id' => $id];

        foreach (['status','target_table','requested_by','rows_processed','error_message','started_at','finished_at'] as $field) {
            if (array_key_exists($field, $payload)) {
                $fields[] = sprintf('%s = :%s', $field, $field);
                $params[':' . $field] = $payload[$field];
            }
        }

        if ($fields === []) {
            return $this->find($id);
        }

        $sql = sprintf('UPDATE extractor_jobs SET %s WHERE id = :id', implode(', ', $fields));
        $statement = $this->connection->prepare($sql);
        $statement->execute($params);

        return $this->find($id);
    }
}
