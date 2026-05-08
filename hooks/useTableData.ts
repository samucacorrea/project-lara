import { useEffect, useState } from 'react';
import { fetchTableData, TableQueryResponse } from '../services/dataQueryService';
import { GlobalFilterState } from '../types';

interface UseTableDataParams {
  enabled: boolean;
  sourceId?: string;
  table?: string;
  dimensions: string[];
  metrics: string[];
  dateRange?: GlobalFilterState['dateRange'];
  dateColumn?: string;
  shareSlug?: string;
  limit?: number;
  dimensionFilter?: GlobalFilterState['dimensionFilter'];
}

export const useTableData = ({
  enabled,
  sourceId,
  table,
  dimensions,
  metrics,
  dateRange,
  dateColumn,
  shareSlug,
  limit,
  dimensionFilter,
}: UseTableDataParams) => {
  const [data, setData] = useState<TableQueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !sourceId || !table || dimensions.length === 0 || metrics.length === 0) {
      return;
    }

    setIsLoading(true);
    setError(null);
    fetchTableData({
      data_source_id: sourceId,
      table,
      dimensions,
      metrics,
      mode: 'table',
      dateRange,
      date_column: dateColumn,
      share_slug: shareSlug,
      limit,
      dimension_filter:
        dimensionFilter && dimensionFilter.value && dimensionFilter.value !== 'all'
          ? dimensionFilter
          : undefined,
    })
      .then((response) => setData(response))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao consultar dados.'))
      .finally(() => setIsLoading(false));
  }, [enabled, sourceId, table, dimensions, metrics, dateRange, dateColumn, shareSlug, limit, dimensionFilter]);

  return { data, isLoading, error };
};
