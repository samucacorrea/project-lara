import { GlobalFilterState } from '../types';
import { httpRequest } from './httpClient';

type DashboardSettingsResponse = {
  id: number;
  name: string | null;
  data_source_id: number | null;
  global_filter: GlobalFilterState | null;
  date_filter_visible: boolean | number;
};

export interface DashboardSettingsPayload {
  name?: string;
  data_source_id?: string | number | null;
  global_filter?: GlobalFilterState;
  date_filter_visible?: boolean;
}

const normalize = (payload: DashboardSettingsResponse) => ({
  id: payload.id,
  name: payload.name ?? 'Dashboard',
  dataSourceId: payload.data_source_id ? String(payload.data_source_id) : '',
  globalFilter: payload.global_filter,
  dateFilterVisible: Boolean(payload.date_filter_visible),
});

export async function fetchDashboardSettings() {
  const response = await httpRequest<DashboardSettingsResponse>('/dashboard-settings', {
    method: 'GET',
    label: 'GetDashboardSettings',
  });
  return normalize(response);
}

export async function updateDashboardSettings(payload: DashboardSettingsPayload) {
  const response = await httpRequest<DashboardSettingsResponse>('/dashboard-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateDashboardSettings',
  });
  return normalize(response);
}
