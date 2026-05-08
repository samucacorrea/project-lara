import React, { useCallback, useMemo, useState } from 'react';
import { Widget, GlobalFilterState } from '../../types';
import { useTableData } from '../../hooks/useTableData';
import { useWidgetDebug } from '../../hooks/useWidgetDebug';

interface TableWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

type SortConfig =
  | {
      kind: 'dimension' | 'metric';
      index: number;
      direction: 'asc' | 'desc';
    }
  | null;

const sanitizeList = (values: (string | undefined | null)[], limit: number) => {
  const result: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });

  return result.slice(0, limit);
};

const formatMissingConfigMessage = (
  needsDimensions: boolean,
  needsMetrics: boolean
): { title: string; hint: string } => {
  if (needsDimensions && needsMetrics) {
    return {
      title: 'Configure dimensões e métricas para esta tabela.',
      hint: 'Escolha até 3 dimensões e até 10 métricas para continuar.',
    };
  }

  if (needsDimensions) {
    return {
      title: 'Selecione ao menos uma dimensão.',
      hint: 'Você pode combinar até 3 colunas categóricas.',
    };
  }

  return {
    title: 'Selecione ao menos uma métrica.',
    hint: 'Adicione até 10 colunas numéricas para análise.',
  };
};

export const TableWidget: React.FC<TableWidgetProps> = ({ widget, globalFilter, shareSlug }) => {
  const dimensionColumns = useMemo(() => {
    const raw =
      widget.dataConfig?.tableDimensions && widget.dataConfig.tableDimensions.length > 0
        ? widget.dataConfig.tableDimensions
        : widget.dataConfig?.dimension
        ? [widget.dataConfig.dimension]
        : [];
    return sanitizeList(raw, 3);
  }, [widget.dataConfig?.dimension, widget.dataConfig?.tableDimensions]);

  const metricColumns = useMemo(() => {
    const raw =
      widget.dataConfig?.tableMetrics && widget.dataConfig.tableMetrics.length > 0
        ? widget.dataConfig.tableMetrics
        : [
            widget.dataConfig?.metricX,
            widget.dataConfig?.metricY,
            widget.dataConfig?.metric,
          ];
    return sanitizeList(raw, 10);
  }, [
    widget.dataConfig?.metric,
    widget.dataConfig?.metricX,
    widget.dataConfig?.metricY,
    widget.dataConfig?.tableMetrics,
  ]);

  const parsedLimit = useMemo(() => {
    const raw = widget.dataConfig?.limit;
    if (raw === null || raw === undefined) return undefined;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
  }, [widget.dataConfig?.limit]);

  const readyForTable =
    Boolean(widget.dataConfig?.sourceId) &&
    Boolean(widget.dataConfig?.tableName) &&
    dimensionColumns.length > 0 &&
    metricColumns.length > 0;

  const { data, isLoading, error } = useTableData({
    enabled: readyForTable,
    sourceId: widget.dataConfig?.sourceId,
    table: widget.dataConfig?.tableName,
    dimensions: dimensionColumns,
    metrics: metricColumns,
    dateRange: globalFilter.dateRange,
    dateColumn: widget.dataConfig?.dateColumn ?? 'Data',
    shareSlug,
    limit: parsedLimit,
    dimensionFilter: globalFilter.dimensionFilter,
  });

  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 2,
      }),
    []
  );

  const safeRows = useMemo(() => {
    if (!data) return [];
    return data.rows.map((row) => ({
      dimensions: dimensionColumns.map((_, index) => row.dimensions[index] ?? null),
      metrics: metricColumns.map((_, index) => {
        const value = row.metrics[index];
        if (typeof value === 'number') return value;
        const numeric = Number(value ?? 0);
        return Number.isFinite(numeric) ? numeric : 0;
      }),
    }));
  }, [data, dimensionColumns, metricColumns]);

  const sortedRows = useMemo(() => {
    if (!sortConfig) return safeRows;
    const multiplier = sortConfig.direction === 'asc' ? 1 : -1;

    return [...safeRows].sort((a, b) => {
      if (sortConfig.kind === 'dimension') {
        const left = a.dimensions[sortConfig.index];
        const right = b.dimensions[sortConfig.index];
        const leftValue = left === null || left === undefined ? '' : String(left);
        const rightValue = right === null || right === undefined ? '' : String(right);
        if (leftValue === rightValue) return 0;
        return leftValue > rightValue ? multiplier : -multiplier;
      }

      const leftValue = a.metrics[sortConfig.index] ?? 0;
      const rightValue = b.metrics[sortConfig.index] ?? 0;
      if (leftValue === rightValue) return 0;
      return leftValue > rightValue ? multiplier : -multiplier;
    });
  }, [safeRows, sortConfig]);

  const toggleSort = useCallback((kind: 'dimension' | 'metric', index: number) => {
    setSortConfig((prev) => {
      if (prev && prev.kind === kind && prev.index === index) {
        if (prev.direction === 'desc') {
          return { ...prev, direction: 'asc' };
        }
        if (prev.direction === 'asc') {
          return null;
        }
      }
      return { kind, index, direction: 'desc' };
    });
  }, []);

  const formatDimensionValue = useCallback(
    (value: string | number | null | undefined) => {
      if (value === null || value === undefined || value === '') {
        return '—';
      }
      return typeof value === 'number' ? numberFormatter.format(value) : String(value);
    },
    [numberFormatter]
  );

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

  const currentStatus = !readyForTable
    ? 'missing_config'
    : isLoading
    ? 'loading'
    : error
    ? 'error'
    : data && data.rows.length > 0
    ? 'rendered'
    : 'empty';

  useWidgetDebug({
    widgetId: widget.id,
    type: widget.type,
    sourceId: widget.dataConfig?.sourceId,
    tableName: widget.dataConfig?.tableName,
    dimension: dimensionColumns.join(', '),
    metric: metricColumns.join(', '),
    rows: data?.rows.length ?? 0,
    status: currentStatus,
    reason: error ?? undefined,
  });

  if (!readyForTable) {
    const message = formatMissingConfigMessage(
      dimensionColumns.length === 0,
      metricColumns.length === 0
    );
    return renderStateBox(<p>{message.title}</p>, 'error', message.hint);
  }

  if (isLoading) {
    return renderStateBox(<p>Carregando dados…</p>, 'neutral', 'Buscando dados na fonte selecionada.');
  }

  if (error) {
    return renderStateBox(
      <p>Erro ao carregar dados.</p>,
      'error',
      error
    );
  }

  if (!data || data.rows.length === 0) {
    return renderStateBox(
      <p>Nenhum dado encontrado para este filtro.</p>,
      'neutral',
      'Ajuste o período ou selecione outra combinação de colunas.'
    );
  }

  const headerDimensions =
    data.dimensions && data.dimensions.length === dimensionColumns.length
      ? data.dimensions
      : dimensionColumns;
  const headerMetrics =
    data.metrics && data.metrics.length === metricColumns.length ? data.metrics : metricColumns;

  const renderSortIndicator = (kind: 'dimension' | 'metric', index: number) => {
    if (!sortConfig || sortConfig.kind !== kind || sortConfig.index !== index) return null;
    return (
      <span className="text-[10px] font-semibold text-slate-500">
        {sortConfig.direction === 'desc' ? '↓' : '↑'}
      </span>
    );
  };

  return (
    <div className="w-full h-full min-h-[220px] min-w-[220px] relative">
      <div className="overflow-auto h-full w-full custom-scrollbar rounded-xl border border-gray-100">
        <table className="min-w-full text-sm text-left text-gray-600">
          <thead className="text-xs text-gray-400 font-semibold uppercase bg-gray-50/60 sticky top-0 z-10">
            <tr>
              {headerDimensions.map((dimension, index) => (
                <th
                  key={`dimension-${dimension}-${index}`}
                  className="px-4 py-3 font-semibold tracking-wide cursor-pointer select-none"
                  onClick={() => toggleSort('dimension', index)}
                >
                  <div className="flex items-center gap-1">
                    <span>{dimension}</span>
                    {renderSortIndicator('dimension', index)}
                  </div>
                </th>
              ))}
              {headerMetrics.map((metric, index) => (
                <th
                  key={`metric-${metric}-${index}`}
                  className="px-4 py-3 font-semibold tracking-wide text-right cursor-pointer select-none"
                  onClick={() => toggleSort('metric', index)}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{metric}</span>
                    {renderSortIndicator('metric', index)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className="bg-white border-b border-gray-50 hover:bg-slate-50 transition-colors"
              >
                {row.dimensions.map((value, index) => (
                  <td
                    key={`row-${rowIndex}-dimension-${index}`}
                    className="px-4 py-3 text-gray-700 font-medium"
                  >
                    {formatDimensionValue(value)}
                  </td>
                ))}
                {row.metrics.map((value, index) => (
                  <td
                    key={`row-${rowIndex}-metric-${index}`}
                    className="px-4 py-3 text-right font-semibold text-slate-800"
                  >
                    {numberFormatter.format(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
