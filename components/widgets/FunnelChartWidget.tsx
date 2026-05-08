import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Widget, GlobalFilterState, CalculatedMetric } from '../../types';
import { fetchDataPoints } from '../../services/dataQueryService';
import { useCalculatedMetrics } from '../../hooks/useCalculatedMetrics';
import { getCalculatedMetricKey, extractMetricDependencies, evaluateCalculatedMetric } from '../../utils/calculatedMetrics';
import { useWidgetDebug } from '../../hooks/useWidgetDebug';

interface FunnelChartProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

type FunnelValue = {
  label: string;
  value: number;
};

type MetricReference =
  | { type: 'column'; name: string }
  | { type: 'calculated'; definition: CalculatedMetric };

const MIN_STEPS = 3;

export const FunnelChartWidget: React.FC<FunnelChartProps> = ({ widget, globalFilter, shareSlug }) => {
  const [values, setValues] = useState<FunnelValue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { metrics: calculatedMetrics } = useCalculatedMetrics();

  const steps = useMemo(() => {
    const raw = widget.dataConfig?.funnelSteps ?? [];
    const normalized = raw.map((step, index) => ({
      label: step.label?.trim() || `Etapa ${index + 1}`,
      metric: step.metric?.trim() || '',
    }));
    return normalized.length >= MIN_STEPS ? normalized : [
      { label: 'Etapa 1', metric: '' },
      { label: 'Etapa 2', metric: '' },
      { label: 'Etapa 3', metric: '' },
    ];
  }, [widget.dataConfig?.funnelSteps]);

  const resolveMetric = useCallback(
    (value?: string | null): MetricReference | null => {
      if (!value) return null;
      const key = getCalculatedMetricKey(value);
      if (key) {
        const definition =
          calculatedMetrics.find((metricDef) => metricDef.key === key) ??
          widget.dataConfig?.calculatedMetricOverrides?.[key];
        if (!definition) return null;
        return { type: 'calculated', definition };
      }
      return { type: 'column', name: value };
    },
    [calculatedMetrics, widget.dataConfig?.calculatedMetricOverrides]
  );

  useEffect(() => {
    if (!widget.dataConfig?.sourceId || !widget.dataConfig?.tableName) {
      return;
    }

    const invalid = steps.some((step) => !step.metric);
    if (invalid) {
      setValues([]);
      setError('Selecione métricas para todas as etapas.');
      return;
    }

    const basePayload = {
      data_source_id: widget.dataConfig.sourceId,
      table: widget.dataConfig.tableName,
      dateRange: globalFilter.dateRange,
      date_column: widget.dataConfig?.dateColumn ?? 'Data',
      share_slug: shareSlug,
      dimension_filter:
        globalFilter.dimensionFilter && globalFilter.dimensionFilter.value && globalFilter.dimensionFilter.value !== 'all'
          ? globalFilter.dimensionFilter
          : undefined,
    };

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const loadMetricValue = async (metric: string): Promise<number> => {
      const ref = resolveMetric(metric);
      if (!ref) return 0;
      if (ref.type === 'column') {
        const data = await fetchDataPoints({ ...basePayload, metric: ref.name });
        const total = data.find((point) => point.label === 'Total') ?? data[0];
        return Number(total?.value ?? 0);
      }

      const dependencies = extractMetricDependencies(ref.definition.formula);
      if (dependencies.length === 0) {
        throw new Error(`Métrica ${ref.definition.name} não possui colunas na fórmula.`);
      }
      const dependencySeries = await Promise.all(
        dependencies.map((column) => fetchDataPoints({ ...basePayload, metric: column }))
      );
      const valuesMap: Record<string, number> = {};
      dependencySeries.forEach((series, index) => {
        const columnName = dependencies[index];
        const total = series.find((point) => point.label === 'Total') ?? series[0];
        valuesMap[columnName] = Number(total?.value ?? 0);
      });
      return evaluateCalculatedMetric(ref.definition.formula, valuesMap);
    };

    Promise.all(steps.map((step) => loadMetricValue(step.metric)))
      .then((results) => {
        if (cancelled) return;
        const nextValues = steps.map((step, index) => ({
          label: step.label,
          value: Number.isFinite(results[index]) ? results[index] : 0,
        }));
        setValues(nextValues);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
        setValues([]);
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
    widget.dataConfig?.sourceId,
    widget.dataConfig?.tableName,
    widget.dataConfig?.dateColumn,
    widget.dataConfig?.calculatedMetricOverrides,
    globalFilter,
    shareSlug,
    steps,
    resolveMetric,
  ]);

  useWidgetDebug({
    widgetId: widget.id,
    type: widget.type,
    sourceId: widget.dataConfig?.sourceId,
    tableName: widget.dataConfig?.tableName,
    dimension: '',
    metric: steps.map((step) => step.metric).join(','),
    metricY: '',
    rows: values.length,
    status:
      !widget.dataConfig?.sourceId || !widget.dataConfig?.tableName
        ? 'missing_config'
        : isLoading
        ? 'loading'
        : error
        ? 'error'
        : values.length > 0
        ? 'rendered'
        : 'empty',
    reason: error ?? undefined,
  });

  if (!widget.dataConfig?.sourceId || !widget.dataConfig?.tableName) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-red-500 bg-red-50 rounded-xl border border-dashed border-red-200">
        <p>Configure uma fonte e tabela para este widget.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <p>Carregando dados…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-red-500 bg-red-50 rounded-xl border border-dashed border-red-200">
        <p>Erro ao carregar dados.</p>
        <p className="text-xs text-red-400 mt-1">{error}</p>
      </div>
    );
  }

  if (values.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <p>Nenhum dado encontrado para este funil.</p>
      </div>
    );
  }

  const maxValue = Math.max(...values.map((item) => item.value), 1);
  const colors = ['#1E2A78', '#3E56E1', '#5B6DFF', '#7C8BFF', '#9CA7FF', '#B8BFFF'];

  const maxBarWidth = 92;
  const minBarWidth = 45;
  const stepShrink = 12;

  return (
    <div className="w-full h-full flex flex-col gap-3 py-2">
      {values.map((step, index) => {
        const widthPercent = Math.max(minBarWidth, maxBarWidth - index * stepShrink);

        return (
          <div key={`${step.label}-${index}`} className="w-full flex justify-center">
            <div
              className="flex items-center justify-between px-6 text-white font-semibold shadow-sm"
              style={{
                width: `${widthPercent}%`,
                height: 58,
                background: colors[index % colors.length],
                borderRadius: 7,
              }}
            >
              <span className="text-sm truncate">{step.label}</span>
              <span className="text-sm">
                {step.value.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
