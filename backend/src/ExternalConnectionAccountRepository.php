<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class ExternalConnectionAccountRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function listByConnection(int $connectionId): array
    {
        $statement = $this->connection->prepare(
            'SELECT * FROM external_connection_accounts WHERE connection_id = :connection_id ORDER BY external_account_name ASC, id ASC'
        );
        $statement->execute([':connection_id' => $connectionId]);

        return array_map(
            fn (array $record): array => $this->hydrate($record),
            $statement->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    public function replaceForConnection(int $connectionId, array $accounts): array
    {
        $delete = $this->connection->prepare('DELETE FROM external_connection_accounts WHERE connection_id = :connection_id');
        $delete->execute([':connection_id' => $connectionId]);

        $insert = $this->connection->prepare(
            'INSERT INTO external_connection_accounts (connection_id, external_account_id, external_account_name, external_account_type, is_selected, metadata_json)
             VALUES (:connection_id, :external_account_id, :external_account_name, :external_account_type, :is_selected, :metadata_json)'
        );

        foreach ($accounts as $account) {
            $insert->execute([
                ':connection_id' => $connectionId,
                ':external_account_id' => trim((string) ($account['external_account_id'] ?? '')),
                ':external_account_name' => trim((string) ($account['external_account_name'] ?? '')),
                ':external_account_type' => $account['external_account_type'] ?? null,
                ':is_selected' => !empty($account['is_selected']) ? 1 : 0,
                ':metadata_json' => json_encode($account['metadata_json'] ?? null, JSON_THROW_ON_ERROR),
            ]);
        }

        return $this->listByConnection($connectionId);
    }

    private function hydrate(array $record): array
    {
        $record['id'] = (int) $record['id'];
        $record['connection_id'] = (int) $record['connection_id'];
        $record['is_selected'] = (bool) $record['is_selected'];

        if (isset($record['metadata_json']) && is_string($record['metadata_json'])) {
            try {
                $record['metadata_json'] = json_decode($record['metadata_json'], true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                $record['metadata_json'] = null;
            }
        }

        return $record;
    }
}
