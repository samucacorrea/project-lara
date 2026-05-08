<?php

declare(strict_types=1);

namespace ProjectLara;

use InvalidArgumentException;
use PDO;
use PDOException;

final class CalculatedMetricRepository
{
    private static bool $tableChecked = false;
    private bool $useFallback = false;
    private string $fallbackFile;

    public function __construct(private readonly PDO $connection)
    {
        $this->fallbackFile = dirname(__DIR__) . '/storage/calculated_metrics.json';
        $this->ensureTableExists();
    }

    public function all(): array
    {
        if ($this->useFallback) {
            return $this->readFallback();
        }

        try {
            $statement = $this->connection->query('SELECT * FROM calculated_metrics ORDER BY name ASC');
            return $statement->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $exception) {
            if ($this->isMissingTableError($exception)) {
                $this->switchToFallback();
                return $this->readFallback();
            }
            throw $exception;
        }
    }

    public function find(int $id): array
    {
        if ($this->useFallback) {
            return $this->findFallback($id);
        }

        try {
            $statement = $this->connection->prepare('SELECT * FROM calculated_metrics WHERE id = :id');
            $statement->execute([':id' => $id]);
            $record = $statement->fetch(PDO::FETCH_ASSOC);
            if (!$record) {
                throw new InvalidArgumentException('Métrica calculada não encontrada.');
            }
            return $record;
        } catch (PDOException $exception) {
            if ($this->isMissingTableError($exception)) {
                $this->switchToFallback();
                return $this->findFallback($id);
            }
            throw $exception;
        }
    }

    public function create(array $payload): array
    {
        $data = $this->validatePayload($payload);
        $this->assertUniqueKey($data['metric_key'], $payload['id'] ?? 0);

        if ($this->useFallback) {
            return $this->createFallback($data);
        }

        try {
            $statement = $this->connection->prepare(
                'INSERT INTO calculated_metrics (name, metric_key, formula, output_format) VALUES (:name, :metric_key, :formula, :output_format)'
            );
            $statement->execute([
                ':name' => $data['name'],
                ':metric_key' => $data['metric_key'],
                ':formula' => $data['formula'],
                ':output_format' => $data['output_format'],
            ]);

            $id = (int) $this->connection->lastInsertId();
            return $this->find($id);
        } catch (PDOException $exception) {
            if ($this->isMissingTableError($exception)) {
                $this->switchToFallback();
                return $this->createFallback($data);
            }
            throw $exception;
        }
    }

    public function update(int $id, array $payload): array
    {
        $existing = $this->find($id);
        $data = $this->validatePayload($payload, $existing);
        $this->assertUniqueKey($data['metric_key'], $id);

        if ($this->useFallback) {
            return $this->updateFallback($id, $data);
        }

        try {
            $statement = $this->connection->prepare(
                'UPDATE calculated_metrics SET name = :name, metric_key = :metric_key, formula = :formula, output_format = :output_format, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
            );
            $statement->execute([
                ':name' => $data['name'],
                ':metric_key' => $data['metric_key'],
                ':formula' => $data['formula'],
                ':output_format' => $data['output_format'],
                ':id' => $id,
            ]);

            return $this->find($id);
        } catch (PDOException $exception) {
            if ($this->isMissingTableError($exception)) {
                $this->switchToFallback();
                return $this->updateFallback($id, $data);
            }
            throw $exception;
        }
    }

    public function delete(int $id): void
    {
        if ($this->useFallback) {
            $this->deleteFallback($id);
            return;
        }

        try {
            $statement = $this->connection->prepare('DELETE FROM calculated_metrics WHERE id = :id');
            $statement->execute([':id' => $id]);
        } catch (PDOException $exception) {
            if ($this->isMissingTableError($exception)) {
                $this->switchToFallback();
                $this->deleteFallback($id);
                return;
            }
            throw $exception;
        }
    }

    private function validatePayload(array $payload, array $existing = null): array
    {
        $name = trim((string) ($payload['name'] ?? ($existing['name'] ?? '')));
        if ($name === '') {
            throw new InvalidArgumentException('O nome da métrica é obrigatório.');
        }

        $metricKey = trim((string) ($payload['metric_key'] ?? ($existing['metric_key'] ?? '')));
        if ($metricKey === '') {
            throw new InvalidArgumentException('Defina um identificador para a métrica.');
        }
        $metricKey = strtolower(preg_replace('/[^a-z0-9_]/i', '_', $metricKey));
        $metricKey = preg_replace('/_+/', '_', $metricKey);

        $formula = trim((string) ($payload['formula'] ?? ($existing['formula'] ?? '')));
        if ($formula === '') {
            throw new InvalidArgumentException('Informe a fórmula da métrica.');
        }

        $outputFormat = strtolower((string) ($payload['output_format'] ?? ($existing['output_format'] ?? 'number')));
        $allowedFormats = ['number', 'decimal', 'currency', 'percent'];
        if (!in_array($outputFormat, $allowedFormats, true)) {
            throw new InvalidArgumentException('Tipo de saída inválido para a métrica.');
        }

        return [
            'name' => $name,
            'metric_key' => $metricKey,
            'formula' => $formula,
            'output_format' => $outputFormat,
        ];
    }

