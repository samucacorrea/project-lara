import {
  DatasetDefinition,
  DatasetEdge,
  DatasetNode,
  DatasetPreviewResponse,
  DatasetPublishResponse,
  DatasetSelectedColumn,
  ExternalConnection,
  SourceDataset,
} from '../types';
import { httpRequest } from './httpClient';

function ensureArrayResponse<T>(value: unknown, label: string): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  const message =
    value && typeof value === 'object' && 'message' in (value as Record<string, unknown>)
      ? String((value as Record<string, unknown>).message)
      : `Resposta inválida em ${label}: esperado array.`;

  throw new Error(message);
}

export type ExternalConnectionPayload = {
  user_id?: number;
  name: string;
  provider: ExternalConnection['provider'];
  status?: ExternalConnection['status'];
  auth_type: ExternalConnection['auth_type'];
  config_json?: Record<string, unknown> | null;
};

export type DatasetDefinitionPayload = {
  user_id?: number;
  name: string;
  slug: string;
  description?: string | null;
  status?: DatasetDefinition['status'];
  warehouse_schema?: string;
  warehouse_table?: string | null;
  primary_date_field?: string | null;
  version?: number;
};

export type DatasetNodePayload = {
  node_type?: DatasetNode['node_type'];
  source_dataset_id?: number | null;
  label: string;
  pos_x?: number;
  pos_y?: number;
  config_json?: Record<string, unknown> | null;
};

export type DatasetEdgePayload = {
  from_node_id: number;
  to_node_id: number;
  join_type?: DatasetEdge['join_type'];
  from_field: string;
  to_field: string;
};

export type DatasetSelectedColumnPayload = {
  node_id: number;
  source_column: string;
  output_column: string;
  semantic_type?: string | null;
  aggregation_type?: DatasetSelectedColumn['aggregation_type'];
  is_dimension?: boolean;
  is_metric?: boolean;
  sort_order?: number;
};

export async function listExternalConnections(): Promise<ExternalConnection[]> {
  const response = await httpRequest<unknown>('/external-connections', {
    method: 'GET',
    label: 'ListExternalConnections',
  });
  return ensureArrayResponse<ExternalConnection>(response, 'ListExternalConnections');
}

export async function createExternalConnection(payload: ExternalConnectionPayload): Promise<ExternalConnection> {
  return httpRequest<ExternalConnection>('/external-connections', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'CreateExternalConnection',
  });
}

export async function updateExternalConnection(
  id: number,
  payload: Partial<ExternalConnectionPayload>
): Promise<ExternalConnection> {
  return httpRequest<ExternalConnection>(`/external-connections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateExternalConnection',
  });
}

export async function deleteExternalConnection(id: number): Promise<void> {
  await httpRequest<void>(`/external-connections/${id}`, {
    method: 'DELETE',
    label: 'DeleteExternalConnection',
  });
}

export async function listSourceDatasets(sourceKind?: string, sourceRefId?: number): Promise<SourceDataset[]> {
  const query =
    sourceKind && sourceRefId
      ? `?source_kind=${encodeURIComponent(sourceKind)}&source_ref_id=${encodeURIComponent(String(sourceRefId))}`
      : '';

  const response = await httpRequest<unknown>(`/source-datasets${query}`, {
    method: 'GET',
    label: 'ListSourceDatasets',
  });
  return ensureArrayResponse<SourceDataset>(response, 'ListSourceDatasets');
}

export async function listDatasetDefinitions(): Promise<DatasetDefinition[]> {
  const response = await httpRequest<unknown>('/dataset-definitions', {
    method: 'GET',
    label: 'ListDatasetDefinitions',
  });
  return ensureArrayResponse<DatasetDefinition>(response, 'ListDatasetDefinitions');
}

export async function createDatasetDefinition(payload: DatasetDefinitionPayload): Promise<DatasetDefinition> {
  return httpRequest<DatasetDefinition>('/dataset-definitions', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'CreateDatasetDefinition',
  });
}

export async function updateDatasetDefinition(id: number, payload: Partial<DatasetDefinitionPayload>): Promise<DatasetDefinition> {
  return httpRequest<DatasetDefinition>(`/dataset-definitions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateDatasetDefinition',
  });
}

