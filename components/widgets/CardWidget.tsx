import React, { useMemo } from 'react';
import { Widget, GlobalFilterState } from '../../types';
import { CARD_ICON_MAP } from './cardIcons';
import { formatMetricValue } from '../../utils/numberFormat';
import { useWidgetData } from '../../hooks/useWidgetData';
import { resolveComparisonDateRange } from '../../utils/comparisonRange';

interface CardWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const CardWidget: React.FC<CardWidgetProps> = ({ widget, globalFilter, shareSlug }) => {
  const primaryMetric = widget.dataConfig?.metricX || widget.dataConfig?.metric || '';
  const readyForCard = Boolean(widget.dataConfig?.sourceId) && Boolean(widget.dataConfig?.tableName) && Boolean(primaryMetric);

  const comparisonDateRange = useMemo(() => resolveComparisonDateRange(globalFilter), [globalFilter]);

  const currentQuery = useWidgetData({
    enabled: readyForCard,
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
    enabled: readyForCard && Boolean(comparisonDateRange),
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

  const renderStateBox = (
    content: React.ReactNode,
    tone: 'neutral' | 'error' = 'neutral',
    detail?: string
  ) => {
    const palette =
      tone === 'error'
        ? 'text-red-500 bg-red-50 border-red-200'
        : 'text-gray-500 bg-gray-50 border-gray-200';
    const detailColor = tone === 'error' ? 'text-red-400' : 'text-gray-400';

    return (
      <div
        className={`flex flex-col items-center justify-center h-full w-full text-center text-sm rounded-xl border border-dashed ${palette}`}
      >
        {content}
        {detail ? <p className={`text-xs ${detailColor} mt-1`}>{detail}</p> : null}
      </div>
    );
  };

  if (!readyForCard) {
    return renderStateBox(
      <p>Configure uma métrica para este card.</p>,
      'error',
      'Verifique a fonte, tabela e métrica principal.'
    );
  }

  const isLoading = currentQuery.isLoading || (comparisonDateRange ? comparisonQuery.isLoading : false);
  if (isLoading) {
    return renderStateBox(<p>Carregando dados…</p>, 'neutral');
  }

  const error = currentQuery.error || (comparisonDateRange ? comparisonQuery.error : null);
  if (error) {
    return renderStateBox(<p>Erro ao carregar dados.</p>, 'error', error);
  }

  if (currentQuery.rows.length === 0) {
    return renderStateBox(
      <p>Nenhum dado encontrado para este filtro.</p>,
      'neutral',
      'Ajuste o período ou selecione outra métrica.'
    );
  }

  const value = currentQuery.rows.reduce((sum, row) => sum + row.value, 0);
  const comparisonValue = comparisonDateRange
    ? comparisonQuery.rows.reduce((sum, row) => sum + row.value, 0)
    : null;

  const metaValue = widget.dataConfig?.meta;
  const targetValue = typeof metaValue === 'number' && !Number.isNaN(metaValue) ? metaValue : null;
  const progress = targetValue && targetValue > 0 ? Math.min(value / targetValue, 1) : 1;
  const circleRadius = 52;
  const circumference = 2 * Math.PI * circleRadius;
  const dashOffset = circumference * (1 - progress);
  const label = widget.dataConfig?.cardLabel || 'Orders';
  const iconKey = widget.dataConfig?.cardIcon || 'bag';
  const iconSrc = CARD_ICON_MAP[iconKey] ?? CARD_ICON_MAP.bag;
  const formattedValue = formatMetricValue(value, {
    format: widget.dataConfig?.valueFormat,
    decimalPlaces: widget.dataConfig?.decimalPlaces,
    currencySymbol: widget.dataConfig?.currencySymbol,
  });

  const fontFamily = widget.style.contentFontFamily ?? widget.style.fontFamily ?? 'Inter, system-ui, sans-serif';
  const fontSize = widget.style.contentFontSize ?? widget.style.fontSize ?? 32;
  const color = widget.style.contentColor ?? widget.style.color ?? '#0f172a';
  const align = widget.style.contentTextAlign ?? widget.style.textAlign ?? 'left';
  const padding = widget.style.contentPadding ?? widget.style.padding ?? 16;

  const alignToJustify: Record<string, 'flex-start' | 'center' | 'flex-end'> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };

  let comparisonContent: React.ReactNode = <span className="w-2 h-2 rounded-full bg-emerald-500"></span>;
  if (comparisonDateRange) {
    let comparisonText = '—';
    let comparisonClass = 'text-slate-400';

    if (comparisonValue !== null) {
      if (Math.abs(comparisonValue) < 0.0000001) {
        if (Math.abs(value) < 0.0000001) {
          comparisonText = '0,0%';
        }
      } else {
        const delta = ((value - comparisonValue) / Math.abs(comparisonValue)) * 100;
        const positive = delta >= 0;
        comparisonText = `${positive ? '↑' : '↓'} ${Math.abs(delta).toLocaleString('pt-BR', {
          maximumFractionDigits: 1,
        })}%`;
        comparisonClass = positive ? 'text-emerald-500' : 'text-rose-500';
      }
    }

    comparisonContent = <span className={comparisonClass}>{comparisonText}</span>;
  }

  return (
    <div
      className="flex items-center gap-6 w-full h-full"
      style={{
        paddingLeft: padding,
        paddingRight: padding,
        justifyContent: alignToJustify[align] ?? 'flex-start',
      }}
    >
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 120 120" className="absolute inset-0">
          <circle cx="60" cy="60" r={circleRadius} stroke="#eef2ff" strokeWidth="12" fill="none" />
          <circle
            cx="60"
            cy="60"
            r={circleRadius}
            stroke="#5B4DFF"
            strokeWidth="12"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] flex items-center justify-center">
            <img src={iconSrc} alt={label} className="w-7 h-7" />
          </div>
        </div>
      </div>
      <div style={{ textAlign: align }}>
        <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
        <p
          style={{
            fontFamily,
            fontSize,
            color,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {formattedValue}
        </p>
        <p className="text-xs font-medium mt-1 flex items-center gap-1">{comparisonContent}</p>
      </div>
    </div>
  );
};
