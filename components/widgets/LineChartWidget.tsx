import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Widget, GlobalFilterState } from '../../types';
import { useWidgetData } from '../../hooks/useWidgetData';
import { resolveComparisonDateRange } from '../../utils/comparisonRange';

interface ChartWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const LineChartWidget: React.FC<ChartWidgetProps> = ({ widget, globalFilter, shareSlug }) => {
  const metricLabel = widget.dataConfig?.metricX || widget.dataConfig?.metric || 'Valor principal';
  const dimension = widget.dataConfig?.dimension || '';
  const secondaryLabel = widget.dataConfig?.metricY || null;
  const ready = Boolean(widget.dataConfig?.sourceId) && Boolean(widget.dataConfig?.tableName) && Boolean(metricLabel) && Boolean(dimension);
  const comparisonDateRange = useMemo(() => resolveComparisonDateRange(globalFilter), [globalFilter]);

  const currentQuery = useWidgetData({
    enabled: ready,
    sourceId: widget.dataConfig?.sourceId,
    table: widget.dataConfig?.tableName,
    dimension,
    metric: metricLabel,
    metricY: secondaryLabel ?? undefined,
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
    metric: metricLabel,
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

  const hasSecondary = secondaryLabel && currentQuery.rows.some((row) => typeof row.valueY === 'number');
  const useSecondaryAxis = (widget.dataConfig?.lineSecondaryAxis ?? false) && hasSecondary;

  const sortRows = (rows: Array<{ label: string; value: number; valueY?: number }>) =>
    [...rows].sort((a, b) => {
      const toDateValue = (value: string): number | null => {
        if (!value) return null;
        if (value.toLowerCase() === 'total') return Number.POSITIVE_INFINITY;
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
          const parsed = Date.parse(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
          const [day, month, year] = value.split('/').map((part) => Number(part));
          if (!day || !month || !year) return null;
          return new Date(year, month - 1, day).getTime();
        }
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const aDate = toDateValue(String(a.label ?? ''));
      const bDate = toDateValue(String(b.label ?? ''));
      if (aDate !== null && bDate !== null) {
        return aDate - bDate;
      }
      return String(a.label ?? '').localeCompare(String(b.label ?? ''), 'pt-BR');
    });

  const currentSorted = sortRows(currentQuery.rows);
  const comparisonSorted = comparisonDateRange ? sortRows(comparisonQuery.rows) : [];

  const sortedRows = currentSorted.map((row, index) => ({
    label: row.label,
    value: row.value,
    valueY: row.valueY,
    comparisonValue: comparisonDateRange ? comparisonSorted[index]?.value ?? undefined : undefined,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
      <LineChart data={sortedRows} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical stroke="#eef2ff" />
        <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={{ stroke: '#CBD5F5', strokeWidth: 1 }} tick={{ fill: '#94a3b8' }} dy={10} />
        <YAxis width={48} fontSize={11} tickLine={{ stroke: '#CBD5F5' }} axisLine={{ stroke: '#CBD5F5', strokeWidth: 1 }} tick={{ fill: '#94a3b8' }} tickFormatter={(value) => value.toLocaleString('pt-BR')} yAxisId="left" />
        {useSecondaryAxis && (
          <YAxis
            width={48}
            orientation="right"
            fontSize={11}
            tickLine={{ stroke: '#5EEAD4' }}
            axisLine={{ stroke: '#5EEAD4', strokeWidth: 1 }}
            tick={{ fill: '#0f766e' }}
            tickFormatter={(value) => value.toLocaleString('pt-BR')}
            yAxisId="right"
          />
        )}
        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value: number, name: string) => [value.toLocaleString('pt-BR'), name]} />
        <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />
        {comparisonDateRange && (
          <Line
            type="monotone"
            dataKey="comparisonValue"
            name={`${metricLabel} comparativo`}
            stroke="#94a3b8"
            strokeWidth={2}
            dot={false}
            strokeDasharray="6 4"
            yAxisId="left"
          />
        )}
        <Line type="monotone" dataKey="value" name={metricLabel} stroke="#5B4DFF" strokeWidth={3} dot={{ strokeWidth: 2, fill: '#5B4DFF' }} activeDot={{ r: 6 }} yAxisId="left" />
        {hasSecondary && (
          <Line type="monotone" dataKey="valueY" name={secondaryLabel ?? 'Série 2'} stroke="#14b8a6" strokeWidth={3} dot={{ strokeWidth: 2, fill: '#14b8a6' }} activeDot={{ r: 6 }} yAxisId={useSecondaryAxis ? 'right' : 'left'} />
        )}
      </LineChart>
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
