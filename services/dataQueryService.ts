import { httpRequest } from './httpClient';

import { ComparisonState } from '../types';

export interface DataQueryPayload {
  data_source_id: string;
  table: string;
  dimension?: string;
  metric?: string;
  metricY?: string;
  dateRange?: { start: string; end: string };
  date_column?: string;
  share_slug?: string;
  mode?: 'table' | 'dimension';
  dimensions?: string[];
  metrics?: string[];
  limit?: number;
  dimension_filter?: { dimension: string; value: string };
  comparison?: ComparisonState;
}

export interface DataPoint {
  label: string;
  value: number;
  valueY?: number;
}

export interface DimensionValue {
  label: string;
}

export interface TableQueryResponse {
  dimensions: string[];
  metrics: string[];
  comparison?: {
    enabled: boolean;
    mode: Exclude<ComparisonState['mode'], 'off'>;
    current_range: { start: string; end: string };
    comparison_range: { start: string; end: string };
  };
  rows: {
    dimensions: (string | number | null)[];
    metrics: number[];
    comparison_metrics?: number[];
    delta_percentages?: (number | null)[];
  }[];
}

export async function fetchDataPoints(payload: DataQueryPayload) {
  return httpRequest<DataPoint[]>('/data-query', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'FetchDataPoints',
  });
}

export async function fetchTableData(payload: DataQueryPayload) {
  return httpRequest<TableQueryResponse>('/data-query', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'FetchTableData',
  });
}

export async function fetchDimensionValues(payload: DataQueryPayload) {
  return httpRequest<DimensionValue[]>('/data-query', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'FetchDimensionValues',
  });
}
