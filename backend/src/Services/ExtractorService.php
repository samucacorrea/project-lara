<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use PDO;
use ProjectLara\ExtractorConnectorRepository;
use ProjectLara\ExtractorJobRepository;
use ProjectLara\Logger;

final class ExtractorService
{
    public function __construct(
        private readonly PDO $connection,
        private readonly ExtractorConnectorRepository $connectorRepository,
        private readonly ExtractorJobRepository $jobRepository
    ) {
    }

    public function runConnector(int $connectorId, ?int $requestedBy = null): array
    {
        $connector = $this->connectorRepository->find($connectorId);
        $table = $this->sanitizeTableName($connector['target_table']);
        if ($table === null) {
            throw new InvalidArgumentException('Nome da tabela alvo inválido. Utilize apenas letras, números e _.');
        }

        $job = $this->jobRepository->create([
            'connector_id' => $connectorId,
            'status' => 'running',
            'target_table' => $table,
            'requested_by' => $requestedBy,
            'started_at' => date('Y-m-d H:i:s'),
        ]);

        try {
            $this->ensureStorageTable($table);
            $rows = $this->fetchProviderData($connector);
            $rowsInserted = $this->storeRows($table, $job['id'], $connectorId, $rows);

            $job = $this->jobRepository->update($job['id'], [
                'status' => 'completed',
                'rows_processed' => $rowsInserted,
                'finished_at' => date('Y-m-d H:i:s'),
            ]);

            $this->connectorRepository->update($connectorId, [
                'name' => $connector['name'],
                'provider' => $connector['provider'],
                'auth_type' => $connector['auth_type'],
                'config' => $connector['config'],
                'target_table' => $connector['target_table'],
                'status' => $connector['status'],
                'last_synced_at' => date('Y-m-d H:i:s'),
            ]);

            Logger::write('extractor_job', [
                'connector_id' => $connectorId,
                'job_id' => $job['id'],
                'provider' => $connector['provider'],
                'rows' => $rowsInserted,
            ]);

            return $job;
        } catch (\Throwable $exception) {
            $this->jobRepository->update($job['id'], [
                'status' => 'failed',
                'error_message' => $exception->getMessage(),
                'finished_at' => date('Y-m-d H:i:s'),
            ]);

            Logger::write('extractor_job_failed', [
                'connector_id' => $connectorId,
                'job_id' => $job['id'],
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }

    private function sanitizeTableName(string $tableName): ?string
    {
        $normalized = preg_replace('/[^A-Za-z0-9_]/', '', $tableName);
        if ($normalized === null || $normalized === '') {
            return null;
        }
        return $normalized;
    }

    private function ensureStorageTable(string $table): void
    {
        $sql = sprintf(
            'CREATE TABLE IF NOT EXISTS `%s` (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                job_id BIGINT UNSIGNED NOT NULL,
                connector_id BIGINT UNSIGNED NOT NULL,
                payload JSON NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_job (job_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            $table
        );
        $this->connection->exec($sql);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function fetchProviderData(array $connector): array
    {
        $provider = $connector['provider'];
        $config = $connector['config'] ?? [];

        // TODO: plug actual SDKs. For now, return synthetic data for prototyping.
        return match ($provider) {
            'google_ads' => $this->mockGoogleAds($config),
            'google_analytics' => $this->mockGoogleAnalytics($config),
            'meta_ads' => $this->mockMetaAds($config),
            'meta_organic' => $this->mockMetaOrganic($config),
            'tiktok_ads' => $this->mockTiktokAds($config),
            'microsoft_clarity' => $this->mockClarity($config),
            default => $this->mockCustom($config),
        };
    }

    private function storeRows(string $table, int $jobId, int $connectorId, array $rows): int
    {
        if ($rows === []) {
            return 0;
        }

        $sql = sprintf('INSERT INTO `%s` (job_id, connector_id, payload) VALUES (:job_id, :connector_id, :payload)', $table);
        $statement = $this->connection->prepare($sql);
        $inserted = 0;

        foreach ($rows as $row) {
            $statement->execute([
                ':job_id' => $jobId,
                ':connector_id' => $connectorId,
                ':payload' => json_encode($row, JSON_THROW_ON_ERROR),
            ]);
            $inserted++;
        }

        return $inserted;
    }

    private function mockGoogleAds(array $config): array
    {
        return [
            ['campaign' => 'Brand - Search', 'impressions' => 1200, 'clicks' => 130, 'cost' => 340.50, 'currency' => $config['currency'] ?? 'BRL'],
            ['campaign' => 'Acquisition - Display', 'impressions' => 9500, 'clicks' => 320, 'cost' => 780.10, 'currency' => $config['currency'] ?? 'BRL'],
        ];
    }

    private function mockGoogleAnalytics(array $config): array
    {
        return [
            ['date' => date('Y-m-d', strtotime('-1 day')), 'sessions' => 420, 'users' => 380, 'property' => $config['property_id'] ?? 'UA-XXXX'],
            ['date' => date('Y-m-d'), 'sessions' => 450, 'users' => 401, 'property' => $config['property_id'] ?? 'UA-XXXX'],
        ];
    }

    private function mockMetaAds(array $config): array
    {
        return [
            ['adset' => 'Remarketing', 'reach' => 15000, 'spend' => 540.23, 'account' => $config['account_id'] ?? 'act_123'],
            ['adset' => 'Acquisition', 'reach' => 48000, 'spend' => 1400.00, 'account' => $config['account_id'] ?? 'act_123'],
        ];
    }

    private function mockMetaOrganic(array $config): array
    {
        return [
            ['page' => $config['page_id'] ?? 'page_1', 'post_id' => 'abc123', 'likes' => 230, 'comments' => 31],
            ['page' => $config['page_id'] ?? 'page_1', 'post_id' => 'def987', 'likes' => 120, 'comments' => 12],
        ];
    }

    private function mockTiktokAds(array $config): array
    {
        return [
            ['campaign' => 'Launch', 'impressions' => 33000, 'clicks' => 220, 'spend' => 820.75],
            ['campaign' => 'Always On', 'impressions' => 15000, 'clicks' => 110, 'spend' => 310.50],
        ];
    }

    private function mockClarity(array $config): array
    {
        return [
            ['project' => $config['project_id'] ?? 'clarity-project', 'sessions' => 1030, 'rage_clicks' => 3],
            ['project' => $config['project_id'] ?? 'clarity-project', 'sessions' => 980, 'rage_clicks' => 1],
        ];
    }

    private function mockCustom(array $config): array
    {
        return [
            ['payload' => $config],
        ];
    }
}
