import { DataSource, DataSourcePayload } from '../types';
import { httpRequest } from './httpClient';

type NormalizedApiResponse = {
  id: number | string;
  name: string;
  type: DataSource['type'];
  description?: string | null;
  config?: Record<string, unknown> | string | null;
  credential_reference?: string | null;
  owner_id?: number | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
};

const normalize = (source: NormalizedApiResponse): DataSource => {
  let parsedConfig: Record<string, unknown> = {};

  if (source.config) {
    if (typeof source.config === 'string') {
      try {
        parsedConfig = JSON.parse(source.config);
      } catch {
        parsedConfig = {};
      }
    } else if (typeof source.config === 'object') {
      parsedConfig = source.config as Record<string, unknown>;
    }
  }

  return {
    id: String(source.id),
    name: source.name,
    type: source.type,
    description: source.description ?? undefined,
    config: parsedConfig,
    credentialReference: source.credential_reference ?? undefined,
    ownerId: source.owner_id ?? undefined,
    status: (source.status as DataSource['status']) ?? 'active',
    createdAt: source.created_at,
    updatedAt: source.updated_at,
  };
};

export async function listDataSources(): Promise<DataSource[]> {
  const result = await httpRequest<NormalizedApiResponse[]>('/data-sources', {
    method: 'GET',
    label: 'ListDataSources',
  });
  return result.map(normalize);
}

export async function createDataSource(payload: DataSourcePayload): Promise<DataSource> {
  const result = await httpRequest<NormalizedApiResponse>('/data-sources', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'CreateDataSource',
  });

  return normalize(result);
}

export async function updateDataSource(id: string, payload: DataSourcePayload): Promise<DataSource> {
  const result = await httpRequest<NormalizedApiResponse>(`/data-sources/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateDataSource',
  });

  return normalize(result);
}

export async function deleteDataSource(id: string): Promise<void> {
  await httpRequest<void>(`/data-sources/${id}`, {
    method: 'DELETE',
    label: 'DeleteDataSource',
  });
}

type TablePayload = { name: string };
export type ColumnPayload = { name: string; type: string; role?: string | null; semantic_type?: string | null };

export async function listTablesForDataSource(id: string): Promise<string[]> {
  const result = await httpRequest<TablePayload[]>(`/data-sources/${id}/tables`, {
    method: 'GET',
    label: 'ListTables',
  });
  return result.map((table) => table.name);
}

export async function listColumnsForDataSourceTable(id: string, tableName: string): Promise<ColumnPayload[]> {
  return httpRequest<ColumnPayload[]>(
    `/data-sources/${id}/tables/${encodeURIComponent(tableName)}/columns`,
    {
      method: 'GET',
      label: 'ListColumns',
    }
  );
}

export async function updateColumnsForDataSourceTable(
  id: string,
  tableName: string,
  columns: Array<{ name: string; role?: string | null; semantic_type?: string | null }>
): Promise<void> {
  await httpRequest<void>(`/data-sources/${id}/tables/${encodeURIComponent(tableName)}/columns`, {
    method: 'PUT',
    body: JSON.stringify({ columns }),
    label: 'UpdateColumns',
  });
}
