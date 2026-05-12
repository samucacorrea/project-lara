import { AppSettings } from '../types';
import { httpRequest, httpUpload } from './httpClient';

const defaultRolePermissions = {
  admin: {
    dashboard_list: true,
    dashboard_create: true,
    builder: true,
    constructor: true,
    manage_data_sources: true,
    manage_schema: true,
    admin_settings: true,
  },
  standard: {
    dashboard_list: true,
    dashboard_create: true,
    builder: true,
    constructor: true,
    manage_data_sources: false,
    manage_schema: false,
    admin_settings: false,
  },
  viewer: {
    dashboard_list: true,
    dashboard_create: false,
    builder: false,
    constructor: false,
    manage_data_sources: false,
    manage_schema: false,
    admin_settings: false,
  },
} as AppSettings['role_permissions'];

const normalize = (payload: Record<string, any>): AppSettings => ({
  id: payload.id,
  tool_name: payload.tool_name ?? 'Aplicação',
  logo_url: payload.logo_url ?? null,
  favicon_url: payload.favicon_url ?? null,
  role_permissions: payload.role_permissions ?? defaultRolePermissions,
  created_at: payload.created_at,
  updated_at: payload.updated_at,
});

export async function fetchAppSettings() {
  const response = await httpRequest<Record<string, any>>('/app-settings', {
    method: 'GET',
    label: 'FetchAppSettings',
  });
  return normalize(response);
}

export async function updateAppSettings(payload: Partial<AppSettings>) {
  const response = await httpRequest<Record<string, any>>('/app-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateAppSettings',
  });
  return normalize(response);
}

export async function uploadBrandingAsset(file: File, kind: 'logo' | 'favicon') {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  return httpUpload<{ url: string; settings: AppSettings }>('/app-settings/assets', form, {
    method: 'POST',
    label: 'UploadBrandingAsset',
  });
}
