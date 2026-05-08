<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use PDO;
use ProjectLara\Cache\RedisCache;
use ProjectLara\DataSourceRepository;
use ProjectLara\Logger;
use ProjectLara\Services\BigQueryService;

final class DataQueryService
{
    public function __construct(
        private readonly DataSourceRepository $repository,
        private readonly DataSourceInspector $inspector,
        private readonly GoogleSheetsService $sheetsService,
        private readonly BigQueryService $bigQueryService,
        private readonly ?RedisCache $cache = null
    ) {
    }

    public function query(array $payload): array
    {
        $dataSourceId = (int) ($payload['data_source_id'] ?? 0);
        if ($dataSourceId <= 0) {
            throw new InvalidArgumentException('Fonte de dados não informada.');
        }

        $dataSource = $this->repository->find($dataSourceId);
        if (!$dataSource) {
            throw new InvalidArgumentException('Fonte de dados não encontrada.');
        }

        $mode = isset($payload['mode']) ? strtolower((string) $payload['mode']) : 'default';
        $type = $dataSource['type'] ?? 'mysql';
        $cacheKey = $this->buildCacheKey($dataSourceId, $type, $payload);
        $ttlSeconds = $this->resolveCacheTtl($payload);

        if ($cacheKey && $this->cache) {
            $cached = $this->cache->get($cacheKey);
            if (is_array($cached)) {
                Logger::write('cache', [
                    'event' => 'hit',
                    'key' => $cacheKey,
                    'mode' => $mode,
                    'source' => $type,
                ]);
                return $cached;
            }
            Logger::write('cache', [
                'event' => 'miss',
                'key' => $cacheKey,
                'mode' => $mode,
                'source' => $type,
            ]);
        }

        $result = match ($type) {
            'google_sheets' => match ($mode) {
                'table' => $this->runGoogleTableQuery($dataSource, $payload),
                'dimension' => $this->runGoogleDimensionQuery($dataSource, $payload),
                default => $this->runGoogleSeriesQuery($dataSource, $payload),
            },
            'mysql', 'supabase' => match ($mode) {
                'table' => $this->runSqlTableQuery($dataSource, $payload),
                'dimension' => $this->runSqlDimensionQuery($dataSource, $payload),
                default => $this->runSqlSeriesQuery($dataSource, $payload),
            },
            'bigquery' => match ($mode) {
                'table' => $this->runBigQueryTableQuery($dataSource, $payload),
                'dimension' => $this->runBigQueryDimensionQuery($dataSource, $payload),
                default => $this->runBigQuerySeriesQuery($dataSource, $payload),
            },
            default => throw new InvalidArgumentException('Tipo de fonte ainda não suportado: ' . $type),
        };

        if ($cacheKey && $this->cache && $ttlSeconds > 0) {
            $this->cache->set($cacheKey, $result, $ttlSeconds);
            Logger::write('cache', [
                'event' => 'set',
                'key' => $cacheKey,
                'ttl' => $ttlSeconds,
                'mode' => $mode,
                'source' => $type,
            ]);
        }

        return $result;
    }

    private function cacheTtlSeconds(): int
    {
        $ttl = getenv('DATA_QUERY_CACHE_TTL');
        if ($ttl === false || $ttl === '') {
            return 600;
        }
        $value = (int) $ttl;
        return $value > 0 ? $value : 0;
    }

    private function resolveCacheTtl(array $payload): int
    {
        $defaultTtl = $this->cacheTtlSeconds();
        if ($defaultTtl <= 0) {
            return 0;
        }

        $range = $payload['dateRange'] ?? null;
        if (!is_array($range)) {
            return $defaultTtl;
        }

        $end = $range['end'] ?? null;
        if (!is_string($end) || $end === '') {
            return $defaultTtl;
        }

        $endDate = substr($end, 0, 10);
        $today = (new \DateTimeImmutable('now'))->format('Y-m-d');
        if ($endDate < $today) {
            $historical = getenv('DATA_QUERY_CACHE_TTL_HISTORICAL');
            if ($historical !== false && $historical !== '') {
                $historicalTtl = (int) $historical;
                if ($historicalTtl > 0) {
                    return $historicalTtl;
                }
            }

            return max($defaultTtl, 900);
        }

        return $defaultTtl;
    }

    private function buildCacheKey(int $dataSourceId, string $type, array $payload): ?string
    {
        if (($payload['cache'] ?? true) === false) {
            return null;
        }

        $normalized = $payload;
        unset($normalized['cache'], $normalized['share_slug']);
        $normalizedJson = $this->stableJson($normalized);
        return sprintf('data_query:%d:%s:%s', $dataSourceId, $type, hash('sha256', $normalizedJson));
    }

