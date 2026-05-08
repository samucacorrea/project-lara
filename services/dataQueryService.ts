import { httpRequest } from './httpClient';

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
  rows: {
    dimensions: (string | number | null)[];
    metrics: number[];
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
