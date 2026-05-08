import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalculatedMetric, GlobalFilterState } from '../types';
import { fetchDataPoints, DataPoint } from '../services/dataQueryService';
import { useCalculatedMetrics } from './useCalculatedMetrics';
import { getCalculatedMetricKey, extractMetricDependencies, evaluateCalculatedMetric } from '../utils/calculatedMetrics';

type MetricReference =
  | { type: 'column'; name: string }
  | { type: 'calculated'; definition: CalculatedMetric };

interface UseWidgetDataParams {
  enabled: boolean;
  sourceId?: string;
  table?: string;
  dimension?: string;
  metric?: string;
  metricY?: string;
  calculatedOverrides?: Record<string, CalculatedMetric>;
  dateRange?: GlobalFilterState['dateRange'];
  dateColumn?: string;
  shareSlug?: string;
  dimensionFilter?: GlobalFilterState['dimensionFilter'];
}

export const useWidgetData = ({
  enabled,
  sourceId,
  table,
  dimension,
  metric,
  metricY,
  calculatedOverrides,
  dateRange,
  dateColumn,
  shareSlug,
  dimensionFilter,
}: UseWidgetDataParams) => {
  const [data, setData] = useState<DataPoint[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { metrics: calculatedMetrics } = useCalculatedMetrics();

  const resolveMetric = useCallback(
    (value?: string | null): MetricReference | null => {
      if (!value) return null;
      const key = getCalculatedMetricKey(value);
      if (key) {
        const definition =
          calculatedMetrics.find((metricDef) => metricDef.key === key) ??
          calculatedOverrides?.[key];
        if (!definition) {
          return null;
        }
        return { type: 'calculated', definition };
      }
      return { type: 'column', name: value };
    },
    [calculatedMetrics, calculatedOverrides]
  );

  const metricRef = useMemo(() => resolveMetric(metric), [metric, resolveMetric]);
  const metricYRef = useMemo(() => resolveMetric(metricY), [metricY, resolveMetric]);

  useEffect(() => {
    if (!enabled || !sourceId || !table) {
      return;
    }

    if (!metricRef) {
      setData(null);
      setError('Selecione uma métrica disponível para este widget.');
      return;
    }

    const basePayload = {
      data_source_id: sourceId,
      table,
      dimension: dimension || undefined,
      dateRange,
      date_column: dateColumn || dimension || undefined,
      share_slug: shareSlug,
      dimension_filter:
        dimensionFilter && dimensionFilter.value && dimensionFilter.value !== 'all'
          ? dimensionFilter
          : undefined,
    };

    const loadSeries = async (ref: MetricReference | null): Promise<DataPoint[]> => {
      if (!ref) return [];
      if (ref.type === 'column') {
        return fetchDataPoints({
          ...basePayload,
          metric: ref.name,
        });
      }

      const dependencies = extractMetricDependencies(ref.definition.formula);
      if (dependencies.length === 0) {
        throw new Error(`Métrica ${ref.definition.name} não possui colunas na fórmula.`);
      }

      const dependencySeries = await Promise.all(
        dependencies.map((column) =>
          fetchDataPoints({
            ...basePayload,
            metric: column,
          })
        )
      );

      const rows = new Map<
        string,
        {
          label: string;
          values: Record<string, number>;
        }
      >();

      dependencySeries.forEach((series, index) => {
        const columnName = dependencies[index];
        series.forEach((point) => {
          const label = point.label ?? 'Total';
          if (!rows.has(label)) {
            rows.set(label, { label, values: {} });
          }
          rows.get(label)!.values[columnName] = Number(point.value ?? 0);
        });
      });

      return Array.from(rows.values()).map((entry) => ({
        label: entry.label,
        value: evaluateCalculatedMetric(ref.definition.formula, entry.values),
      }));
    };

    let cancelled = false;
    const canBatchColumns = metricRef?.type === 'column' && metricYRef?.type === 'column';

    setIsLoading(true);
    setError(null);

    const promise = canBatchColumns
      ? fetchDataPoints({
          ...basePayload,
          metric: metricRef!.name,
          metricY: metricYRef!.name,
        }).then((series) => ({ primary: series, secondary: [] as DataPoint[], batched: true }))
      : Promise.all([loadSeries(metricRef), loadSeries(metricYRef)]).then(
          ([primary, secondary]) => ({ primary, secondary, batched: false })
        );

    promise
      .then(({ primary, secondary, batched }) => {
        if (cancelled) return;
        if (batched) {
          setData(
            primary.map((point) => ({
              label: point.label ?? 'Total',
              value: Number(point.value ?? 0),
              valueY: point.valueY,
            }))
          );
          return;
        }
        const map = new Map<string, { label: string; value?: number; valueY?: number }>();

        const mergeSeries = (series: DataPoint[], key: 'value' | 'valueY') => {
          series.forEach((point) => {
            const label = point.label ?? 'Total';
            if (!map.has(label)) {
              map.set(label, { label });
            }
            map.get(label)![key] = Number(point[key] ?? point.value ?? 0);
          });
        };

        mergeSeries(primary, 'value');
        mergeSeries(secondary, 'valueY');

        setData(
          Array.from(map.values()).map((entry) => ({
            label: entry.label,
            value: entry.value ?? 0,
            valueY: entry.valueY,
          }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao consultar dados.');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    sourceId,
    table,
    dimension,
    metricRef,
    metricYRef,
    calculatedOverrides,
    dateRange,
    dateColumn,
    shareSlug,
    dimensionFilter,
  ]);

  const rows = useMemo(() => {
    const parseNumber = (input: unknown): number => {
      if (typeof input === 'number' && Number.isFinite(input)) {
        return input;
      }
      const numeric = Number(input ?? 0);
      return Number.isFinite(numeric) ? numeric : 0;
    };

    return (data ?? []).map((point) => ({
      label: point.label,
      value: parseNumber(point.value),
      valueY: point.valueY !== undefined ? parseNumber(point.valueY) : undefined,
    }));
  }, [data]);

  return { rows, isLoading, error };
};
