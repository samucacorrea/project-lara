<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use PDO;
use PDOException;
use ProjectLara\DataSourceRepository;
use ProjectLara\Logger;

final class DataSourceInspector
{
    public function __construct(
        private readonly DataSourceRepository $repository,
        private readonly GoogleSheetsService $sheetsService,
        private readonly BigQueryService $bigQueryService
    ) {
    }

    /**
     * @return array<int, array{name: string}>
     */
    public function listTables(int $dataSourceId): array
    {
        $dataSource = $this->loadDataSource($dataSourceId);
        if (($dataSource['type'] ?? '') === 'google_sheets') {
            $config = $dataSource['config'] ?? [];
            $worksheets = $config['worksheets'] ?? [];
            if (is_array($worksheets) && $worksheets !== []) {
                return array_map(
                    static fn (string $sheet): array => ['name' => $sheet],
                    array_values(array_filter($worksheets, static fn ($sheet) => is_string($sheet) && $sheet !== ''))
                );
            }
            $worksheet = $this->requireConfig($dataSource, 'worksheet');
            return [
                ['name' => $worksheet],
            ];
        }

        if (($dataSource['type'] ?? '') === 'bigquery') {
            $config = $dataSource['config'] ?? [];
            try {
                return $this->bigQueryService->listTables($config);
            } catch (InvalidArgumentException $exception) {
                Logger::write('bigquery_list_tables_error', [
                    'message' => $exception->getMessage(),
                    'data_source' => $dataSource['id'] ?? null,
                ]);
                throw $exception;
            }
        }

        $pdo = $this->createConnection($dataSource);

        $database = $this->requireConfig($dataSource, 'database');

        $sql = <<<'SQL'
            SELECT TABLE_NAME
              FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = :schema
             ORDER BY TABLE_NAME
        SQL;

        $statement = $pdo->prepare($sql);
        $statement->execute([':schema' => $database]);

        return array_map(
            static fn (array $row): array => ['name' => $row['TABLE_NAME']],
            $statement->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    /**
     * @return array<int, array{name: string, type: string}>
     */
    public function listColumns(int $dataSourceId, string $tableName): array
    {
        $dataSource = $this->loadDataSource($dataSourceId);
        if (($dataSource['type'] ?? '') === 'google_sheets') {
            $config = $dataSource['config'] ?? [];
            if ($tableName !== '' && $tableName !== ($config['worksheet'] ?? '')) {
                $config['worksheet'] = $tableName;
            }

            try {
                $sheet = $this->sheetsService->fetch($config, 50);
            } catch (InvalidArgumentException $exception) {
                Logger::write('google_sheets_fetch_error', [
                    'message' => $exception->getMessage(),
                    'table' => $tableName,
                    'spreadsheet' => $config['spreadsheet_id'] ?? null,
                ]);
                throw $exception;
            } catch (\Throwable $exception) {
                Logger::write('google_sheets_fetch_error', [
                    'message' => $exception->getMessage(),
                    'table' => $tableName,
                    'spreadsheet' => $config['spreadsheet_id'] ?? null,
                    'trace' => $exception->getTraceAsString(),
                ]);
                throw new InvalidArgumentException('Falha ao acessar o Google Sheets. Confira se a planilha está pública e tente novamente.');
            }

            return $this->mapGoogleColumns($sheet['headers'], $sheet['rows']);
        }

        if (($dataSource['type'] ?? '') === 'bigquery') {
            $config = $dataSource['config'] ?? [];
            try {
                return $this->bigQueryService->listColumns($config, $tableName);
            } catch (InvalidArgumentException $exception) {
                Logger::write('bigquery_list_columns_error', [
                    'message' => $exception->getMessage(),
                    'table' => $tableName,
                    'data_source' => $dataSource['id'] ?? null,
                ]);
                throw $exception;
            }
        }

        $pdo = $this->createConnection($dataSource);
        $database = $this->requireConfig($dataSource, 'database');

        $sql = <<<'SQL'
            SELECT COLUMN_NAME, DATA_TYPE
              FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = :schema
               AND TABLE_NAME = :table
             ORDER BY ORDINAL_POSITION
        SQL;

        $statement = $pdo->prepare($sql);
        $statement->execute([
            ':schema' => $database,
            ':table' => $tableName,
        ]);

        return array_map(
            static fn (array $row): array => [
                'name' => $row['COLUMN_NAME'],
                'type' => $row['DATA_TYPE'],
            ],
            $statement->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    private function loadDataSource(int $dataSourceId): array
    {
        $dataSource = $this->repository->find($dataSourceId);
        if (!$dataSource) {
            throw new InvalidArgumentException('Fonte de dados não encontrada.');
        }

        return $dataSource;
    }

    public function createConnection(array $dataSource): PDO
    {
        if (($dataSource['type'] ?? '') !== 'mysql') {
            throw new InvalidArgumentException('Apenas fontes MySQL possuem exploração de schema neste momento.');
        }

        $config = $dataSource['config'] ?? [];

        foreach (['host', 'database', 'username', 'password'] as $key) {
            if (!isset($config[$key]) || $config[$key] === '') {
                throw new InvalidArgumentException(sprintf('Configuração incompleta: campo %s ausente.', $key));
            }
        }

        $host = (string) $config['host'];
        $database = (string) $config['database'];
        $username = (string) $config['username'];
        $password = (string) $config['password'];
        $port = isset($config['port']) ? (int) $config['port'] : 3306;

        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $database);

        try {
            return new PDO(
                $dsn,
                $username,
                $password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]
            );
        } catch (PDOException $exception) {
            throw new InvalidArgumentException(
                sprintf('Falha ao conectar no banco %s: %s', $database, $exception->getMessage())
            );
        }
    }

    private function requireConfig(array $dataSource, string $field): string
    {
        $config = $dataSource['config'] ?? [];
        if (!isset($config[$field]) || $config[$field] === '') {
            throw new InvalidArgumentException(sprintf('Configuração %s ausente.', $field));
        }

        return (string) $config[$field];
    }

    /**
     * @return array<int, array{name: string, type: string}>
     */
    private function mapGoogleColumns(array $headers, array $rows): array
    {
        $columns = [];
        foreach ($headers as $header) {
            $columns[] = [
                'name' => $header,
                'type' => $this->guessGoogleType($header, $rows),
            ];
        }

        return $columns;
    }

    private function guessGoogleType(string $column, array $rows): string
    {
        foreach ($rows as $row) {
            if (!isset($row[$column])) {
                continue;
            }
            $value = trim((string) $row[$column]);
            if ($value === '') {
                continue;
            }
            if ($this->isNumericValue($value)) {
                return 'double';
            }

            if ($this->isDateValue($value)) {
                return 'date';
            }
        }

        return 'string';
    }

    private function isNumericValue(string $value): bool
    {
        $normalized = str_replace(["\u{00A0}", ' '], '', trim($value));
        $normalized = str_replace(',', '.', $normalized);
        if ($normalized === '') {
            return false;
        }

        return is_numeric($normalized);
    }

    private function isDateValue(string $value): bool
    {
        $patterns = ['Y-m-d', 'd/m/Y', 'm/d/Y', 'd/m/y', 'm/d/y'];
        foreach ($patterns as $pattern) {
            $date = \DateTimeImmutable::createFromFormat($pattern, $value);
            if ($date instanceof \DateTimeImmutable) {
                return true;
            }
        }

        return false;
    }
}