    private function ensureTableExists(): void
    {
        if (self::$tableChecked) {
            return;
        }

        try {
            $this->connection->exec(
                <<<SQL
                CREATE TABLE IF NOT EXISTS `calculated_metrics` (
                  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                  `name` VARCHAR(120) NOT NULL,
                  `metric_key` VARCHAR(120) NOT NULL UNIQUE,
                  `formula` TEXT NOT NULL,
                  `output_format` ENUM('number','decimal','currency','percent') NOT NULL DEFAULT 'number',
                  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                SQL
            );

            self::$tableChecked = true;
        } catch (PDOException $exception) {
            if ($this->isMissingTableError($exception)) {
                $this->switchToFallback();
            } else {
                throw $exception;
            }
        }
    }

    private function isMissingTableError(PDOException $exception): bool
    {
        return $exception->getCode() === '42S02' || str_contains(strtolower($exception->getMessage()), 'calculated_metrics');
    }

    private function switchToFallback(): void
    {
        $this->useFallback = true;
        $directory = dirname($this->fallbackFile);
        if (!is_dir($directory)) {
            mkdir($directory, 0777, true);
        }
        if (!is_file($this->fallbackFile)) {
            file_put_contents($this->fallbackFile, '[]');
        }
    }

    private function readFallback(): array
    {
        if (!is_file($this->fallbackFile)) {
            return [];
        }
        $contents = file_get_contents($this->fallbackFile) ?: '[]';
        $decoded = json_decode($contents, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function writeFallback(array $records): void
    {
        file_put_contents(
            $this->fallbackFile,
            json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );
    }

    private function findFallback(int $id): array
    {
        foreach ($this->readFallback() as $metric) {
            if ((int) ($metric['id'] ?? 0) === $id) {
                return $metric;
            }
        }
        throw new InvalidArgumentException('Métrica calculada não encontrada.');
    }

    private function createFallback(array $data): array
    {
        $records = $this->readFallback();
        $nextId = 1;
        foreach ($records as $metric) {
            $nextId = max($nextId, (int) ($metric['id'] ?? 0) + 1);
        }

        $record = [
            'id' => $nextId,
            'name' => $data['name'],
            'metric_key' => $data['metric_key'],
            'formula' => $data['formula'],
            'output_format' => $data['output_format'],
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        ];

        $records[] = $record;
        $this->writeFallback($records);

        return $record;
    }

    private function updateFallback(int $id, array $data): array
    {
        $records = $this->readFallback();
        $updated = null;
        foreach ($records as &$metric) {
            if ((int) ($metric['id'] ?? 0) === $id) {
                $metric = [
                    ...$metric,
                    'name' => $data['name'],
                    'metric_key' => $data['metric_key'],
                    'formula' => $data['formula'],
                    'output_format' => $data['output_format'],
                    'updated_at' => date('Y-m-d H:i:s'),
                ];
                $updated = $metric;
                break;
            }
        }
        unset($metric);

        if (!$updated) {
            throw new InvalidArgumentException('Métrica calculada não encontrada.');
        }

        $this->writeFallback($records);
        return $updated;
    }

    private function deleteFallback(int $id): void
    {
        $records = $this->readFallback();
        $filtered = array_filter($records, fn ($metric) => (int) ($metric['id'] ?? 0) !== $id);
        $this->writeFallback(array_values($filtered));
    }

    private function assertUniqueKey(string $metricKey, int $ignoreId = 0): void
    {
        if ($this->useFallback) {
            foreach ($this->readFallback() as $metric) {
                if (
                    strtolower((string) $metric['metric_key']) === strtolower($metricKey) &&
                    (int) ($metric['id'] ?? 0) !== $ignoreId
                ) {
                    throw new InvalidArgumentException('Já existe uma métrica com este identificador.');
                }
            }
            return;
        }

        $statement = $this->connection->prepare('SELECT COUNT(*) FROM calculated_metrics WHERE metric_key = :key AND id <> :id');
        $statement->execute([
            ':key' => $metricKey,
            ':id' => $ignoreId,
        ]);
        if ((int) $statement->fetchColumn() > 0) {
            throw new InvalidArgumentException('Já existe uma métrica com este identificador.');
        }
    }
}

