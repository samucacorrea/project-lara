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
        $type = (string) ($dataSource['type'] ?? '');
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

        if ($type === 'supabase') {
            $schema = $this->resolveSchema($dataSource);
            $sql = <<<'SQL'
                SELECT table_name
                  FROM information_schema.tables
                 WHERE table_schema = :schema
                   AND table_type = 'BASE TABLE'
                 ORDER BY table_name
            SQL;

            $statement = $pdo->prepare($sql);
            $statement->execute([':schema' => $schema]);

            return array_map(
                static fn (array $row): array => ['name' => $row['table_name']],
                $statement->fetchAll(PDO::FETCH_ASSOC)
            );
        }

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
        $type = (string) ($dataSource['type'] ?? '');
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

            $overrides = $this->resolveGoogleColumnTypeOverrides($config, $config['worksheet'] ?? $tableName);
            return $this->mapGoogleColumns($sheet['headers'], $sheet['rows'], $overrides);
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

        if ($type === 'supabase') {
            $schema = $this->resolveSchema($dataSource);
            $sql = <<<'SQL'
                SELECT column_name, data_type
                  FROM information_schema.columns
                 WHERE table_schema = :schema
                   AND table_name = :table
                 ORDER BY ordinal_position
            SQL;

            $statement = $pdo->prepare($sql);
            $statement->execute([
                ':schema' => $schema,
                ':table' => $tableName,
            ]);

            return array_map(
                static fn (array $row): array => [
                    'name' => $row['column_name'],
                    'type' => $row['data_type'],
                ],
                $statement->fetchAll(PDO::FETCH_ASSOC)
            );
        }

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

    /**
     * @return array<int, array{name: string, type: string}>
     */
    public function previewColumns(array $payload): array
    {
        $type = (string) ($payload['type'] ?? '');
        $config = $payload['config'] ?? [];
        $table = isset($payload['table']) ? trim((string) $payload['table']) : '';

        if (!is_array($config)) {
            throw new InvalidArgumentException('Configuração inválida para inspeção.');
        }

        if ($type !== 'google_sheets') {
            throw new InvalidArgumentException('Pré-visualização suportada apenas para Google Sheets neste momento.');
        }

        if ($table !== '') {
            $config['worksheet'] = $table;
        }

        $sheet = $this->sheetsService->fetch($config, 50);
        $worksheet = (string) ($config['worksheet'] ?? $table);
        $overrides = $this->resolveGoogleColumnTypeOverrides($config, $worksheet);

        return $this->mapGoogleColumns($sheet['headers'], $sheet['rows'], $overrides);
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
        $type = (string) ($dataSource['type'] ?? '');
        if (!in_array($type, ['mysql', 'supabase'], true)) {
            throw new InvalidArgumentException('Apenas fontes MySQL e Supabase possuem exploração de schema neste momento.');
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
        if ($type === 'supabase') {
            $port = isset($config['port']) ? (int) $config['port'] : 5432;
            $sslmode = isset($config['sslmode']) && $config['sslmode'] !== '' ? (string) $config['sslmode'] : 'require';
            $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=%s', $host, $port, $database, $sslmode);
        } else {
            $port = isset($config['port']) ? (int) $config['port'] : 3306;
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $database);
        }

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

    private function resolveSchema(array $dataSource): string
    {
        $config = $dataSource['config'] ?? [];
        $schema = isset($config['schema']) ? trim((string) $config['schema']) : '';
        return $schema !== '' ? $schema : 'public';
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
    private function mapGoogleColumns(array $headers, array $rows, array $overrides = []): array
    {
        $columns = [];
        foreach ($headers as $header) {
            $override = $overrides[strtolower($header)] ?? null;
            $columns[] = [
                'name' => $header,
                'type' => is_string($override) && $override !== '' ? strtolower($override) : $this->guessGoogleType($header, $rows),
            ];
        }

        return $columns;
    }

    /**
     * @return array<string, string>
     */
    private function resolveGoogleColumnTypeOverrides(array $config, string $worksheet): array
    {
        $all = $config['column_types'] ?? null;
        if (!is_array($all) || $worksheet === '') {
            return [];
        }

        $sheetMap = $all[$worksheet] ?? null;
        if (!is_array($sheetMap)) {
            return [];
        }

        $normalized = [];
        foreach ($sheetMap as $column => $type) {
            if (!is_string($column) || !is_string($type) || trim($column) === '' || trim($type) === '') {
                continue;
            }
            $normalized[strtolower($column)] = strtolower(trim($type));
        }

        return $normalized;
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
        if ($normalized === '') {
            return false;
        }

        $normalized = preg_replace('/[^0-9,.\-]/', '', $normalized);

        if ($normalized === '' || $normalized === '-') {
            return false;
        }

        if (preg_match('/^-?\d{1,3}(\.\d{3})*,\d+$/', $normalized) === 1) {
            $normalized = str_replace('.', '', $normalized);
            $normalized = str_replace(',', '.', $normalized);
        } elseif (preg_match('/^-?\d{1,3}(,\d{3})*\.\d+$/', $normalized) === 1) {
            $normalized = str_replace(',', '', $normalized);
        } elseif (preg_match('/^-?\d{1,3}(\.\d{3})+$/', $normalized) === 1) {
            $normalized = str_replace('.', '', $normalized);
        } elseif (preg_match('/^-?\d{1,3}(,\d{3})+$/', $normalized) === 1) {
            $normalized = str_replace(',', '', $normalized);
        } elseif (substr_count($normalized, ',') === 1 && substr_count($normalized, '.') === 0) {
            $normalized = str_replace(',', '.', $normalized);
        } elseif (substr_count($normalized, '.') > 1 && substr_count($normalized, ',') === 0) {
            $normalized = str_replace('.', '', $normalized);
        } elseif (substr_count($normalized, ',') > 1 && substr_count($normalized, '.') === 0) {
            $normalized = str_replace(',', '', $normalized);
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
