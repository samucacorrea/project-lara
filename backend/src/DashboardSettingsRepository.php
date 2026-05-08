<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;

final class DashboardSettingsRepository
{
    private const DEFAULT_ID = 1;

    public function __construct(private readonly PDO $connection)
    {
    }

    public function get(): array
    {
        $statement = $this->connection->prepare('SELECT * FROM dashboards WHERE id = :id');
        $statement->execute([':id' => self::DEFAULT_ID]);

        $record = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$record) {
            $this->createDefault();
            $record = $this->get();
        }

        if (isset($record['global_filter']) && is_string($record['global_filter'])) {
            $record['global_filter'] = json_decode($record['global_filter'], true, 512, JSON_THROW_ON_ERROR);
        }

        $record['date_filter_visible'] = (bool) $record['date_filter_visible'];

        return $record;
    }

    public function update(array $payload): array
    {
        $sql = <<<'SQL'
            UPDATE dashboards
               SET name = :name,
                   data_source_id = :data_source_id,
                   global_filter = :global_filter,
                   date_filter_visible = :date_filter_visible,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = :id
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':id' => self::DEFAULT_ID,
            ':name' => $payload['name'] ?? null,
            ':data_source_id' => $payload['data_source_id'] ?? null,
            ':global_filter' => isset($payload['global_filter'])
                ? json_encode($payload['global_filter'], JSON_THROW_ON_ERROR)
                : null,
            ':date_filter_visible' => isset($payload['date_filter_visible']) && $payload['date_filter_visible'] ? 1 : 0,
        ]);

        return $this->get();
    }

    private function createDefault(): void
    {
        $sql = <<<'SQL'
            INSERT INTO dashboards (id, name, data_source_id, global_filter, date_filter_visible)
            VALUES (:id, :name, :data_source_id, :global_filter, :date_filter_visible)
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':id' => self::DEFAULT_ID,
            ':name' => 'Dashboard Principal',
            ':data_source_id' => null,
            ':global_filter' => json_encode([
                'preset' => 'last30',
                'dateRange' => [
                    'start' => date('Y-m-d', strtotime('-29 days')),
                    'end' => date('Y-m-d'),
                ],
                'dimensionFilter' => [
                    'dimension' => 'campaign',
                    'value' => 'all',
                ],
            ], JSON_THROW_ON_ERROR),
            ':date_filter_visible' => 1,
        ]);
    }
}
