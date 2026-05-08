import React from 'react';
import { Widget, GlobalFilterState } from '../../types';
import { useWidgetData } from '../../hooks/useWidgetData';
import { useWidgetDebug } from '../../hooks/useWidgetDebug';

interface BaseWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  requiresMetric?: boolean;
  shareSlug?: string;
  children: (context: {
    rows: { label: string; value: number; valueY?: number }[];
    isLoading: boolean;
    error: string | null;
  }) => React.ReactNode;
}

export const BaseWidget: React.FC<BaseWidgetProps> = ({
  widget,
  globalFilter,
  requiresMetric = true,
  shareSlug,
  children,
}) => {
  const primaryMetric = widget.dataConfig?.metricX || widget.dataConfig?.metric || '';
  const secondaryMetric = widget.dataConfig?.metricY;
  const needsDimension = !['gauge', 'counter', 'card'].includes(widget.type);
  const dimension = needsDimension ? widget.dataConfig?.dimension || '' : '';
  const metricField = primaryMetric || secondaryMetric || (needsDimension ? dimension : '');
  const readyForChart =
    Boolean(widget.dataConfig?.sourceId) &&
    Boolean(widget.dataConfig?.tableName) &&
    (needsDimension ? Boolean(dimension) : true) &&
    (requiresMetric ? Boolean(primaryMetric) : Boolean(metricField));

  const { rows, isLoading, error } = useWidgetData({
    enabled: readyForChart,
    sourceId: widget.dataConfig?.sourceId,
    table: widget.dataConfig?.tableName,
    dimension: needsDimension ? dimension : undefined,
    metric: metricField,
    metricY: secondaryMetric,
    calculatedOverrides: widget.dataConfig?.calculatedMetricOverrides,
    dateRange: globalFilter.dateRange,
    dateColumn: widget.dataConfig?.dateColumn ?? 'Data',
    shareSlug,
    dimensionFilter: globalFilter.dimensionFilter,
  });

  useWidgetDebug({
    widgetId: widget.id,
    type: widget.type,
    sourceId: widget.dataConfig?.sourceId,
    tableName: widget.dataConfig?.tableName,
    dimension,
    metric: primaryMetric,
    metricY: secondaryMetric,
    rows: rows.length,
    status: readyForChart
      ? isLoading
        ? 'loading'
        : error
        ? 'error'
        : rows.length > 0
        ? 'rendered'
        : 'empty'
      : 'missing_config',
    reason: error ?? undefined,
  });

  if (!readyForChart) {
    const fields: string[] = [];
    if (needsDimension) fields.push('uma dimensão');
    if (requiresMetric) fields.push('uma métrica');
    const hint = fields.length ? fields.join(' e ') : 'os campos obrigatórios';

    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-red-500 bg-red-50 rounded-xl border border-dashed border-red-200">
        <p>Configure {hint} para este widget.</p>
        <p className="text-xs text-red-400 mt-1">Verifique a fonte, tabela e colunas.</p>
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

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <p>Nenhum dado encontrado para este filtro.</p>
        <p className="text-xs text-gray-400 mt-1">Ajuste o período ou selecione outra dimensão.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-w-[220px] relative flex items-center justify-center">
      {children({ rows, isLoading, error })}
    </div>
  );
};
