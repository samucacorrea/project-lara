import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Legend } from 'recharts';
import { Widget, GlobalFilterState } from '../../types';
import { useWidgetData } from '../../hooks/useWidgetData';
import { resolveComparisonDateRange } from '../../utils/comparisonRange';

interface ChartWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const BarChartWidget: React.FC<ChartWidgetProps> = ({ widget, globalFilter, shareSlug }) => {
  const primaryMetric = widget.dataConfig?.metricX || widget.dataConfig?.metric || '';
  const dimension = widget.dataConfig?.dimension || '';
  const ready = Boolean(widget.dataConfig?.sourceId) && Boolean(widget.dataConfig?.tableName) && Boolean(primaryMetric) && Boolean(dimension);
  const comparisonDateRange = useMemo(() => resolveComparisonDateRange(globalFilter), [globalFilter]);

  const currentQuery = useWidgetData({
    enabled: ready,
    sourceId: widget.dataConfig?.sourceId,
    table: widget.dataConfig?.tableName,
    dimension,
    metric: primaryMetric,
    metricY: undefined,
    calculatedOverrides: widget.dataConfig?.calculatedMetricOverrides,
    dateRange: globalFilter.dateRange,
    dateColumn: widget.dataConfig?.dateColumn ?? 'Data',
    shareSlug,
    dimensionFilter: globalFilter.dimensionFilter,
  });

  const comparisonQuery = useWidgetData({
    enabled: ready && Boolean(comparisonDateRange),
    sourceId: widget.dataConfig?.sourceId,
    table: widget.dataConfig?.tableName,
    dimension,
    metric: primaryMetric,
    metricY: undefined,
    calculatedOverrides: widget.dataConfig?.calculatedMetricOverrides,
    dateRange: comparisonDateRange ?? undefined,
    dateColumn: widget.dataConfig?.dateColumn ?? 'Data',
    shareSlug,
    dimensionFilter: globalFilter.dimensionFilter,
  });

  if (!ready) {
    return <StateBox tone="error" title="Configure dimensão e métrica para este gráfico." detail="Verifique a fonte, tabela e colunas." />;
  }

  const isLoading = currentQuery.isLoading || (comparisonDateRange ? comparisonQuery.isLoading : false);
  if (isLoading) {
    return <StateBox title="Carregando dados…" />;
  }

  const error = currentQuery.error || (comparisonDateRange ? comparisonQuery.error : null);
  if (error) {
    return <StateBox tone="error" title="Erro ao carregar dados." detail={error} />;
  }

  if (currentQuery.rows.length === 0) {
    return <StateBox title="Nenhum dado encontrado para este filtro." detail="Ajuste o período ou selecione outra dimensão." />;
  }

  const comparisonMap = new Map((comparisonQuery.rows ?? []).map((row) => [row.label, row.value]));
  const data = currentQuery.rows.map((row) => ({
    label: row.label,
    value: row.value,
    comparisonValue: comparisonDateRange ? comparisonMap.get(row.label) ?? 0 : undefined,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} dy={10} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} />
        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
        {comparisonDateRange && <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />}
        {comparisonDateRange && <Bar dataKey="comparisonValue" name="Comparativo" fill="#cbd5e1" radius={[6, 6, 0, 0]} barSize={18} />}
        <Bar dataKey="value" name="Atual" fill="#5B4DFF" radius={[6, 6, 6, 6]} barSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
};

const StateBox: React.FC<{ title: string; detail?: string; tone?: 'neutral' | 'error' }> = ({ title, detail, tone = 'neutral' }) => {
  const palette =
    tone === 'error'
      ? 'text-red-500 bg-red-50 border-red-200'
      : 'text-gray-500 bg-gray-50 border-gray-200';
  const detailColor = tone === 'error' ? 'text-red-400' : 'text-gray-400';

  return (
    <div className={`flex flex-col items-center justify-center h-full w-full text-center text-sm rounded-xl border border-dashed ${palette}`}>
      <p>{title}</p>
      {detail ? <p className={`text-xs ${detailColor} mt-1`}>{detail}</p> : null}
    </div>
  );
};
