import { useEffect, useState } from 'react';
import { fetchDimensionValues } from '../services/dataQueryService';
import { GlobalFilterState } from '../types';

interface UseDimensionOptionsParams {
  enabled: boolean;
  sourceId?: string;
  table?: string;
  dimension?: string;
  dateRange?: GlobalFilterState['dateRange'];
  dateColumn?: string;
  shareSlug?: string;
  dimensionFilter?: GlobalFilterState['dimensionFilter'];
}

export const useDimensionOptions = ({
  enabled,
  sourceId,
  table,
  dimension,
  dateRange,
  dateColumn,
  shareSlug,
  dimensionFilter,
}: UseDimensionOptionsParams) => {
  const [options, setOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !sourceId || !table || !dimension) {
      return;
    }

    setIsLoading(true);
    setError(null);

    fetchDimensionValues({
      mode: 'dimension',
      data_source_id: sourceId,
      table,
      dimension,
      dateRange,
      date_column: dateColumn,
      share_slug: shareSlug,
      ...(dimensionFilter ? { dimension_filter: dimensionFilter } : {}),
    })
      .then((payload) => setOptions(payload.map((item) => item.label)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao consultar opções.'))
      .finally(() => setIsLoading(false));
  }, [enabled, sourceId, table, dimension, dateRange, dateColumn, shareSlug, dimensionFilter]);

  return { options, isLoading, error };
};
