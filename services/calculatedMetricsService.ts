import { CalculatedMetric, CalculatedMetricPayload } from '../types';
import { httpRequest } from './httpClient';

type ApiMetric = {
  id: number;
  name: string;
  metric_key: string;
  formula: string;
  output_format: 'number' | 'decimal' | 'currency' | 'percent';
  created_at?: string;
  updated_at?: string;
};

const normalize = (metric: ApiMetric): CalculatedMetric => ({
  id: metric.id,
  name: metric.name,
  key: metric.metric_key,
  formula: metric.formula,
  outputFormat: metric.output_format,
  createdAt: metric.created_at,
  updatedAt: metric.updated_at,
});

export async function listCalculatedMetrics() {
  const response = await httpRequest<ApiMetric[]>('/calculated-metrics', {
    method: 'GET',
    label: 'ListCalculatedMetrics',
  });
  return response.map(normalize);
}

export async function createCalculatedMetric(payload: CalculatedMetricPayload) {
  const body = {
    name: payload.name,
    metric_key: payload.metricKey,
    formula: payload.formula,
    output_format: payload.outputFormat,
  };
  const response = await httpRequest<ApiMetric>('/calculated-metrics', {
    method: 'POST',
    body: JSON.stringify(body),
    label: 'CreateCalculatedMetric',
  });
  return normalize(response);
}

export async function updateCalculatedMetric(id: number, payload: CalculatedMetricPayload) {
  const body = {
    name: payload.name,
    metric_key: payload.metricKey,
    formula: payload.formula,
    output_format: payload.outputFormat,
  };
  const response = await httpRequest<ApiMetric>(`/calculated-metrics/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    label: 'UpdateCalculatedMetric',
  });
  return normalize(response);
}

export async function deleteCalculatedMetric(id: number) {
  await httpRequest<void>(`/calculated-metrics/${id}`, {
    method: 'DELETE',
    label: 'DeleteCalculatedMetric',
  });
}
