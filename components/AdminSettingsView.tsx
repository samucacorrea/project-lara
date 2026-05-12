import React, { useEffect, useMemo, useState } from 'react';
import { AppSettings, RolePermissionKey, User, UserRole } from '../types';
import { createUser, deleteUser, listUsers, updateUser } from '../services/usersService';
import { updateAppSettings, uploadBrandingAsset } from '../services/appSettingsService';

interface AdminSettingsViewProps {
  settings: AppSettings;
  onSettingsUpdated: (settings: AppSettings) => void;
}

const PERMISSION_LABELS: Array<{ key: RolePermissionKey; label: string; description: string }> = [
  { key: 'dashboard_list', label: 'Listar dashboards', description: 'Acessar a home e visualizar cards de dashboards.' },
  { key: 'dashboard_create', label: 'Criar dashboards', description: 'Criar novos dashboards e rascunhos.' },
  { key: 'builder', label: 'Editar dashboards', description: 'Abrir o builder e alterar widgets/canvas.' },
  { key: 'constructor', label: 'Usar construtor', description: 'Acessar o construtor de joins e múltiplas tabelas.' },
  { key: 'manage_data_sources', label: 'Gerenciar fontes', description: 'Criar, editar e excluir conexões de dados.' },
  { key: 'manage_schema', label: 'Gerenciar dados', description: 'Classificar dimensões, métricas e tipos de colunas.' },
  { key: 'admin_settings', label: 'Configurações admin', description: 'Entrar no painel administrativo da plataforma.' },
];

