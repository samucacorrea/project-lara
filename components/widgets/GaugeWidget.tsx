import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Widget, GlobalFilterState } from '../../types';
import { useWidgetData } from '../../hooks/useWidgetData';
import { resolveComparisonDateRange } from '../../utils/comparisonRange';

interface ChartWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const GaugeWidget: React.FC<ChartWidgetProps> = ({ widget, globalFilter, shareSlug }) => {
  const primaryMetric = widget.dataConfig?.metricX || widget.dataConfig?.metric || '';
  const ready = Boolean(widget.dataConfig?.sourceId) && Boolean(widget.dataConfig?.tableName) && Boolean(primaryMetric);
  const comparisonDateRange = useMemo(() => resolveComparisonDateRange(globalFilter), [globalFilter]);

  const currentQuery = useWidgetData({
    enabled: ready,
    sourceId: widget.dataConfig?.sourceId,
    table: widget.dataConfig?.tableName,
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
    metric: primaryMetric,
    metricY: undefined,
    calculatedOverrides: widget.dataConfig?.calculatedMetricOverrides,
    dateRange: comparisonDateRange ?? undefined,
    dateColumn: widget.dataConfig?.dateColumn ?? 'Data',
    shareSlug,
    dimensionFilter: globalFilter.dimensionFilter,
  });

  if (!ready) {
    return <StateBox tone="error" title="Configure uma métrica para este gauge." detail="Verifique a fonte, tabela e métrica principal." />;
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
    return <StateBox title="Nenhum dado encontrado para este filtro." detail="Ajuste o período ou selecione outra métrica." />;
  }

  const total = currentQuery.rows.reduce((sum, row) => sum + row.value, 0);
  const comparisonTotal = comparisonDateRange ? comparisonQuery.rows.reduce((sum, row) => sum + row.value, 0) : null;
  const max = 10000;
  const percentage = Math.min(100, (total / max) * 100);
  const gaugeData = [{ value: percentage }, { value: 100 - percentage }];

  const fontFamily = widget.style.contentFontFamily ?? widget.style.fontFamily ?? 'Inter, system-ui, sans-serif';
  const fontSize = widget.style.contentFontSize ?? widget.style.fontSize ?? 28;
  const color = widget.style.contentColor ?? widget.style.color ?? '#0f172a';
  const align = widget.style.contentTextAlign ?? widget.style.textAlign ?? 'center';
  const padding = widget.style.contentPadding ?? widget.style.padding ?? 16;

  let deltaContent: React.ReactNode = null;
  if (comparisonDateRange) {
    let comparisonText = '—';
    let comparisonClass = 'text-slate-400';

    if (comparisonTotal !== null) {
      if (Math.abs(comparisonTotal) >= 0.0000001) {
        const delta = ((total - comparisonTotal) / Math.abs(comparisonTotal)) * 100;
        const positive = delta >= 0;
        comparisonText = `${positive ? '↑' : '↓'} ${Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
        comparisonClass = positive ? 'text-emerald-500' : 'text-rose-500';
      } else if (Math.abs(total) < 0.0000001) {
        comparisonText = '0,0%';
      }
    }

    deltaContent = <div className={`text-xs font-medium mt-1 ${comparisonClass}`}>{comparisonText}</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full relative w-full" style={{ padding }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={gaugeData} cx="50%" cy="70%" startAngle={180} endAngle={0} innerRadius="70%" outerRadius="100%" paddingAngle={0} dataKey="value" stroke="none">
            <Cell fill="#5B4DFF" />
            <Cell fill="#e2e8f0" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute bottom-4 w-full" style={{ textAlign: align as 'left' | 'center' | 'right' }}>
        <div style={{ fontFamily, fontSize, color, fontWeight: 700, lineHeight: 1.1 }}>
          {Math.round(percentage)}%
        </div>
        <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Goal Reached</div>
        {deltaContent}
      </div>
    </div>
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