export async function listDatasetNodes(datasetId: number): Promise<DatasetNode[]> {
  const response = await httpRequest<unknown>(`/dataset-definitions/${datasetId}/nodes`, {
    method: 'GET',
    label: 'ListDatasetNodes',
  });
  return ensureArrayResponse<DatasetNode>(response, 'ListDatasetNodes');
}

export async function createDatasetNode(datasetId: number, payload: DatasetNodePayload): Promise<DatasetNode> {
  return httpRequest<DatasetNode>(`/dataset-definitions/${datasetId}/nodes`, {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'CreateDatasetNode',
  });
}

export async function updateDatasetNode(datasetId: number, nodeId: number, payload: Partial<DatasetNodePayload>): Promise<DatasetNode> {
  return httpRequest<DatasetNode>(`/dataset-definitions/${datasetId}/nodes/${nodeId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateDatasetNode',
  });
}

export async function deleteDatasetNode(datasetId: number, nodeId: number): Promise<void> {
  await httpRequest<void>(`/dataset-definitions/${datasetId}/nodes/${nodeId}`, {
    method: 'DELETE',
    label: 'DeleteDatasetNode',
  });
}

export async function listDatasetEdges(datasetId: number): Promise<DatasetEdge[]> {
  const response = await httpRequest<unknown>(`/dataset-definitions/${datasetId}/edges`, {
    method: 'GET',
    label: 'ListDatasetEdges',
  });
  return ensureArrayResponse<DatasetEdge>(response, 'ListDatasetEdges');
}

export async function createDatasetEdge(datasetId: number, payload: DatasetEdgePayload): Promise<DatasetEdge> {
  return httpRequest<DatasetEdge>(`/dataset-definitions/${datasetId}/edges`, {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'CreateDatasetEdge',
  });
}

export async function updateDatasetEdge(datasetId: number, edgeId: number, payload: Partial<DatasetEdgePayload>): Promise<DatasetEdge> {
  return httpRequest<DatasetEdge>(`/dataset-definitions/${datasetId}/edges/${edgeId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateDatasetEdge',
  });
}

export async function deleteDatasetEdge(datasetId: number, edgeId: number): Promise<void> {
  await httpRequest<void>(`/dataset-definitions/${datasetId}/edges/${edgeId}`, {
    method: 'DELETE',
    label: 'DeleteDatasetEdge',
  });
}

export async function listDatasetSelectedColumns(datasetId: number): Promise<DatasetSelectedColumn[]> {
  const response = await httpRequest<unknown>(`/dataset-definitions/${datasetId}/selected-columns`, {
    method: 'GET',
    label: 'ListDatasetSelectedColumns',
  });
  return ensureArrayResponse<DatasetSelectedColumn>(response, 'ListDatasetSelectedColumns');
}

export async function createDatasetSelectedColumn(
  datasetId: number,
  payload: DatasetSelectedColumnPayload
): Promise<DatasetSelectedColumn> {
  return httpRequest<DatasetSelectedColumn>(`/dataset-definitions/${datasetId}/selected-columns`, {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'CreateDatasetSelectedColumn',
  });
}

export async function updateDatasetSelectedColumn(
  datasetId: number,
  columnId: number,
  payload: Partial<DatasetSelectedColumnPayload>
): Promise<DatasetSelectedColumn> {
  return httpRequest<DatasetSelectedColumn>(`/dataset-definitions/${datasetId}/selected-columns/${columnId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateDatasetSelectedColumn',
  });
}

export async function deleteDatasetSelectedColumn(datasetId: number, columnId: number): Promise<void> {
  await httpRequest<void>(`/dataset-definitions/${datasetId}/selected-columns/${columnId}`, {
    method: 'DELETE',
    label: 'DeleteDatasetSelectedColumn',
  });
}

export async function previewDatasetDefinition(datasetId: number, limit = 20): Promise<DatasetPreviewResponse> {
  return httpRequest<DatasetPreviewResponse>(`/dataset-definitions/${datasetId}/preview?limit=${encodeURIComponent(String(limit))}`, {
    method: 'GET',
    label: 'PreviewDatasetDefinition',
  });
}

export async function publishDatasetDefinition(datasetId: number): Promise<DatasetPublishResponse> {
  return httpRequest<DatasetPublishResponse>(`/dataset-definitions/${datasetId}/publish`, {
    method: 'POST',
    label: 'PublishDatasetDefinition',
  });
}