type TabKey = 'branding' | 'users' | 'permissions';

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({ settings, onSettingsUpdated }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('branding');
  const [toolName, setToolName] = useState(settings.tool_name);
  const [logoUrl, setLogoUrl] = useState(settings.logo_url ?? '');
  const [faviconUrl, setFaviconUrl] = useState(settings.favicon_url ?? '');
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState<'logo' | 'favicon' | null>(null);
  const [brandingMessage, setBrandingMessage] = useState<string | null>(null);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'viewer' as UserRole });

  const [permissions, setPermissions] = useState(settings.role_permissions);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  useEffect(() => {
    setToolName(settings.tool_name);
    setLogoUrl(settings.logo_url ?? '');
    setFaviconUrl(settings.favicon_url ?? '');
    setPermissions(settings.role_permissions);
  }, [settings]);

  useEffect(() => {
    if (activeTab !== 'users') return;
    setIsLoadingUsers(true);
    setUsersError(null);
    listUsers()
      .then(setUsers)
      .catch((error) => setUsersError(error instanceof Error ? error.message : 'Falha ao carregar usuários.'))
      .finally(() => setIsLoadingUsers(false));
  }, [activeTab]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
    [users]
  );

  const saveBranding = async () => {
    try {
      setIsSavingBranding(true);
      setBrandingError(null);
      const updated = await updateAppSettings({
        tool_name: toolName.trim() || 'Aplicação',
        logo_url: logoUrl.trim() || null,
        favicon_url: faviconUrl.trim() || null,
      });
      onSettingsUpdated(updated);
      setBrandingMessage('Brand atualizado com sucesso.');
    } catch (error) {
      setBrandingError(error instanceof Error ? error.message : 'Falha ao salvar branding.');
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleAssetUpload = async (event: React.ChangeEvent<HTMLInputElement>, kind: 'logo' | 'favicon') => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingAsset(kind);
      setBrandingError(null);
      const response = await uploadBrandingAsset(file, kind);
      onSettingsUpdated(response.settings);
      if (kind === 'logo') {
        setLogoUrl(response.url);
      } else {
        setFaviconUrl(response.url);
      }
      setBrandingMessage(`${kind === 'logo' ? 'Logo' : 'Favicon'} enviado com sucesso.`);
    } catch (error) {
      setBrandingError(error instanceof Error ? error.message : 'Falha ao enviar asset.');
    } finally {
      setIsUploadingAsset(null);
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await createUser(newUser);
      setUsers((prev) => [created, ...prev]);
      setNewUser({ name: '', email: '', password: '', role: 'viewer' });
      setUsersError(null);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Falha ao criar usuário.');
    }
  };

  const handleInlineUserChange = async (id: number, patch: Partial<User>) => {
    try {
      const updated = await updateUser(id, patch);
      setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
      setUsersError(null);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Falha ao atualizar usuário.');
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((user) => user.id !== id));
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Falha ao excluir usuário.');
    }
  };

  const handlePermissionToggle = (role: UserRole, key: RolePermissionKey, value: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [key]: value,
      },
    }));
  };

  const savePermissions = async () => {
    try {
      setIsSavingPermissions(true);
      const updated = await updateAppSettings({ role_permissions: permissions });
      onSettingsUpdated(updated);
    } finally {
      setIsSavingPermissions(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Configurações administrativas</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie branding, usuários e permissões globais da plataforma.</p>
      </div>

      <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-2xl p-2 shadow-sm w-fit">
        {[
          ['branding', 'Marca'],
          ['users', 'Usuários'],
          ['permissions', 'Permissões'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as TabKey)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold ${
              activeTab === key ? 'bg-[#5B4DFF] text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'branding' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Nome da ferramenta</label>
                <input
                  value={toolName}
                  onChange={(event) => setToolName(event.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">URL do logo</label>
                <input
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">URL do favicon</label>
                <input
                  value={faviconUrl}
                  onChange={(event) => setFaviconUrl(event.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-[#F8F9FC] p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">Preview</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                    {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" /> : 'Logo'}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-800">{toolName || 'Aplicação'}</p>
                    <p className="text-xs text-gray-400">Brand da plataforma</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-600 cursor-pointer bg-gray-50 hover:bg-gray-100">
                  Upload do logo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAssetUpload(e, 'logo')} />
                  <div className="text-xs text-gray-400 mt-1">PNG, JPG, SVG ou WEBP</div>
                </label>
                <label className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-600 cursor-pointer bg-gray-50 hover:bg-gray-100">
                  Upload do favicon
                  <input type="file" accept=".png,.ico,.svg,image/png,image/x-icon,image/svg+xml" className="hidden" onChange={(e) => handleAssetUpload(e, 'favicon')} />
                  <div className="text-xs text-gray-400 mt-1">PNG, ICO ou SVG</div>
                </label>
              </div>
            </div>
          </div>

          {brandingError && <div className="text-sm text-red-500">{brandingError}</div>}
          {brandingMessage && <div className="text-sm text-green-600">{brandingMessage}</div>}

          <div className="flex justify-end">
            <button
              onClick={saveBranding}
              disabled={isSavingBranding || isUploadingAsset !== null}
              className="px-5 py-2.5 bg-[#5B4DFF] text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {isSavingBranding ? 'Salvando...' : 'Salvar branding'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateUser} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
            <input value={newUser.name} onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nome" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
            <input value={newUser.email} onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
            <input value={newUser.password} onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))} placeholder="Senha" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
            <div className="flex gap-3">
              <select value={newUser.role} onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value as UserRole }))} className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm">
                <option value="admin">Admin</option>
                <option value="standard">Standard</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="px-4 py-2 bg-[#5B4DFF] text-white rounded-xl text-sm font-semibold">Adicionar</button>
            </div>
          </form>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {isLoadingUsers ? (
              <div className="p-6 text-sm text-gray-500">Carregando usuários...</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sortedUsers.map((user) => (
                  <div key={user.id} className="grid grid-cols-1 lg:grid-cols-[80px_1fr_1fr_160px_120px] gap-4 p-4 items-center">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center text-xs text-gray-400">
                      {user.avatar_url ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" /> : 'Foto'}
                    </div>
                    <input
                      value={user.name}
                      onChange={(e) => setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, name: e.target.value } : item)))}
                      onBlur={() => handleInlineUserChange(user.id, { name: user.name })}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                    <input
                      value={user.email}
                      onChange={(e) => setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, email: e.target.value } : item)))}
                      onBlur={() => handleInlineUserChange(user.id, { email: user.email })}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                    <select
                      value={user.role}
                      onChange={(e) => handleInlineUserChange(user.id, { role: e.target.value as UserRole })}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
                    >
                      <option value="admin">Admin</option>
                      <option value="standard">Standard</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="px-3 py-2 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {usersError && <div className="text-sm text-red-500">{usersError}</div>}
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
          {(['admin', 'standard', 'viewer'] as UserRole[]).map((role) => (
            <div key={role} className="rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800 capitalize">{role}</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {PERMISSION_LABELS.map((permission) => (
                  <div key={`${role}:${permission.key}`} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{permission.label}</div>
                      <div className="text-xs text-gray-500">{permission.description}</div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={Boolean(permissions[role]?.[permission.key])}
                        onChange={(e) => handlePermissionToggle(role, permission.key, e.target.checked)}
                      />
                      Ativo
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <button
              onClick={savePermissions}
              disabled={isSavingPermissions}
              className="px-5 py-2.5 bg-[#5B4DFF] text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {isSavingPermissions ? 'Salvando...' : 'Salvar permissões'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