    private function stableJson(array $value): string
    {
        $normalized = $this->sortRecursively($value);
        return json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function sortRecursively(array $value): array
    {
        ksort($value);
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->sortRecursively($item);
            }
        }
        return $value;
    }

    private function runBigQuerySeriesQuery(array $dataSource, array $payload): array
    {
        $metric = (string) ($payload['metric'] ?? '');
        if ($metric === '') {
            throw new InvalidArgumentException('Selecione a métrica para o widget.');
        }

        [$config, $table, $columnMap] = $this->bootstrapBigQuery($dataSource, $payload);

        $dimension = isset($payload['dimension']) ? (string) $payload['dimension'] : '';
        $metricY = isset($payload['metricY']) ? (string) $payload['metricY'] : null;

        $resolvedMetric = $this->matchColumn($metric, $columnMap);
        $resolvedDimension = $dimension !== '' ? $this->matchColumn($dimension, $columnMap) : null;
        $resolvedMetricY = $metricY ? $this->matchColumn($metricY, $columnMap) : null;

        $selects = [];
        if ($resolvedDimension) {
            $selects[] = sprintf('%s AS label', $this->quoteBigQueryIdentifier($resolvedDimension));
        } else {
            $selects[] = "'Total' AS label";
        }

        $selects[] = sprintf('SUM(%s) AS value', $this->quoteBigQueryIdentifier($resolvedMetric));

        if ($resolvedMetricY) {
            $selects[] = sprintf('SUM(%s) AS valueY', $this->quoteBigQueryIdentifier($resolvedMetricY));
        }

        $tableRef = $this->buildBigQueryTableReference($config, $table);
        $sql = sprintf('SELECT %s FROM %s WHERE 1=1', implode(', ', $selects), $tableRef);

        $conditions = $this->buildBigQueryDateClause($payload, $columnMap, $dimension !== '' ? $dimension : null);
        $dimensionCondition = $this->buildBigQueryDimensionClause($payload, $columnMap);
        if ($dimensionCondition) {
            $conditions[] = $dimensionCondition;
        }

        if ($conditions !== []) {
            $sql .= ' AND ' . implode(' AND ', $conditions);
        }

        if ($resolvedDimension) {
            $identifier = $this->quoteBigQueryIdentifier($resolvedDimension);
            $sql .= sprintf(' GROUP BY %s ORDER BY %s', $identifier, $identifier);
        }

        $rows = $this->bigQueryService->runQuery($config, $sql);

        $result = array_map(
            function (array $row) use ($resolvedMetricY): array {
                $item = [
                    'label' => isset($row['label']) ? (string) $row['label'] : 'Total',
                    'value' => $this->parseNumericValue($row['value'] ?? null),
                ];

                if ($resolvedMetricY) {
                    $item['valueY'] = $this->parseNumericValue($row['valueY'] ?? null);
                }

                return $item;
            },
            $rows
        );

        Logger::write('data_query', [
            'mode' => 'series',
            'source' => 'bigquery',
            'table' => $table,
            'sql' => $sql,
            'rows' => count($result),
        ]);

        return $result;
    }

    private function runBigQueryTableQuery(array $dataSource, array $payload): array
    {
        $dimensions = $this->normalizeList($payload['dimensions'] ?? [], 3);
        $metrics = $this->normalizeList($payload['metrics'] ?? [], 10);

        if ($dimensions === []) {
            throw new InvalidArgumentException('Selecione ao menos uma dimensão para a tabela.');
        }

        if ($metrics === []) {
            throw new InvalidArgumentException('Selecione ao menos uma métrica para a tabela.');
        }

        [$config, $table, $columnMap] = $this->bootstrapBigQuery($dataSource, $payload);

        $resolvedDimensions = array_map(
            fn (string $column): string => $this->matchColumn($column, $columnMap),
            $dimensions
        );
        $resolvedMetrics = array_map(
            fn (string $column): string => $this->matchColumn($column, $columnMap),
            $metrics
        );

        $selects = [];
        $dimensionAliases = [];
        foreach ($resolvedDimensions as $index => $column) {
            $alias = sprintf('dim_%d', $index);
            $dimensionAliases[] = $alias;
            $selects[] = sprintf('%s AS %s', $this->quoteBigQueryIdentifier($column), $alias);
        }

        $metricAliases = [];
        foreach ($resolvedMetrics as $index => $column) {
            $alias = sprintf('metric_%d', $index);
            $metricAliases[] = $alias;
            $selects[] = sprintf('COALESCE(SUM(%s), 0) AS %s', $this->quoteBigQueryIdentifier($column), $alias);
        }

        $tableRef = $this->buildBigQueryTableReference($config, $table);
        $sql = sprintf('SELECT %s FROM %s WHERE 1=1', implode(', ', $selects), $tableRef);

        $conditions = $this->buildBigQueryDateClause($payload, $columnMap, $dimensions[0] ?? null);
        $dimensionCondition = $this->buildBigQueryDimensionClause($payload, $columnMap);
        if ($dimensionCondition) {
            $conditions[] = $dimensionCondition;
        }

        if ($conditions !== []) {
            $sql .= ' AND ' . implode(' AND ', $conditions);
        }

        if ($resolvedDimensions !== []) {
            $groupBy = array_map(
                fn (string $column): string => $this->quoteBigQueryIdentifier($column),
                $resolvedDimensions
            );
            $sql .= ' GROUP BY ' . implode(', ', $groupBy);
        }

        $limit = isset($payload['limit']) ? (int) $payload['limit'] : 0;
        if ($limit > 0) {
            $sql .= sprintf(' LIMIT %d', max(1, $limit));
        }

        $rows = $this->bigQueryService->runQuery($config, $sql);

        Logger::write('data_query', [
            'mode' => 'table',
            'source' => 'bigquery',
            'table' => $table,
            'sql' => $sql,
            'rows' => count($rows),
        ]);

        $formattedRows = array_map(
            static function (array $row) use ($dimensionAliases, $metricAliases): array {
                $dimensionValues = [];
                foreach ($dimensionAliases as $alias) {
                    $dimensionValues[] = $row[$alias] ?? null;
                }

                $metricValues = [];
                foreach ($metricAliases as $alias) {
                    $value = $row[$alias] ?? 0;
                    $metricValues[] = is_numeric($value) ? (float) $value : 0.0;
                }

                return [
                    'dimensions' => $dimensionValues,
                    'metrics' => $metricValues,
                ];
            },
            $rows
        );

        return [
            'dimensions' => array_values($resolvedDimensions),
            'metrics' => array_values($resolvedMetrics),
            'rows' => $formattedRows,
        ];
    }

    private function runBigQueryDimensionQuery(array $dataSource, array $payload): array
    {
        $dimension = isset($payload['dimension']) ? (string) $payload['dimension'] : '';
        if ($dimension === '') {
            throw new InvalidArgumentException('Selecione uma dimensão para o filtro.');
        }

        [$config, $table, $columnMap] = $this->bootstrapBigQuery($dataSource, $payload);
        $resolvedDimension = $this->matchColumn($dimension, $columnMap);
        $identifier = $this->quoteBigQueryIdentifier($resolvedDimension);

        $labelExpr = sprintf("COALESCE(NULLIF(TRIM(%s), ''), 'Sem valor')", $identifier);
        $tableRef = $this->buildBigQueryTableReference($config, $table);
        $sql = sprintf('SELECT DISTINCT %s AS label FROM %s WHERE 1=1', $labelExpr, $tableRef);

        $conditions = $this->buildBigQueryDateClause($payload, $columnMap, $dimension);
        $filterPayload = $this->sanitizeDimensionFilterPayload($payload, $dimension);
        $dimensionCondition = $this->buildBigQueryDimensionClause($filterPayload, $columnMap);
        if ($dimensionCondition) {
            $conditions[] = $dimensionCondition;
        }

        if ($conditions !== []) {
            $sql .= ' AND ' . implode(' AND ', $conditions);
        }

        $sql .= ' ORDER BY label ASC';

        $rows = $this->bigQueryService->runQuery($config, $sql);

        $result = array_map(
            static fn (array $row): array => ['label' => isset($row['label']) ? (string) $row['label'] : 'Sem valor'],
            $rows
        );

        Logger::write('data_query', [
            'mode' => 'dimension',
            'source' => 'bigquery',
            'table' => $table,
            'sql' => $sql,
            'rows' => count($result),
        ]);

        return $result;
    }

    private function runSqlSeriesQuery(array $dataSource, array $payload): array
    {
        [$pdo, $table, $columnMap, $dialect, $schema] = $this->bootstrapSql($dataSource, $payload);

        $dimension = isset($payload['dimension']) ? (string) $payload['dimension'] : '';
        $metric = (string) ($payload['metric'] ?? '');
        $metricY = isset($payload['metricY']) ? (string) $payload['metricY'] : null;

        if ($metric === '') {
            throw new InvalidArgumentException('Parâmetros obrigatórios ausentes.');
        }

        $resolvedDimension = $dimension !== '' ? $this->matchColumn($dimension, $columnMap) : null;
        $resolvedMetric = $this->matchColumn($metric, $columnMap);
        $resolvedMetricY = $metricY ? $this->matchColumn($metricY, $columnMap) : null;

        $selects = [
            $resolvedDimension ? sprintf('%s AS label', $this->quoteSqlIdentifier($resolvedDimension, $dialect)) : "'Total' AS label",
            sprintf('SUM(%s) AS value', $this->quoteSqlIdentifier($resolvedMetric, $dialect)),
        ];

        if ($resolvedMetricY) {
            $selects[] = sprintf('SUM(%s) AS valueY', $this->quoteSqlIdentifier($resolvedMetricY, $dialect));
        }

        $sql = sprintf('SELECT %s FROM %s WHERE 1=1', implode(', ', $selects), $this->qualifySqlTable($table, $schema, $dialect));
        [$conditions, $params] = $this->buildDateConditions($payload, $columnMap, $dimension, $dialect);
        $this->applyDimensionFilter($payload, $columnMap, $conditions, $params, $dialect);

        if (!empty($conditions)) {
            $sql .= ' AND ' . implode(' AND ', $conditions);
        }

        if ($resolvedDimension) {
            $identifier = $this->quoteSqlIdentifier($resolvedDimension, $dialect);
            $sql .= sprintf(' GROUP BY %s ORDER BY %s', $identifier, $identifier);
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Logger::write('data_query', [
            'mode' => 'series',
            'sql' => $sql,
            'params' => $params,
            'rows' => count($result),
        ]);

        return $result;
    }

    private function runSqlDimensionQuery(array $dataSource, array $payload): array
    {
        [$pdo, $table, $columnMap, $dialect, $schema] = $this->bootstrapSql($dataSource, $payload);

        $dimension = isset($payload['dimension']) ? (string) $payload['dimension'] : '';
        if ($dimension === '') {
            throw new InvalidArgumentException('Selecione uma dimensão para o filtro.');
        }

        $resolvedDimension = $this->matchColumn($dimension, $columnMap);

        $identifier = $this->quoteSqlIdentifier($resolvedDimension, $dialect);
        $labelExpr = sprintf("COALESCE(NULLIF(TRIM(%s), ''), 'Sem valor')", $identifier);
        $sql = sprintf('SELECT DISTINCT %s AS label FROM %s WHERE 1=1', $labelExpr, $this->qualifySqlTable($table, $schema, $dialect));
        [$conditions, $params] = $this->buildDateConditions($payload, $columnMap, $dimension, $dialect);

        $filterPayload = $this->sanitizeDimensionFilterPayload($payload, $dimension);
        $this->applyDimensionFilter($filterPayload, $columnMap, $conditions, $params, $dialect);

        if ($conditions !== []) {
            $sql .= ' AND ' . implode(' AND ', $conditions);
        }

        $sql .= ' ORDER BY label ASC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $result = array_map(
            static fn ($label): array => ['label' => (string) $label],
            $stmt->fetchAll(PDO::FETCH_COLUMN)
        );

        Logger::write('data_query', [
            'mode' => 'dimension',
            'sql' => $sql,
            'params' => $params,
            'rows' => count($result),
        ]);

        return $result;
    }

    private function runSqlTableQuery(array $dataSource, array $payload): array
    {
        [$pdo, $table, $columnMap, $dialect, $schema] = $this->bootstrapSql($dataSource, $payload);

        $dimensions = $this->normalizeList($payload['dimensions'] ?? [], 3);
        $metrics = $this->normalizeList($payload['metrics'] ?? [], 10);

        if ($dimensions === []) {
            throw new InvalidArgumentException('Selecione ao menos uma dimensão para a tabela.');
        }

        if ($metrics === []) {
            throw new InvalidArgumentException('Selecione ao menos uma métrica para a tabela.');
        }

        $resolvedDimensions = array_map(
            fn (string $column): string => $this->matchColumn($column, $columnMap),
            $dimensions
        );
        $resolvedMetrics = array_map(
            fn (string $column): string => $this->matchColumn($column, $columnMap),
            $metrics
        );

        $selects = [];
        $dimensionAliases = [];
        foreach ($resolvedDimensions as $index => $column) {
            $alias = sprintf('dim_%d', $index);
            $dimensionAliases[] = $alias;
            $selects[] = sprintf('%s AS %s', $this->quoteSqlIdentifier($column, $dialect), $alias);
        }

        $metricAliases = [];
        foreach ($resolvedMetrics as $index => $column) {
            $alias = sprintf('metric_%d', $index);
            $metricAliases[] = $alias;
            $selects[] = sprintf('COALESCE(SUM(%s), 0) AS %s', $this->quoteSqlIdentifier($column, $dialect), $alias);
        }

        $sql = sprintf('SELECT %s FROM %s WHERE 1=1', implode(', ', $selects), $this->qualifySqlTable($table, $schema, $dialect));
        [$conditions, $params] = $this->buildDateConditions($payload, $columnMap, $dimensions[0] ?? null, $dialect);
        $this->applyDimensionFilter($payload, $columnMap, $conditions, $params, $dialect);

        if (!empty($conditions)) {
            $sql .= ' AND ' . implode(' AND ', $conditions);
        }

        if ($resolvedDimensions !== []) {
            $groupBy = array_map(fn (string $column): string => $this->quoteSqlIdentifier($column, $dialect), $resolvedDimensions);
            $sql .= ' GROUP BY ' . implode(', ', $groupBy);
        }

        $limit = isset($payload['limit']) ? (int) $payload['limit'] : 0;
        if ($limit > 0) {
            $sql .= sprintf(' LIMIT %d', max(1, $limit));
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rawRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Logger::write('data_query', [
            'mode' => 'table',
            'sql' => $sql,
            'params' => $params,
            'rows' => count($rawRows),
        ]);

        $rows = array_map(
            static function (array $row) use ($dimensionAliases, $metricAliases): array {
                $dimensionValues = [];
                foreach ($dimensionAliases as $alias) {
                    $dimensionValues[] = $row[$alias] ?? null;
                }

                $metricValues = [];
                foreach ($metricAliases as $alias) {
                    $value = $row[$alias] ?? 0;
                    $metricValues[] = is_numeric($value) ? (float) $value : 0.0;
                }

                return [
                    'dimensions' => $dimensionValues,
                    'metrics' => $metricValues,
                ];
            },
            $rawRows
        );

        return [
            'dimensions' => array_values($resolvedDimensions),
            'metrics' => array_values($resolvedMetrics),
            'rows' => $rows,
        ];
    }

    private function runGoogleSeriesQuery(array $dataSource, array $payload): array
    {
        $metric = (string) ($payload['metric'] ?? '');
        if ($metric === '') {
            throw new InvalidArgumentException('Selecione a métrica para o widget.');
        }

        $dataset = $this->loadGoogleDataset($dataSource, $payload);
        $columnMap = $dataset['columns'];

        $dateColumn = $this->resolveDateColumn(
            $columnMap,
            isset($payload['date_column']) ? (string) $payload['date_column'] : null,
            isset($payload['dimension']) ? (string) $payload['dimension'] : null
        );

        $rows = $this->filterRowsByDateRange($dataset['rows'], $dateColumn, $payload['dateRange'] ?? null);
        $rows = $this->filterRowsByDimension($rows, $payload['dimension_filter'] ?? null, $columnMap);

        $resolvedMetric = $this->matchColumn($metric, $columnMap);
        $resolvedMetricY = isset($payload['metricY']) && $payload['metricY'] !== ''
            ? $this->matchColumn((string) $payload['metricY'], $columnMap)
            : null;
        $resolvedDimension = isset($payload['dimension']) && $payload['dimension'] !== ''
            ? $this->matchColumn((string) $payload['dimension'], $columnMap)
            : null;

        $aggregated = [];

        foreach ($rows as $row) {
            $label = $resolvedDimension ? ($row[$resolvedDimension] ?? 'Sem valor') : 'Total';
            if (!isset($aggregated[$label])) {
                $aggregated[$label] = [
                    'label' => $label,
                    'value' => 0.0,
                    'valueY' => $resolvedMetricY ? 0.0 : null,
                ];
            }

            $aggregated[$label]['value'] += $this->parseNumericValue(
                $row[$resolvedMetric] ?? null,
                $columnMap[strtolower($resolvedMetric)]['type'] ?? null
            );

            if ($resolvedMetricY) {
                $aggregated[$label]['valueY'] += $this->parseNumericValue(
                    $row[$resolvedMetricY] ?? null,
                    $columnMap[strtolower($resolvedMetricY)]['type'] ?? null
                );
            }
        }

        $result = array_values(array_map(
            static function (array $item): array {
                if ($item['valueY'] === null) {
                    unset($item['valueY']);
                }
                return $item;
            },
            $aggregated
        ));

        Logger::write('data_query', [
            'mode' => 'series',
            'source' => 'google_sheets',
            'worksheet' => $dataset['worksheet'] ?? null,
            'spreadsheet' => $dataset['spreadsheet'] ?? null,
            'rows' => count($result),
        ]);

        return $result;
    }

    private function runGoogleTableQuery(array $dataSource, array $payload): array
    {
        $dimensions = $this->normalizeList($payload['dimensions'] ?? [], 3);
        $metrics = $this->normalizeList($payload['metrics'] ?? [], 10);

        if ($dimensions === []) {
            throw new InvalidArgumentException('Selecione ao menos uma dimensão para a tabela.');
        }

        if ($metrics === []) {
            throw new InvalidArgumentException('Selecione ao menos uma métrica para a tabela.');
        }

        $dataset = $this->loadGoogleDataset($dataSource, $payload);
        $columnMap = $dataset['columns'];

        $resolvedDimensions = array_map(
            fn (string $column): string => $this->matchColumn($column, $columnMap),
            $dimensions
        );

        $resolvedMetrics = array_map(
            fn (string $column): string => $this->matchColumn($column, $columnMap),
            $metrics
        );

        $dateColumn = $this->resolveDateColumn(
            $columnMap,
            isset($payload['date_column']) ? (string) $payload['date_column'] : null,
            $dimensions[0] ?? null
        );

        $rows = $this->filterRowsByDateRange($dataset['rows'], $dateColumn, $payload['dateRange'] ?? null);
        $rows = $this->filterRowsByDimension($rows, $payload['dimension_filter'] ?? null, $columnMap);

        $groups = [];

        foreach ($rows as $row) {
            $dimensionValues = [];
            foreach ($resolvedDimensions as $dimensionName) {
                $dimensionValues[] = $row[$dimensionName] ?? 'Sem valor';
            }
            $groupKey = implode('||', $dimensionValues);

            if (!isset($groups[$groupKey])) {
                $groups[$groupKey] = [
                    'dimensions' => $dimensionValues,
                    'metrics' => array_fill(0, count($resolvedMetrics), 0.0),
                ];
            }

            foreach ($resolvedMetrics as $index => $metricName) {
                $groups[$groupKey]['metrics'][$index] += $this->parseNumericValue(
                    $row[$metricName] ?? null,
                    $columnMap[strtolower($metricName)]['type'] ?? null
                );
            }
        }

        $rowsOutput = array_values(array_map(
            static fn (array $group): array => [
                'dimensions' => $group['dimensions'],
                'metrics' => $group['metrics'],
            ],
            $groups
        ));

        Logger::write('data_query', [
            'mode' => 'table',
            'source' => 'google_sheets',
            'worksheet' => $dataset['worksheet'] ?? null,
            'spreadsheet' => $dataset['spreadsheet'] ?? null,
            'rows' => count($rowsOutput),
        ]);

        return [
            'dimensions' => array_values($resolvedDimensions),
            'metrics' => array_values($resolvedMetrics),
            'rows' => $rowsOutput,
        ];
    }

    private function runGoogleDimensionQuery(array $dataSource, array $payload): array
    {
        $dimension = isset($payload['dimension']) ? (string) $payload['dimension'] : '';
        if ($dimension === '') {
            throw new InvalidArgumentException('Selecione uma dimensão para o filtro.');
        }

        $dataset = $this->loadGoogleDataset($dataSource, $payload);
        $columnMap = $dataset['columns'];

        $resolvedDimension = $this->matchColumn($dimension, $columnMap);
        $dateColumn = $this->resolveDateColumn(
            $columnMap,
            isset($payload['date_column']) ? (string) $payload['date_column'] : null,
            $dimension
        );

        $rows = $this->filterRowsByDateRange($dataset['rows'], $dateColumn, $payload['dateRange'] ?? null);
        $filterPayload = $this->sanitizeDimensionFilterPayload($payload, $dimension);
        $rows = $this->filterRowsByDimension($rows, $filterPayload['dimension_filter'] ?? null, $columnMap);

        $values = [];
        foreach ($rows as $row) {
            $label = $row[$resolvedDimension] ?? null;
            $label = is_string($label) && trim($label) !== '' ? $label : 'Sem valor';
            $values[strtolower($label) . '|' . $label] = $label;
        }

        $result = array_map(
            static fn (string $value): array => ['label' => $value],
            array_values($values)
        );

        usort($result, static fn (array $a, array $b): int => strcmp($a['label'], $b['label']));

        Logger::write('data_query', [
            'mode' => 'dimension',
            'source' => 'google_sheets',
            'worksheet' => $dataset['worksheet'] ?? null,
            'spreadsheet' => $dataset['spreadsheet'] ?? null,
            'rows' => count($result),
        ]);

        return $result;
    }

    /**
     * @return array{0: array<string, mixed>, 1: string, 2: array<string, array{name: string, type: string}>}
     */
    private function bootstrapBigQuery(array $dataSource, array $payload): array
    {
        $config = $dataSource['config'] ?? [];

        foreach (['project_id', 'dataset', 'service_account_json'] as $field) {
            if (!isset($config[$field]) || trim((string) $config[$field]) === '') {
                throw new InvalidArgumentException(sprintf('Configuração do BigQuery incompleta: %s.', $field));
            }
        }

        $table = (string) ($payload['table'] ?? ($config['table'] ?? ''));
        if ($table === '') {
            throw new InvalidArgumentException('Informe a tabela que deseja consultar.');
        }
        $config['table'] = $table;

        $sourceId = isset($dataSource['id']) ? (int) $dataSource['id'] : (int) ($payload['data_source_id'] ?? 0);
        if ($sourceId <= 0) {
            throw new InvalidArgumentException('Fonte de dados inválida para consulta.');
        }

        $columns = $this->inspector->listColumns($sourceId, $table);
        $columnMap = [];
        foreach ($columns as $column) {
            $name = $column['name'] ?? '';
            if ($name === '') {
                continue;
            }

            $columnMap[strtolower($name)] = [
                'name' => $name,
                'type' => strtolower((string) ($column['type'] ?? 'string')),
            ];
        }

        if ($columnMap === []) {
            throw new InvalidArgumentException('Não foi possível carregar as colunas desta tabela do BigQuery.');
        }

        return [$config, $table, $columnMap];
    }

    private function buildBigQueryTableReference(array $config, string $table): string
    {
        $projectId = $this->sanitizeProjectId((string) $config['project_id']);
        $dataset = $this->sanitizeDatasetId((string) $config['dataset']);
        $tableId = $this->sanitizeTableId($table);

        return sprintf('`%s.%s.%s`', $projectId, $dataset, $tableId);
    }

    private function buildBigQueryDateClause(array $payload, array $columnMap, ?string $fallbackColumn): array
    {
        $conditions = [];
        $sourceColumn = $payload['date_column'] ?? $fallbackColumn ?? '';
        $dateKey = strtolower((string) $sourceColumn);
        if ($dateKey === '' || !isset($columnMap[$dateKey])) {
            return $conditions;
        }

        $dateRange = $payload['dateRange'] ?? null;
        if (!$dateRange || !isset($dateRange['start'], $dateRange['end'])) {
            return $conditions;
        }

        $columnInfo = $columnMap[$dateKey];
        $identifier = $this->quoteBigQueryIdentifier($columnInfo['name']);
        $start = $this->quoteBigQueryLiteral((string) $dateRange['start']);
        $end = $this->quoteBigQueryLiteral((string) $dateRange['end']);

        if ($this->isDateType($columnInfo['type'] ?? '')) {
            $conditions[] = sprintf('%s BETWEEN %s AND %s', $identifier, $start, $end);
            return $conditions;
        }

        $format = $this->sanitizeBigQueryDateFormat(isset($payload['date_format']) ? (string) $payload['date_format'] : null);
        $parsedExpr = sprintf("SAFE.PARSE_DATE('%s', %s)", $format, $identifier);
        $conditions[] = sprintf('%s IS NOT NULL', $parsedExpr);
        $conditions[] = sprintf('%s BETWEEN %s AND %s', $parsedExpr, $start, $end);

        return $conditions;
    }

    private function buildBigQueryDimensionClause(array $payload, array $columnMap): ?string
    {
        $filter = $payload['dimension_filter'] ?? null;
        if (!is_array($filter)) {
            return null;
        }

        $value = isset($filter['value']) ? (string) $filter['value'] : '';
        if ($value === '' || strtolower($value) === 'all') {
            return null;
        }

        $dimension = isset($filter['dimension']) ? (string) $filter['dimension'] : '';
        if ($dimension === '') {
            return null;
        }

        try {
            $column = $this->matchColumn($dimension, $columnMap);
        } catch (InvalidArgumentException) {
            return null;
        }

        $values = $this->parseDimensionValues($value);
        if ($values === []) {
            return null;
        }

        $identifier = $this->quoteBigQueryIdentifier($column);
        $columnInfo = $columnMap[strtolower($column)] ?? [];
        $columnType = strtolower($columnInfo['type'] ?? 'string');
        $isNumeric = $this->isBigQueryNumericType($columnType);

        $formatted = [];
        foreach ($values as $item) {
            if ($isNumeric) {
                if (!is_numeric($item)) {
                    continue;
                }
                $formatted[] = (string) $item;
            } else {
                $formatted[] = $this->quoteBigQueryLiteral($item);
            }
        }

        if ($formatted === []) {
            return null;
        }

        if (count($formatted) === 1) {
            return sprintf('%s = %s', $identifier, $formatted[0]);
        }

        return sprintf('%s IN (%s)', $identifier, implode(', ', $formatted));
    }

    private function quoteBigQueryIdentifier(string $identifier): string
    {
        $trimmed = trim($identifier);
        if ($trimmed === '') {
            throw new InvalidArgumentException('Identificador inválido para o BigQuery.');
        }

        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $trimmed)) {
            throw new InvalidArgumentException(sprintf('Identificador inválido: %s', $identifier));
        }

        return sprintf('`%s`', $trimmed);
    }

    private function quoteBigQueryLiteral(string $value): string
    {
        return "'" . str_replace("'", "''", $value) . "'";
    }

    private function sanitizeProjectId(string $projectId): string
    {
        $trimmed = trim($projectId);
        if ($trimmed === '' || preg_match('/[`\\s]/', $trimmed)) {
            throw new InvalidArgumentException('Project ID inválido.');
        }

        if (!preg_match('/^[A-Za-z0-9\-:]+$/', $trimmed)) {
            throw new InvalidArgumentException('Project ID inválido.');
        }

        return $trimmed;
    }

    private function sanitizeDatasetId(string $dataset): string
    {
        $trimmed = trim($dataset);
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $trimmed)) {
            throw new InvalidArgumentException('Dataset inválido.');
        }

        return $trimmed;
    }

    private function sanitizeTableId(string $table): string
    {
        $trimmed = trim($table);
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*(\$\d+)?$/', $trimmed)) {
            throw new InvalidArgumentException('Tabela do BigQuery inválida.');
        }

        return $trimmed;
    }

    private function sanitizeBigQueryDateFormat(?string $format): string
    {
        $value = $format ? trim($format) : '';
        if ($value === '') {
            return '%c/%e/%y';
        }

        $clean = preg_replace('/[^A-Za-z0-9_%\-\/]/', '', $value);
        if ($clean === '') {
            return '%c/%e/%y';
        }

        return $clean;
    }

    private function isBigQueryNumericType(string $type): bool
    {
        return in_array($type, ['int64', 'integer', 'float64', 'float', 'numeric', 'bignumeric', 'double'], true);
    }

    /**
     * @return array{0: PDO, 1: string, 2: array<string, array{name: string, type: string}>, 3: string, 4: string}
     */
    private function bootstrapSql(array $dataSource, array $payload): array
    {
        $table = (string) ($payload['table'] ?? '');
        if ($table === '') {
            throw new InvalidArgumentException('Informe a tabela que deseja consultar.');
        }

        $pdo = $this->inspector->createConnection($dataSource);
        $sourceType = (string) ($dataSource['type'] ?? 'mysql');
        $dialect = $sourceType === 'supabase' ? 'pgsql' : 'mysql';
        $schema = $sourceType === 'supabase'
            ? (trim((string) (($dataSource['config']['schema'] ?? ''))) ?: 'public')
            : '';
        $sourceId = isset($dataSource['id']) ? (int) $dataSource['id'] : (int) ($payload['data_source_id'] ?? 0);

        $columns = $this->inspector->listColumns($sourceId, $table);
        $columnMap = [];
        foreach ($columns as $column) {
            $columnMap[strtolower($column['name'])] = [
                'name' => $column['name'],
                'type' => strtolower($column['type']),
            ];
        }

        return [$pdo, $table, $columnMap, $dialect, $schema];
    }

    /**
     * @return array{0: array<int, string>, 1: array<string, string>}
     */
    private function buildDateConditions(array $payload, array $columnMap, ?string $fallbackColumn, string $dialect): array
    {
        $conditions = [];
        $params = [];

        $sourceColumn = $payload['date_column'] ?? $fallbackColumn ?? '';
        $dateColumnKey = strtolower((string) $sourceColumn);
        if ($dateColumnKey === '' || !isset($columnMap[$dateColumnKey])) {
            return [$conditions, $params];
        }

        $dateRange = $payload['dateRange'] ?? null;
        $dateColumn = $columnMap[$dateColumnKey]['name'] ?? null;
        $dateType = $columnMap[$dateColumnKey]['type'] ?? '';
        $requestedFormat = isset($payload['date_format']) ? (string) $payload['date_format'] : null;

        if ($dateColumn && $dateRange && isset($dateRange['start'], $dateRange['end'])) {
            if ($this->isDateType($dateType)) {
                $conditions[] = sprintf('%s BETWEEN :start AND :end', $this->quoteSqlIdentifier($dateColumn, $dialect));
                $params[':start'] = $dateRange['start'];
                $params[':end'] = $dateRange['end'];
            } else {
                $conditions[] = sprintf('%s BETWEEN :start AND :end', $this->buildSqlDateParseExpression($dateColumn, $requestedFormat, $dialect));
                $params[':start'] = $dateRange['start'];
                $params[':end'] = $dateRange['end'];
            }
        }

        return [$conditions, $params];
    }

    private function applyDimensionFilter(array $payload, array $columnMap, array &$conditions, array &$params, string $dialect): void
    {
        $filter = $payload['dimension_filter'] ?? null;
        if (!is_array($filter)) {
            return;
        }

        $value = isset($filter['value']) ? (string) $filter['value'] : '';
        if ($value === '' || strtolower($value) === 'all') {
            return;
        }

        $dimension = isset($filter['dimension']) ? (string) $filter['dimension'] : '';
        if ($dimension === '') {
            return;
        }

        try {
            $column = $this->matchColumn($dimension, $columnMap);
        } catch (InvalidArgumentException) {
            return;
        }

        $values = $this->parseDimensionValues($value);
        if ($values === []) {
            return;
        }

        if (count($values) === 1) {
            $paramKey = ':dimension_' . count($params);
            $conditions[] = sprintf('%s = %s', $this->quoteSqlIdentifier($column, $dialect), $paramKey);
            $params[$paramKey] = $values[0];
            return;
        }

        $placeholders = [];
        foreach ($values as $item) {
            $paramKey = ':dimension_' . count($params);
            $placeholders[] = $paramKey;
            $params[$paramKey] = $item;
        }

        $conditions[] = sprintf('%s IN (%s)', $this->quoteSqlIdentifier($column, $dialect), implode(', ', $placeholders));
    }

    /**
     * @param array<int, mixed> $values
     * @return array<int, string>
     */
    private function normalizeList(array $values, int $limit): array
    {
        $normalized = [];
        foreach ($values as $value) {
            if (!is_string($value)) {
                continue;
            }

            $trimmed = trim($value);
            if ($trimmed === '') {
                continue;
            }

            $key = strtolower($trimmed);
            if (isset($normalized[$key])) {
                continue;
            }

            $normalized[$key] = $trimmed;

            if (count($normalized) >= $limit) {
                break;
            }
        }

        return array_values($normalized);
    }

    /**
     * @return array{
     *   rows: array<int, array<string, string>>,
     *   columns: array<string, array{name: string, type: string}>,
     *   worksheet: string|null,
     *   spreadsheet: string|null
     * }
     */
    private function loadGoogleDataset(array $dataSource, array $payload): array
    {
        $config = $dataSource['config'] ?? [];
        $worksheet = (string) ($payload['table'] ?? ($config['worksheet'] ?? ''));
        if ($worksheet === '') {
            throw new InvalidArgumentException('Informe a aba (worksheet) do Google Sheets.');
        }

        $config['worksheet'] = $worksheet;
        $sheet = $this->sheetsService->fetch($config);
        $rows = $sheet['rows'];
        $columns = [];
        $typeOverrides = $this->resolveGoogleColumnTypeOverrides($config, $worksheet);

        foreach ($sheet['headers'] as $header) {
            $lower = strtolower($header);
            $resolvedType = $typeOverrides[$lower] ?? $this->guessGoogleType($header, $rows);
            $columns[$lower] = [
                'name' => $header,
                'type' => $resolvedType,
            ];
        }

        $result = [
            'rows' => $rows,
            'columns' => $columns,
            'worksheet' => $sheet['worksheet'] ?? $worksheet,
            'spreadsheet' => $sheet['spreadsheet_id'] ?? ($config['spreadsheet_id'] ?? null),
        ];

        Logger::write('google_sheets_fetch', [
            'spreadsheet' => $result['spreadsheet'],
            'worksheet' => $result['worksheet'],
            'rows' => count($rows),
            'columns' => array_values(array_map(static fn (array $column): string => $column['name'], $columns)),
        ]);

        return $result;
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

            if ($this->parseNumericValue($value) !== 0.0 || $value === '0') {
                return 'double';
            }

            if ($this->parseDateValue($value) instanceof \DateTimeImmutable) {
                return 'date';
            }
        }

        return 'string';
    }

    /**
     * @return array<string, string>
     */
    private function resolveGoogleColumnTypeOverrides(array $config, string $worksheet): array
    {
        $all = $config['column_types'] ?? null;
        if (!is_array($all) || !isset($all[$worksheet]) || !is_array($all[$worksheet])) {
            return [];
        }

        $normalized = [];
        foreach ($all[$worksheet] as $column => $type) {
            if (!is_string($column) || !is_string($type)) {
                continue;
            }

            $columnName = trim($column);
            $columnType = strtolower(trim($type));
            if ($columnName === '' || $columnType === '') {
                continue;
            }

            $normalized[strtolower($columnName)] = $columnType;
        }

        return $normalized;
    }

    private function resolveDateColumn(array $columnMap, ?string $preferred, ?string $fallback): ?string
    {
        foreach ([$preferred, $fallback] as $candidate) {
            if (!$candidate) {
                continue;
            }
            $lower = strtolower($candidate);
            if (isset($columnMap[$lower])) {
                return $columnMap[$lower]['name'];
            }
        }

        return null;
    }

    /**
     * @param array<int, array<string, string>> $rows
     */
    private function filterRowsByDateRange(array $rows, ?string $dateColumn, ?array $dateRange): array
    {
        if (!$dateColumn || !$dateRange || !isset($dateRange['start'], $dateRange['end'])) {
            return $rows;
        }

        try {
            $start = new \DateTimeImmutable((string) $dateRange['start']);
            $end = new \DateTimeImmutable((string) $dateRange['end']);
        } catch (\Throwable) {
            return $rows;
        }

        return array_values(array_filter(
            $rows,
            function (array $row) use ($dateColumn, $start, $end): bool {
                if (!isset($row[$dateColumn]) || trim((string) $row[$dateColumn]) === '') {
                    return false;
                }
                $parsed = $this->parseDateValue((string) $row[$dateColumn]);
                if (!$parsed) {
                    return false;
                }

                return $parsed >= $start && $parsed <= $end;
            }
        ));
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @param array<string, array{name: string, type: string}> $columnMap
     */
    private function filterRowsByDimension(array $rows, ?array $dimensionFilter, array $columnMap): array
    {
        if (!is_array($dimensionFilter)) {
            return $rows;
        }

        $value = isset($dimensionFilter['value']) ? (string) $dimensionFilter['value'] : '';
        if ($value === '' || strtolower($value) === 'all') {
            return $rows;
        }

        $dimension = isset($dimensionFilter['dimension']) ? (string) $dimensionFilter['dimension'] : '';
        if ($dimension === '') {
            return $rows;
        }

        try {
            $column = $this->matchColumn($dimension, $columnMap);
        } catch (InvalidArgumentException) {
            return $rows;
        }

        $values = $this->parseDimensionValues($value);
        if ($values === []) {
            return $rows;
        }

        return array_values(array_filter(
            $rows,
            static function (array $row) use ($column, $values): bool {
                if (!isset($row[$column])) {
                    return false;
                }

                $current = (string) $row[$column];
                foreach ($values as $candidate) {
                    if ($current === $candidate) {
                        return true;
                    }
                }
                return false;
            }
        ));
    }

    /**
     * @param array{dimension_filter?: array<string, mixed>} $payload
     */
    private function sanitizeDimensionFilterPayload(array $payload, string $currentDimension): array
    {
        $payloadCopy = $payload;
        if (
            isset($payloadCopy['dimension_filter'], $payloadCopy['dimension_filter']['dimension']) &&
            strcasecmp((string) $payloadCopy['dimension_filter']['dimension'], $currentDimension) === 0
        ) {
            unset($payloadCopy['dimension_filter']);
        }

        return $payloadCopy;
    }

    /**
     * @return array<int, string>
     */
    private function parseDimensionValues(string $value): array
    {
        $parts = explode('|', $value);
        $normalized = [];

        foreach ($parts as $part) {
            $trimmed = trim($part);
            if ($trimmed === '' || strtolower($trimmed) === 'all') {
                continue;
            }

            if (!in_array($trimmed, $normalized, true)) {
                $normalized[] = $trimmed;
            }
        }

        return $normalized;
    }

    private function parseDateValue(string $value): ?\DateTimeImmutable
    {
        $candidates = ['Y-m-d', 'd/m/Y', 'm/d/Y', 'd/m/y', 'm/d/y', 'd-m-Y', 'm-d-Y'];
        foreach ($candidates as $format) {
            $date = \DateTimeImmutable::createFromFormat($format, $value);
            if ($date instanceof \DateTimeImmutable) {
                return $date;
            }
        }

        $timestamp = strtotime($value);
        if ($timestamp !== false) {
            return (new \DateTimeImmutable())->setTimestamp($timestamp);
        }

        return null;
    }

    private function parseNumericValue($value, ?string $declaredType = null): float
    {
        if ($value === null) {
            return 0.0;
        }

        $stringValue = trim((string) $value);
        if ($stringValue === '') {
            return 0.0;
        }

        $normalizedType = strtolower(trim((string) $declaredType));
        if (in_array($normalizedType, ['boolean', 'bool'], true)) {
            $boolValue = strtolower($stringValue);
            return in_array($boolValue, ['1', 'true', 'yes', 'sim'], true) ? 1.0 : 0.0;
        }

        $normalized = str_replace(["\u{00A0}", ' '], '', $stringValue);
        // Remove currency symbols/letters, keep digits and separators.
        $normalized = preg_replace('/[^0-9,.\-]/', '', $normalized);

        if ($normalized === '' || $normalized === '-' || $normalized === null) {
            return 0.0;
        }

        // Detect formats like 1.234,56 (pt-BR)
        if (preg_match('/^-?\d{1,3}(\.\d{3})*,\d+$/', $normalized) === 1) {
            $normalized = str_replace('.', '', $normalized);
            $normalized = str_replace(',', '.', $normalized);
        // Detect formats like 1,234.56 (en-US)
        } elseif (preg_match('/^-?\d{1,3}(,\d{3})*\.\d+$/', $normalized) === 1) {
            $normalized = str_replace(',', '', $normalized);
        // Detect integers with thousand separators only, like 5.478.406
        } elseif (preg_match('/^-?\d{1,3}(\.\d{3})+$/', $normalized) === 1) {
            $normalized = str_replace('.', '', $normalized);
        // Detect integers with thousand separators only, like 5,478,406
        } elseif (preg_match('/^-?\d{1,3}(,\d{3})+$/', $normalized) === 1) {
            $normalized = str_replace(',', '', $normalized);
        } elseif (substr_count($normalized, '.') >= 1 && substr_count($normalized, ',') >= 1) {
            $lastComma = strrpos($normalized, ',');
            $lastDot = strrpos($normalized, '.');
            if ($lastComma !== false && $lastDot !== false && $lastComma > $lastDot) {
                $normalized = str_replace('.', '', $normalized);
                $normalized = str_replace(',', '.', $normalized);
            } else {
                $normalized = str_replace(',', '', $normalized);
            }
        } elseif (substr_count($normalized, ',') === 1 && substr_count($normalized, '.') === 0) {
            $commaPos = strrpos($normalized, ',');
            $digitsAfterComma = $commaPos === false ? 0 : strlen($normalized) - $commaPos - 1;
            if (in_array($normalizedType, ['int', 'integer', 'bigint'], true) && $digitsAfterComma === 3) {
                $normalized = str_replace(',', '', $normalized);
            } else {
                $normalized = str_replace(',', '.', $normalized);
            }
        } elseif (substr_count($normalized, '.') > 1 && substr_count($normalized, ',') === 0) {
            $normalized = str_replace('.', '', $normalized);
        } elseif (substr_count($normalized, ',') > 1 && substr_count($normalized, '.') === 0) {
            $normalized = str_replace(',', '', $normalized);
        } elseif (
            substr_count($normalized, '.') === 1 &&
            substr_count($normalized, ',') === 0 &&
            in_array($normalizedType, ['int', 'integer', 'bigint'], true)
        ) {
            $dotPos = strrpos($normalized, '.');
            $digitsAfterDot = $dotPos === false ? 0 : strlen($normalized) - $dotPos - 1;
            if ($digitsAfterDot === 3) {
                $normalized = str_replace('.', '', $normalized);
            }
        }

        if (!is_numeric($normalized)) {
            return 0.0;
        }

        return (float) $normalized;
    }

    private function matchColumn(string $column, array $map): string
    {
        $lower = strtolower($column);
        if (isset($map[$lower])) {
            return $map[$lower]['name'];
        }

        throw new InvalidArgumentException(sprintf('Coluna %s não encontrada.', $column));
    }

    private function isDateType(string $type): bool
    {
        return in_array($type, ['date', 'datetime', 'timestamp', 'timestamptz'], true);
    }

    private function quoteSqlIdentifier(string $identifier, string $dialect): string
    {
        $trimmed = trim($identifier);
        if ($trimmed === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $trimmed)) {
            throw new InvalidArgumentException(sprintf('Identificador SQL inválido: %s', $identifier));
        }

        return $dialect === 'pgsql'
            ? sprintf('"%s"', $trimmed)
            : sprintf('`%s`', $trimmed);
    }

    private function qualifySqlTable(string $table, string $schema, string $dialect): string
    {
        $quotedTable = $this->quoteSqlIdentifier($table, $dialect);
        if ($dialect !== 'pgsql') {
            return $quotedTable;
        }

        $schemaName = trim($schema) !== '' ? $schema : 'public';
        return sprintf('%s.%s', $this->quoteSqlIdentifier($schemaName, $dialect), $quotedTable);
    }

    private function buildSqlDateParseExpression(string $column, ?string $requestedFormat, string $dialect): string
    {
        $identifier = $this->quoteSqlIdentifier($column, $dialect);
        if ($dialect === 'pgsql') {
            return sprintf("TO_DATE(%s, '%s')", $identifier, $this->convertToPostgresDateFormat($requestedFormat));
        }

        $format = $requestedFormat ?: '%c/%e/%y';
        return sprintf("STR_TO_DATE(%s, '%s')", $identifier, $format);
    }

    private function convertToPostgresDateFormat(?string $format): string
    {
        $value = $format ? trim($format) : '';
        return match ($value) {
            '%Y-%m-%d' => 'YYYY-MM-DD',
            '%d/%m/%Y' => 'DD/MM/YYYY',
            '%m/%d/%Y' => 'MM/DD/YYYY',
            '%d/%m/%y' => 'DD/MM/YY',
            '%m/%d/%y' => 'MM/DD/YY',
            default => 'MM/DD/YY',
        };
    }
}
