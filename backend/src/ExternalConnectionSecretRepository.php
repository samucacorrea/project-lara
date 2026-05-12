<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class ExternalConnectionSecretRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function upsert(int $connectionId, string $secretKey, string $secretValue): void
    {
        $statement = $this->connection->prepare(
            'INSERT INTO external_connection_secrets (connection_id, secret_key, secret_value)
             VALUES (:connection_id, :secret_key, :secret_value)
             ON DUPLICATE KEY UPDATE secret_value = VALUES(secret_value), updated_at = CURRENT_TIMESTAMP'
        );

        $statement->execute([
            ':connection_id' => $connectionId,
            ':secret_key' => trim($secretKey),
            ':secret_value' => $secretValue,
        ]);
    }

    public function get(int $connectionId, string $secretKey): ?string
    {
        $statement = $this->connection->prepare(
            'SELECT secret_value FROM external_connection_secrets WHERE connection_id = :connection_id AND secret_key = :secret_key LIMIT 1'
        );
        $statement->execute([
            ':connection_id' => $connectionId,
            ':secret_key' => trim($secretKey),
        ]);

        $value = $statement->fetchColumn();

        return is_string($value) ? $value : null;
    }
}
