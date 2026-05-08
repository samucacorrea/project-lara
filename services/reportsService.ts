import { Widget, GlobalFilterState, ReportLayout, CanvasSettings } from '../types';
import { httpRequest } from './httpClient';

export interface SaveReportPayload {
  name: string;
  widgets: Widget[];
  data_source_id?: string | null;
  global_filter?: GlobalFilterState;
  date_filter_visible?: boolean;
  is_public?: boolean;
  layout_type?: ReportLayout;
  canvas_settings?: CanvasSettings;
  join_config?: any;
}

export interface ReportRecord {
  id: number;
  name: string;
  slug: string;
  share_url: string;
  widgets: Widget[];
  data_source_id?: string | null;
  global_filter?: GlobalFilterState;
  date_filter_visible?: boolean;
  owner_id?: number | null;
  is_public?: boolean;
  layout_type?: ReportLayout;
  canvas_settings?: CanvasSettings;
  join_config?: any;
  collaborator_permission?: 'view' | 'edit' | null;
  collaborator_count?: number;
  created_at?: string;
}

export async function saveReport(payload: SaveReportPayload) {
  return httpRequest<ReportRecord>('/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'SaveReport',
  });
}

export async function fetchReport(slug: string, options?: { isPublic?: boolean }) {
  const path = options?.isPublic ? `/reports/${slug}?public=1` : `/reports/${slug}`;
  return httpRequest<ReportRecord>(path, {
    method: 'GET',
    label: 'FetchReport',
  });
}

export async function listReports() {
  return httpRequest<ReportRecord[]>('/reports', {
    method: 'GET',
    label: 'ListReports',
  });
}

export async function shareReport(reportId: number, payload: { email: string; permission?: 'view' | 'edit' }) {
  return httpRequest<{ message: string }>(`/reports/${reportId}/share`, {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'ShareReport',
  });
}

export async function updateReport(reportId: number, payload: Partial<SaveReportPayload>) {
  return httpRequest<ReportRecord>(`/reports/${reportId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateReport',
  });
}

export async function deleteReport(reportId: number) {
  return httpRequest<void>(`/reports/${reportId}`, {
    method: 'DELETE',
    label: 'DeleteReport',
  });
}
