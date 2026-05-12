import React, { useEffect, useState } from 'react';
import { X, Database, Table, Server, CheckCircle2, AlertCircle, Loader2, Trash2, Link2, KeyRound } from 'lucide-react';
import {
  DataSource,
  DataSourcePayload,
  DataSourceType,
  ExternalConnection,
  ExternalConnectionAccount,
  ExternalConnectionAuthType,
  ExternalConnectionProvider,
} from '../types';
import { previewDataSourceColumns } from '../services/dataSourcesService';
import {
  authorizeExternalConnection,
  createExternalConnection,
  deleteExternalConnection,
  listExternalConnectionAccounts,
  listExternalConnections,
  syncExternalConnectionAccounts,
} from '../services/datasetBuilderService';

interface DataSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataSources: DataSource[];
  onAdd: (payload: DataSourcePayload) => Promise<void>;
  onUpdate: (id: string, payload: DataSourcePayload) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  isLoading: boolean;
}

const mysqlDefaults = {
  host: '',
  port: '3306',
  database: '',
  username: '',
  password: '',
};

const googleDefaults = {
  spreadsheetId: '',
  worksheet: '',
  worksheets: [] as string[],
  columnTypes: {} as Record<string, Record<string, string>>,
};

const bigQueryDefaults = {
  projectId: '',
  dataset: '',
  table: '',
  tables: [] as string[],
  serviceAccountJson: '',
  location: '',
};

const supabaseDefaults = {
  host: '',
  port: '5432',
  database: 'postgres',
  schema: 'public',
  username: '',
  password: '',
  sslmode: 'require',
};

const GOOGLE_COLUMN_TYPE_OPTIONS = [
  { value: 'string', label: 'string / texto curto' },
  { value: 'varchar', label: 'varchar' },
  { value: 'text', label: 'text / texto longo' },
  { value: 'int', label: 'int / inteiro' },
  { value: 'bigint', label: 'bigint' },
  { value: 'float', label: 'float' },
  { value: 'double', label: 'double' },
  { value: 'numeric', label: 'numeric / decimal' },
  { value: 'boolean', label: 'boolean' },
  { value: 'date', label: 'date' },
  { value: 'datetime', label: 'datetime' },
];

type CatalogMode = 'manual' | 'native';

const NATIVE_PROVIDER_OPTIONS: Array<{
  id: ExternalConnectionProvider;
  label: string;
  description: string;
  authTypes: ExternalConnectionAuthType[];
}> = [
  {
    id: 'google_ads',
    label: 'Google Ads',
    description: 'Campanhas, grupos, anúncios e métricas do Google Ads.',
    authTypes: ['oauth2', 'service_account'],
  },
  {
    id: 'meta_ads',
    label: 'Meta Ads',
    description: 'Contas, campanhas, conjuntos e anúncios da Meta.',
    authTypes: ['oauth2', 'token'],
  },
  {
    id: 'tiktok_ads',
    label: 'TikTok Ads',
    description: 'Dados de mídia e campanhas do TikTok Ads.',
    authTypes: ['oauth2', 'token'],
  },
  {
    id: 'google_analytics',
    label: 'Google Analytics',
    description: 'Properties e métricas do Google Analytics / GA4.',
    authTypes: ['oauth2', 'service_account'],
  },
  {
    id: 'rd_station',
    label: 'RD Station',
    description: 'Leads, funis e automações do RD Station.',
    authTypes: ['oauth2', 'token', 'api_key'],
  },
  {
    id: 'hubspot',
    label: 'HubSpot',
    description: 'Contatos, negócios e eventos do HubSpot.',
    authTypes: ['oauth2', 'token', 'api_key'],
  },
  {
    id: 'magneticgo',
    label: 'Magneticgo',
    description: 'Dados da API da Magneticgo.',
    authTypes: ['token', 'api_key'],
  },
];

const AUTH_TYPE_LABELS: Record<ExternalConnectionAuthType, string> = {
  oauth2: 'OAuth2',
  api_key: 'API Key',
  token: 'Token',
  service_account: 'Service Account',
};

export const DataSourcesModal: React.FC<DataSourcesModalProps> = ({
  isOpen,
  onClose,
  dataSources,
  onAdd,
  onUpdate,
  onRemove,
  isLoading,
}) => {
  const [step, setStep] = useState<'list' | 'create'>('list');
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('manual');
  const [selectedType, setSelectedType] = useState<DataSourceType | null>(null);
  const [configName, setConfigName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [mysqlConfig, setMysqlConfig] = useState(mysqlDefaults);
  const [googleConfig, setGoogleConfig] = useState(googleDefaults);
  const [bigQueryConfig, setBigQueryConfig] = useState(bigQueryDefaults);
  const [supabaseConfig, setSupabaseConfig] = useState(supabaseDefaults);
  const [googleWorksheetInput, setGoogleWorksheetInput] = useState('');
  const [bigQueryTableInput, setBigQueryTableInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [modalSize, setModalSize] = useState({ width: 600, height: 650 });
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ width: 600, height: 650, x: 0, y: 0 });
  const [showBigQueryHelp, setShowBigQueryHelp] = useState(false);
  const [showSupabaseHelp, setShowSupabaseHelp] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState('');
  const [confirmDeleteInput, setConfirmDeleteInput] = useState('');
  const [confirmDeleteNativeId, setConfirmDeleteNativeId] = useState<number | null>(null);
  const [googleSelectedWorksheet, setGoogleSelectedWorksheet] = useState('');
  const [googlePreviewColumns, setGooglePreviewColumns] = useState<Record<string, Array<{ name: string; type: string }>>>({});
  const [googleColumnsLoading, setGoogleColumnsLoading] = useState(false);
  const [externalConnections, setExternalConnections] = useState<ExternalConnection[]>([]);
  const [externalConnectionAccounts, setExternalConnectionAccounts] = useState<Record<number, ExternalConnectionAccount[]>>({});
  const [isLoadingExternalConnections, setIsLoadingExternalConnections] = useState(false);
  const [syncingAccountsId, setSyncingAccountsId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      const width = modalSize.width;
      const height = modalSize.height;
      const centerX = window.innerWidth / 2 - width / 2;
      const centerY = window.innerHeight / 2 - height / 2;
      setModalPosition({
        x: Math.max(20, centerX),
        y: Math.max(20, centerY),
      });
    }
  }, [isOpen, modalSize.width, modalSize.height]);

  useEffect(() => {
    if (!isOpen) return;

    const loadExternalConnections = async () => {
      try {
        setIsLoadingExternalConnections(true);
        const connections = await listExternalConnections();
        setExternalConnections(Array.isArray(connections) ? connections : []);
        const accountEntries = await Promise.all(
          (Array.isArray(connections) ? connections : []).map(async (connection) => {
            try {
              const accounts = await listExternalConnectionAccounts(connection.id);
              return [connection.id, accounts] as const;
            } catch {
              return [connection.id, []] as const;
            }
          })
        );
        setExternalConnectionAccounts(Object.fromEntries(accountEntries));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Erro ao carregar conexões nativas.');
      } finally {
        setIsLoadingExternalConnections(false);
      }
    };

    void loadExternalConnections();
  }, [isOpen]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (isDragging) {
        setModalPosition({
          x: event.clientX - dragOffset.x,
          y: event.clientY - dragOffset.y,
        });
      }

      if (isResizing) {
        const deltaX = event.clientX - resizeStart.x;
        const deltaY = event.clientY - resizeStart.y;
        setModalSize({
          width: Math.max(480, resizeStart.width + deltaX),
          height: Math.max(420, resizeStart.height + deltaY),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, isResizing, resizeStart]);

  const handleDragStart = (event: React.MouseEvent) => {
    event.preventDefault();
    setIsDragging(true);
    setDragOffset({
      x: event.clientX - modalPosition.x,
      y: event.clientY - modalPosition.y,
    });
  };

  const handleResizeStart = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      width: modalSize.width,
      height: modalSize.height,
      x: event.clientX,
      y: event.clientY,
    });
  };

  if (!isOpen) return null;

  const resetForm = () => {
    setStep('list');
    setCatalogMode('manual');
    setConfigName('');
    setSelectedType(null);
    setMysqlConfig(mysqlDefaults);
    setGoogleConfig(googleDefaults);
    setBigQueryConfig(bigQueryDefaults);
    setSupabaseConfig(supabaseDefaults);
    setGoogleWorksheetInput('');
    setBigQueryTableInput('');
    setEditingId(null);
    setConnectionStatus('idle');
    setErrorMessage(null);
    setShowBigQueryHelp(false);
    setShowSupabaseHelp(false);
    setGoogleSelectedWorksheet('');
    setGooglePreviewColumns({});
    setGoogleColumnsLoading(false);
  };

  const normalizedGoogleTables = googleConfig.worksheets.length
    ? googleConfig.worksheets
    : googleConfig.worksheet
    ? [googleConfig.worksheet]
    : [];

  const googleActiveWorksheet = googleSelectedWorksheet || normalizedGoogleTables[0] || '';

  const handleCreate = async () => {
    const normalizedName = configName.trim();
    if (!normalizedName) {
      setErrorMessage('Informe um nome para identificar esta conexão.');
      return;
    }

    if (!selectedType) {
      setErrorMessage('Selecione o tipo de conexão.');
      return;
    }

    if (
      selectedType === 'google_sheets' &&
      (!googleConfig.spreadsheetId ||
        (googleConfig.worksheets.length === 0 && !googleConfig.worksheet))
    ) {
      setErrorMessage('Informe o ID da planilha e ao menos uma aba.');
      return;
    }

    if (
      selectedType === 'bigquery' &&
      (!bigQueryConfig.projectId ||
        !bigQueryConfig.dataset ||
        (bigQueryConfig.tables.length === 0 && !bigQueryConfig.table) ||
        !bigQueryConfig.serviceAccountJson)
    ) {
      setErrorMessage('Complete todas as credenciais do BigQuery (Project ID, Dataset, Tabelas e JSON da conta de serviço).');
      return;
    }

    if (
      selectedType === 'supabase' &&
      (!supabaseConfig.host ||
        !supabaseConfig.port ||
        !supabaseConfig.database ||
        !supabaseConfig.username ||
        !supabaseConfig.password)
    ) {
      setErrorMessage('Complete host, porta, database, usuário e senha do Supabase.');
      return;
    }

    const normalizedBigQueryTables = bigQueryConfig.tables.length
      ? bigQueryConfig.tables
      : bigQueryConfig.table
      ? [bigQueryConfig.table]
      : [];

    const googleDefaultTable = normalizedGoogleTables[0] ?? '';
    const bigQueryDefaultTable = normalizedBigQueryTables[0] ?? '';

    const payload: DataSourcePayload = {
      name: normalizedName,
      type: selectedType,
      config:
        selectedType === 'mysql'
          ? mysqlConfig
          : selectedType === 'google_sheets'
          ? {
              spreadsheet_id: googleConfig.spreadsheetId,
              worksheet: googleDefaultTable,
              worksheets: normalizedGoogleTables,
              column_types: googleConfig.columnTypes,
            }
          : selectedType === 'bigquery'
          ? {
              project_id: bigQueryConfig.projectId,
              dataset: bigQueryConfig.dataset,
              table: bigQueryDefaultTable,
              tables: normalizedBigQueryTables,
              ...(bigQueryConfig.location ? { location: bigQueryConfig.location } : {}),
              service_account_json: bigQueryConfig.serviceAccountJson.trim(),
            }
          : {
              host: supabaseConfig.host.trim(),
              port: supabaseConfig.port.trim(),
              database: supabaseConfig.database.trim(),
              schema: supabaseConfig.schema.trim() || 'public',
              username: supabaseConfig.username.trim(),
              password: supabaseConfig.password,
              sslmode: supabaseConfig.sslmode.trim() || 'require',
            },
      status: 'active',
    };

    try {
      setIsSaving(true);
      setErrorMessage(null);
      if (editingId) {
        await onUpdate(editingId, payload);
      } else {
        await onAdd(payload);
      }
      resetForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao salvar fonte.');
      setConnectionStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (source: DataSource) => {
    setStep('create');
    setSelectedType(source.type);
    setConfigName(source.name);
    setEditingId(source.id);
    setConnectionStatus('idle');
    setErrorMessage(null);

    if (source.type === 'mysql') {
      setMysqlConfig({
        host: String(source.config.host ?? ''),
        port: String(source.config.port ?? '3306'),
        database: String(source.config.database ?? ''),
        username: String(source.config.username ?? ''),
        password: String(source.config.password ?? ''),
      });
    }

    if (source.type === 'google_sheets') {
      const worksheets = Array.isArray(source.config.worksheets)
        ? (source.config.worksheets as string[])
        : [];
      const fallbackWorksheet = String(source.config.worksheet ?? '');
      const normalized = worksheets.length ? worksheets : fallbackWorksheet ? [fallbackWorksheet] : [];
      setGoogleConfig({
        spreadsheetId: String(source.config.spreadsheet_id ?? ''),
        worksheet: fallbackWorksheet,
        worksheets: normalized,
        columnTypes:
          source.config.column_types && typeof source.config.column_types === 'object'
            ? (source.config.column_types as Record<string, Record<string, string>>)
            : {},
      });
      setGoogleSelectedWorksheet(normalized[0] ?? fallbackWorksheet);
      setGooglePreviewColumns({});
    }

    if (source.type === 'bigquery') {
      const tables = Array.isArray(source.config.tables) ? (source.config.tables as string[]) : [];
      const fallbackTable = String(source.config.table ?? '');
      const normalized = tables.length ? tables : fallbackTable ? [fallbackTable] : [];
      setBigQueryConfig({
        projectId: String(source.config.project_id ?? ''),
        dataset: String(source.config.dataset ?? ''),
        table: fallbackTable,
        tables: normalized,
        serviceAccountJson: String(source.config.service_account_json ?? ''),
        location: String(source.config.location ?? ''),
      });
    }

    if (source.type === 'supabase') {
      setSupabaseConfig({
        host: String(source.config.host ?? ''),
        port: String(source.config.port ?? '5432'),
        database: String(source.config.database ?? 'postgres'),
        schema: String(source.config.schema ?? 'public'),
        username: String(source.config.username ?? ''),
        password: String(source.config.password ?? ''),
        sslmode: String(source.config.sslmode ?? 'require'),
      });
    }
  };

  const addGoogleWorksheet = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setGoogleConfig((prev) => {
      if (prev.worksheets.includes(trimmed)) return prev;
      return {
        ...prev,
        worksheets: [...prev.worksheets, trimmed],
        worksheet: prev.worksheet || trimmed,
      };
    });
    setGoogleSelectedWorksheet((prev) => prev || trimmed);
  };

  const loadGoogleColumnsPreview = async (worksheet: string) => {
    const trimmedWorksheet = worksheet.trim();
    if (!googleConfig.spreadsheetId.trim() || !trimmedWorksheet) {
      setErrorMessage('Informe o ID da planilha e selecione uma aba para carregar as colunas.');
      return;
    }

    try {
      setGoogleColumnsLoading(true);
      setErrorMessage(null);
      const columns = await previewDataSourceColumns({
        type: 'google_sheets',
        table: trimmedWorksheet,
        config: {
          spreadsheet_id: googleConfig.spreadsheetId.trim(),
          worksheet: trimmedWorksheet,
          worksheets: normalizedGoogleTables,
          column_types: googleConfig.columnTypes,
        },
      });

      setGooglePreviewColumns((prev) => ({
        ...prev,
        [trimmedWorksheet]: columns.map((column) => ({
          name: column.name,
          type: String(column.type ?? 'string'),
        })),
      }));
      setGoogleSelectedWorksheet(trimmedWorksheet);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao carregar colunas da planilha.');
    } finally {
      setGoogleColumnsLoading(false);
    }
  };

  const updateGoogleColumnType = (worksheet: string, columnName: string, type: string) => {
    setGoogleConfig((prev) => ({
      ...prev,
      columnTypes: {
        ...prev.columnTypes,
        [worksheet]: {
          ...(prev.columnTypes[worksheet] ?? {}),
          [columnName]: type,
        },
      },
    }));

    setGooglePreviewColumns((prev) => ({
      ...prev,
      [worksheet]: (prev[worksheet] ?? []).map((column) =>
        column.name === columnName ? { ...column, type } : column
      ),
    }));
  };

  const addBigQueryTable = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBigQueryConfig((prev) => {
      if (prev.tables.includes(trimmed)) return prev;
      return { ...prev, tables: [...prev.tables, trimmed], table: prev.table || trimmed };
    });
  };

  const testConnection = () => {
    setConnectionStatus('testing');
    setErrorMessage(null);

    setTimeout(() => {
      if (
        (selectedType === 'mysql' && mysqlConfig.host && mysqlConfig.username) ||
        (selectedType === 'supabase' && supabaseConfig.host && supabaseConfig.username)
      ) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    }, 1200);
  };

  const handleRemove = async (id: string) => {
    try {
      await onRemove(id);
      setConfirmDeleteId(null);
      setConfirmDeleteName('');
      setConfirmDeleteInput('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao remover fonte.');
    }
  };

  const handleRemoveNative = async (id: number) => {
    try {
      await deleteExternalConnection(id);
      setExternalConnections((prev) => prev.filter((item) => item.id !== id));
      setExternalConnectionAccounts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setConfirmDeleteNativeId(null);
      setConfirmDeleteInput('');
      setConfirmDeleteName('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao remover conexão nativa.');
    }
  };

  const handleConnectNativePlatform = async (provider: ExternalConnectionProvider) => {
    const providerMeta = NATIVE_PROVIDER_OPTIONS.find((item) => item.id === provider);
    if (!providerMeta) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const existingConnection = externalConnections.find((item) => item.provider === provider);
      const savedConnection = existingConnection
        ? existingConnection
        : await createExternalConnection({
            name: providerMeta.label,
            provider,
            auth_type: providerMeta.authTypes[0],
            status: 'draft',
            config_json: {
              connection_mode: 'oauth_button',
              provider_label: providerMeta.label,
              pending_authorization: true,
            },
          });

      if (!existingConnection) {
        setExternalConnections((prev) => [savedConnection, ...prev].sort((a, b) => b.id - a.id));
      }

      const authorization = await authorizeExternalConnection(savedConnection.id);
      window.location.href = authorization.authorization_url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao iniciar conexão nativa.';
      setErrorMessage(message);
      setConnectionStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncNativeAccounts = async (connectionId: number) => {
    try {
      setSyncingAccountsId(connectionId);
      setErrorMessage(null);
      const accounts = await syncExternalConnectionAccounts(connectionId);
      setExternalConnectionAccounts((prev) => ({ ...prev, [connectionId]: accounts }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao sincronizar contas da conexão.');
    } finally {
      setSyncingAccountsId(null);
    }
  };

  const renderConfigSnippet = (ds: DataSource) => {
    if (ds.type === 'mysql') {
      return (ds.config?.host as string) ?? null;
    }
    if (ds.type === 'supabase') {
      return (ds.config?.host as string) ?? null;
    }
    if (ds.type === 'google_sheets') {
      const worksheets = Array.isArray(ds.config?.worksheets) ? (ds.config?.worksheets as string[]) : [];
      if (worksheets.length > 0) {
        return `${worksheets[0]}${worksheets.length > 1 ? ` +${worksheets.length - 1}` : ''}`;
      }
      return (ds.config?.spreadsheet_id as string) ?? null;
    }
    if (ds.type === 'bigquery') {
      const tables = Array.isArray(ds.config?.tables) ? (ds.config?.tables as string[]) : [];
      if (tables.length > 0) {
        return `${tables[0]}${tables.length > 1 ? ` +${tables.length - 1}` : ''}`;
      }
      return (ds.config?.table as string) ?? (ds.config?.dataset as string) ?? null;
    }
    return null;
  };

  const renderNativeConnectionSnippet = (connection: ExternalConnection) => {
    return AUTH_TYPE_LABELS[connection.auth_type];
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm">
      <div
        className="absolute shadow-2xl rounded-2xl border border-white/50 flex flex-col overflow-hidden bg-white"
        style={{
          width: modalSize.width,
          height: modalSize.height,
          left: modalPosition.x,
          top: modalPosition.y,
        }}
      >
        
        {/* Header */}
        <div
          className="flex items-center justify-between p-6 border-b border-gray-100 bg-white cursor-move select-none"
          onMouseDown={handleDragStart}
        >
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Database className="text-[#5B4DFF]" size={24} />
            Fontes de Dados
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-[#F9FAFB]">
          {step === 'list' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-1">
                {[
                  { id: 'manual' as const, label: 'Fontes manuais', icon: Database },
                  { id: 'native' as const, label: 'Plataformas nativas', icon: Link2 },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCatalogMode(option.id)}
                    className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                      catalogMode === option.id
                        ? 'bg-[#5B4DFF] text-white shadow-sm'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <option.icon size={16} />
                    {option.label}
                  </button>
                ))}
              </div>

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                  {catalogMode === 'manual' ? 'Conexões Salvas' : 'Plataformas conectadas'}
                </h3>
                {catalogMode === 'manual' ? isLoading : isLoadingExternalConnections ? (
                  <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 bg-white">
                    {catalogMode === 'manual' ? 'Carregando fontes cadastradas...' : 'Carregando conexões nativas...'}
                  </div>
                ) : catalogMode === 'manual' ? dataSources.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 bg-white">
                    Nenhuma fonte de dados configurada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dataSources.map(ds => (
                      <div key={ds.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${
                            ds.type === 'mysql' ? 'bg-blue-50 text-blue-600' :
                            ds.type === 'google_sheets' ? 'bg-green-50 text-green-600' :
                            ds.type === 'supabase' ? 'bg-emerald-50 text-emerald-600' :
                            'bg-purple-50 text-purple-600'
                          }`}>
                            {ds.type === 'mysql' && <Server size={20} />}
                            {ds.type === 'supabase' && <Database size={20} />}
                            {ds.type === 'google_sheets' && <Table size={20} />}
                            {ds.type === 'bigquery' && <Database size={20} />}
                          </div>
                          <div>
                            <div className="font-bold text-gray-800 text-sm">{ds.name}</div>
                            <div className="text-xs text-gray-500 capitalize mt-0.5 flex items-center gap-2">
                              {ds.type.replace('_', ' ')}
                              {renderConfigSnippet(ds) && (
                                <span className="bg-gray-100 px-1.5 rounded text-gray-400">
                                  {renderConfigSnippet(ds)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 uppercase tracking-wide">
                              {(ds.status ?? 'active').toUpperCase()}
                            </span>
                            <button
                              onClick={() => handleEdit(ds)}
                              className="px-3 py-1 text-[10px] font-bold bg-[#EEF0FF] text-[#5B4DFF] rounded-full border border-[#DADFFF] uppercase tracking-wide"
                              title="Editar conexão"
                            >
                              Editar
                            </button>
                            <button 
                                onClick={() => {
                                  setConfirmDeleteId(ds.id);
                                  setConfirmDeleteName(ds.name);
                                  setConfirmDeleteInput('');
                                }}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="Excluir Conexão"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : externalConnections.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 bg-white">
                    Nenhuma plataforma nativa configurada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {externalConnections.map((connection) => (
                      <div
                        key={connection.id}
                        className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all group hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="rounded-xl bg-indigo-50 p-3 text-[#5B4DFF]">
                              <Link2 size={20} />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-800">{connection.name}</div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                                <span>{NATIVE_PROVIDER_OPTIONS.find((item) => item.id === connection.provider)?.label ?? connection.provider}</span>
                                <span className="rounded bg-gray-100 px-1.5 text-gray-400">
                                  {renderNativeConnectionSnippet(connection)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                              {connection.status.toUpperCase()}
                            </span>
                            <span className="rounded-full border border-[#DADFFF] bg-[#EEF0FF] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#5B4DFF]">
                              {AUTH_TYPE_LABELS[connection.auth_type]}
                            </span>
                            <button
                              onClick={() => {
                                setConfirmDeleteNativeId(connection.id);
                                setConfirmDeleteName(connection.name);
                                setConfirmDeleteInput('');
                              }}
                              className="rounded-lg p-2 text-gray-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                              title="Excluir conexão"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-gray-600">
                              Contas descobertas: {externalConnectionAccounts[connection.id]?.length ?? 0}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleSyncNativeAccounts(connection.id)}
                              disabled={syncingAccountsId === connection.id}
                              className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-semibold text-[#5B4DFF] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {syncingAccountsId === connection.id ? 'Sincronizando...' : 'Sincronizar contas'}
                            </button>
                          </div>

                          {(externalConnectionAccounts[connection.id]?.length ?? 0) > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(externalConnectionAccounts[connection.id] ?? []).slice(0, 6).map((account) => (
                                <span
                                  key={account.id}
                                  className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-gray-600 border border-gray-200"
                                >
                                  {account.external_account_name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={() => {
                  setEditingId(null);
                  if (catalogMode === 'manual') {
                    setStep('create');
                  }
                }}
                className="w-full py-3.5 bg-[#5B4DFF] text-white font-semibold rounded-xl shadow-lg shadow-indigo-200 hover:bg-[#4B3DCC] hover:shadow-xl transition-all flex items-center justify-center gap-2"
              >
                {catalogMode === 'manual' ? <Database size={18} /> : <Link2 size={18} />}
                {catalogMode === 'manual' ? 'Adicionar Nova Conexão' : 'Abrir catálogo de plataformas'}
              </button>

              {catalogMode === 'native' && (
                <div className="grid grid-cols-2 gap-3">
                  {NATIVE_PROVIDER_OPTIONS.map((provider) => {
                    const existingConnection = externalConnections.find((item) => item.provider === provider.id);
                    return (
                      <div key={provider.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-gray-800">{provider.label}</div>
                            <div className="mt-1 text-xs text-gray-500">{provider.description}</div>
                          </div>
                          <Link2 size={18} className="text-[#5B4DFF]" />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleConnectNativePlatform(provider.id)}
                          disabled={isSaving}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#5B4DFF] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4B3DCC] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
                          {existingConnection ? 'Permitir acesso novamente' : 'Permitir acesso'}
                        </button>
                        {existingConnection && (
                          <div className="mt-2 text-center text-[11px] text-gray-400">
                            Conexão existente: {existingConnection.status}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
               <button onClick={() => setStep('list')} className="text-xs font-medium text-gray-500 hover:text-[#5B4DFF] mb-2 flex items-center gap-1 transition-colors">
                 &larr; Voltar para lista
               </button>

               <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-1">
                 {[
                   { id: 'manual' as const, label: 'Fontes manuais', icon: Database },
                   { id: 'native' as const, label: 'Plataformas nativas', icon: Link2 },
                 ].map((option) => (
                   <button
                     key={option.id}
                     type="button"
                     onClick={() => {
                       setCatalogMode(option.id);
                       setErrorMessage(null);
                     }}
                     className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                       catalogMode === option.id
                         ? 'bg-[#5B4DFF] text-white shadow-sm'
                         : 'text-gray-500 hover:bg-gray-50'
                     }`}
                   >
                     <option.icon size={16} />
                     {option.label}
                   </button>
                 ))}
               </div>

               <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                 <div>
                   <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                     Nome da Identificação
                   </label>
                   <input 
                     type="text" 
                     value={configName}
                     onChange={(e) => setConfigName(e.target.value)}
                     placeholder="Ex: ERP Produção"
                     className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#5B4DFF] focus:bg-white outline-none transition-all text-sm"
                   />
                 </div>

                 {catalogMode === 'manual' ? (
                 <div>
                   <label className="block text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Tipo de Fonte</label>
                   <div className="grid grid-cols-4 gap-3">
                     {[
                       { id: 'mysql', label: 'MySQL', icon: Server },
                       { id: 'supabase', label: 'Supabase', icon: Database },
                       { id: 'google_sheets', label: 'Sheets', icon: Table },
                       { id: 'bigquery', label: 'BigQuery', icon: Database },
                     ].map(type => (
                       <div 
                         key={type.id}
                         onClick={() => {
                            setSelectedType(type.id as DataSourceType);
                            setConnectionStatus('idle');
                            setErrorMessage(null);
                         }}
                         className={`cursor-pointer flex flex-col items-center justify-center p-4 border rounded-xl transition-all ${
                           selectedType === type.id 
                             ? 'border-[#5B4DFF] bg-[#5B4DFF]/5 text-[#5B4DFF] ring-1 ring-[#5B4DFF]' 
                             : 'border-gray-200 hover:border-gray-300 text-gray-500 hover:bg-gray-50'
                         }`}
                       >
                         <type.icon size={24} className="mb-2" />
                         <span className="text-xs font-bold">{type.label}</span>
                       </div>
                     ))}
                   </div>
                 </div>
                 ) : (
                  <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-5 py-5 text-sm text-indigo-900">
                    Use a aba <strong>Plataformas nativas</strong> na tela anterior para clicar em{' '}
                    <strong>Permitir acesso</strong> na plataforma desejada.
                  </div>
                 )}

                 {/* MySQL Specific Fields */}
                 {catalogMode === 'manual' && (
                 <>
                 {selectedType === 'mysql' && (
                    <div className="pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
                        <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Server size={16} className="text-gray-400"/> Configuração do Banco
                        </h4>
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-9">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Host</label>
                                <input 
                                    type="text" 
                                    placeholder="127.0.0.1"
                                    value={mysqlConfig.host}
                                    onChange={(e) => setMysqlConfig({...mysqlConfig, host: e.target.value})}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                                />
                            </div>
                            <div className="col-span-3">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Porta</label>
                                <input 
                                    type="text" 
                                    value={mysqlConfig.port}
                                    onChange={(e) => setMysqlConfig({...mysqlConfig, port: e.target.value})}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                                />
                            </div>
                            <div className="col-span-12">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Nome do Banco</label>
                                <input 
                                    type="text" 
                                    placeholder="nome_do_banco"
                                    value={mysqlConfig.database}
                                    onChange={(e) => setMysqlConfig({...mysqlConfig, database: e.target.value})}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                                />
                            </div>
                            <div className="col-span-6">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Usuário</label>
                                <input 
                                    type="text" 
                                    placeholder="root"
                                    value={mysqlConfig.username}
                                    onChange={(e) => setMysqlConfig({...mysqlConfig, username: e.target.value})}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                                />
                            </div>
                            <div className="col-span-6">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Senha</label>
                                <input 
                                    type="password" 
                                    placeholder="••••••••"
                                    value={mysqlConfig.password}
                                    onChange={(e) => setMysqlConfig({...mysqlConfig, password: e.target.value})}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                                />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                            <div className="text-xs">
                                {connectionStatus === 'testing' && <span className="text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin"/> Verificando credenciais...</span>}
                                {connectionStatus === 'success' && <span className="text-green-600 flex items-center gap-2 font-medium"><CheckCircle2 size={14}/> Conectado com sucesso!</span>}
                                {connectionStatus === 'error' && <span className="text-red-500 flex items-center gap-2 font-medium"><AlertCircle size={14}/> Falha na conexão.</span>}
                                {connectionStatus === 'idle' && <span className="text-gray-500">Clique em testar para validar.</span>}
                            </div>
                            <button 
                                onClick={testConnection}
                                disabled={connectionStatus === 'testing' || !mysqlConfig.host}
                                className="text-xs font-bold text-[#5B4DFF] hover:text-[#4B3DCC] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 bg-white border border-indigo-200 shadow-sm rounded-lg transition-colors hover:shadow-md"
                            >
                                Testar Conexão
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 text-center">
                           Os dados são enviados criptografados e armazenados no backend da plataforma.
                        </p>
                    </div>
                 )}

                 {selectedType === 'supabase' && (
                    <div className="pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2 justify-between mb-4">
                          <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                              <Database size={16} className="text-gray-400"/> Configuração do Supabase
                          </h4>
                          <button
                            type="button"
                            onClick={() => setShowSupabaseHelp((prev) => !prev)}
                            className="text-xs font-semibold text-[#5B4DFF] hover:text-[#4330ff] transition-colors"
                          >
                            {showSupabaseHelp ? 'Ocultar passo a passo' : 'Precisa de ajuda?'}
                          </button>
                        </div>

                        {showSupabaseHelp && (
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-[12px] text-emerald-900 space-y-2 shadow-sm mb-4">
                            <p className="font-semibold">Como pegar os dados no Supabase:</p>
                            <ol className="list-decimal pl-4 space-y-1">
                              <li>
                                Acesse o seu projeto no{' '}
                                <a
                                  href="https://supabase.com/dashboard/projects"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#5B4DFF] underline"
                                >
                                  painel do Supabase
                                </a>.
                              </li>
                              <li>
                                No menu lateral, entre em <strong>Project Settings</strong> → <strong>Database</strong>.
                              </li>
                              <li>
                                Em <strong>Connection string</strong> ou <strong>Connection info</strong>, copie:
                                <br />
                                <strong>Host</strong>: algo como <code>db.xxxxx.supabase.co</code>
                                <br />
                                <strong>Port</strong>: geralmente <code>5432</code>
                                <br />
                                <strong>Database</strong>: normalmente <code>postgres</code>
                                <br />
                                <strong>User</strong>: o usuário Postgres exibido pelo Supabase
                              </li>
                              <li>
                                Para a <strong>senha</strong>, use a senha do banco definida no projeto. Se necessário, você pode redefini-la em{' '}
                                <strong>Project Settings</strong> → <strong>Database</strong>.
                              </li>
                              <li>
                                O <strong>Schema</strong> padrão quase sempre é <code>public</code>.
                              </li>
                              <li>
                                Em <strong>SSL Mode</strong>, use <code>require</code>, que é o padrão mais comum no Supabase.
                              </li>
                            </ol>
                            <p className="text-[11px] text-emerald-800">
                              Dica: se o Supabase mostrar uma URL única de conexão, você também pode copiar os campos dela. Exemplo:
                              <br />
                              <code>postgresql://USER:SENHA@HOST:5432/postgres</code>
                            </p>
                          </div>
                        )}
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-8">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Host</label>
                                <input type="text" placeholder="db.xxxxx.supabase.co" value={supabaseConfig.host} onChange={(e) => setSupabaseConfig({...supabaseConfig, host: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none" />
                            </div>
                            <div className="col-span-4">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Porta</label>
                                <input type="text" value={supabaseConfig.port} onChange={(e) => setSupabaseConfig({...supabaseConfig, port: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none" />
                            </div>
                            <div className="col-span-6">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Database</label>
                                <input type="text" value={supabaseConfig.database} onChange={(e) => setSupabaseConfig({...supabaseConfig, database: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none" />
                            </div>
                            <div className="col-span-6">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Schema</label>
                                <input type="text" value={supabaseConfig.schema} onChange={(e) => setSupabaseConfig({...supabaseConfig, schema: e.target.value})} placeholder="public" className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none" />
                            </div>
                            <div className="col-span-6">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Usuário</label>
                                <input type="text" value={supabaseConfig.username} onChange={(e) => setSupabaseConfig({...supabaseConfig, username: e.target.value})} placeholder="postgres.xxxxx" className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none" />
                            </div>
                            <div className="col-span-6">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Senha</label>
                                <input type="password" value={supabaseConfig.password} onChange={(e) => setSupabaseConfig({...supabaseConfig, password: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none" />
                            </div>
                            <div className="col-span-12">
                                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">SSL Mode</label>
                                <select value={supabaseConfig.sslmode} onChange={(e) => setSupabaseConfig({...supabaseConfig, sslmode: e.target.value})} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none">
                                  <option value="require">require</option>
                                  <option value="prefer">prefer</option>
                                  <option value="disable">disable</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                            <div className="text-xs">
                                {connectionStatus === 'testing' && <span className="text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin"/> Verificando credenciais...</span>}
                                {connectionStatus === 'success' && <span className="text-green-600 flex items-center gap-2 font-medium"><CheckCircle2 size={14}/> Conectado com sucesso!</span>}
                                {connectionStatus === 'error' && <span className="text-red-500 flex items-center gap-2 font-medium"><AlertCircle size={14}/> Falha na conexão.</span>}
                                {connectionStatus === 'idle' && <span className="text-gray-500">Clique em testar para validar.</span>}
                            </div>
                            <button onClick={testConnection} disabled={connectionStatus === 'testing' || !supabaseConfig.host} className="text-xs font-bold text-[#5B4DFF] hover:text-[#4B3DCC] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 bg-white border border-emerald-200 shadow-sm rounded-lg transition-colors hover:shadow-md">
                                Testar Conexão
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 text-center">
                           Use os dados da conexão Postgres do Supabase. O schema padrão é <code>public</code>.
                        </p>
                    </div>
                 )}

                 {/* Google Sheets Specific Fields */}
                 {selectedType === 'google_sheets' && (
                    <div className="pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
                      <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Table size={16} className="text-gray-400" /> Configuração do Sheets
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                            ID da Planilha
                          </label>
                          <input
                            type="text"
                            placeholder="1A2B3C..."
                            value={googleConfig.spreadsheetId}
                            onChange={(event) =>
                              setGoogleConfig((prev) => ({ ...prev, spreadsheetId: event.target.value }))
                            }
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">
                            Copie o trecho entre <code className="bg-gray-100 px-1 rounded">/d/</code> e{' '}
                            <code className="bg-gray-100 px-1 rounded">/edit</code> na URL da planilha compartilhada.
                          </p>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                            Abas disponíveis (digite e use vírgula)
                          </label>
                          <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2">
                            {googleConfig.worksheets.map((worksheet) => (
                              <span
                                key={worksheet}
                                className="inline-flex items-center gap-2 rounded-full bg-[#EEF0FF] px-3 py-1 text-[11px] font-semibold text-[#5B4DFF]"
                              >
                                {worksheet}
                                <button
                                  type="button"
                                  onClick={() =>
                                    {
                                      const nextWorksheets = googleConfig.worksheets.filter((item) => item !== worksheet);
                                      setGoogleConfig((prev) => ({
                                        ...prev,
                                        worksheets: nextWorksheets,
                                        worksheet:
                                          prev.worksheet === worksheet
                                            ? nextWorksheets[0] ?? ''
                                            : prev.worksheet,
                                        columnTypes: Object.fromEntries(
                                          Object.entries(prev.columnTypes).filter(([key]) => key !== worksheet)
                                        ),
                                      }));
                                      setGooglePreviewColumns((prev) =>
                                        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== worksheet))
                                      );
                                      setGoogleSelectedWorksheet((prev) =>
                                        prev === worksheet ? nextWorksheets[0] ?? '' : prev
                                      );
                                    }
                                  }
                                  className="text-[#5B4DFF]/70 hover:text-[#5B4DFF]"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            <input
                              type="text"
                              placeholder="Página1, Página2"
                              value={googleWorksheetInput}
                              onChange={(event) => setGoogleWorksheetInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === ',' || event.key === 'Enter') {
                                  event.preventDefault();
                                  const value = googleWorksheetInput.replace(',', '').trim();
                                  if (value) {
                                    addGoogleWorksheet(value);
                                    setGoogleWorksheetInput('');
                                  }
                                }
                              }}
                              onBlur={() => {
                                const value = googleWorksheetInput.trim();
                                if (value) {
                                  addGoogleWorksheet(value);
                                  setGoogleWorksheetInput('');
                                }
                              }}
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              className="flex-1 min-w-[160px] border-0 bg-transparent p-1 text-sm focus:outline-none"
                            />
                          </div>
                          <p className="text-[11px] text-gray-400 mt-1">
                            Digite o nome da aba e use vírgula para criar outra. Você pode remover clicando no ×.
                          </p>
                        </div>

                        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-4 py-3 text-[11px] text-amber-700">
                          Os dados são lidos usando o endpoint público do Google Sheets ({' '}
                          <code className="bg-white px-1 rounded text-[10px]">gviz</code> ). Torne a planilha pública ou
                          compartilhe apenas leitura com o e-mail do serviço configurado.
                        </div>

                        {normalizedGoogleTables.length > 0 && (
                          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                                  Etapa extra: tipar colunas
                                </div>
                                <p className="text-[11px] text-gray-500 mt-1">
                                  Escolha como cada coluna desta aba deve ser interpretada no dashboard.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => googleActiveWorksheet && loadGoogleColumnsPreview(googleActiveWorksheet)}
                                disabled={googleColumnsLoading || !googleActiveWorksheet || !googleConfig.spreadsheetId.trim()}
                                className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-[#5B4DFF] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {googleColumnsLoading ? 'Carregando...' : 'Carregar colunas'}
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {normalizedGoogleTables.map((worksheet) => (
                                <button
                                  key={worksheet}
                                  type="button"
                                  onClick={() => setGoogleSelectedWorksheet(worksheet)}
                                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                                    googleActiveWorksheet === worksheet
                                      ? 'bg-[#5B4DFF] text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {worksheet}
                                </button>
                              ))}
                            </div>

                            {googleActiveWorksheet ? (
                              googlePreviewColumns[googleActiveWorksheet]?.length ? (
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                  {googlePreviewColumns[googleActiveWorksheet].map((column) => (
                                    <div
                                      key={`${googleActiveWorksheet}:${column.name}`}
                                      className="grid grid-cols-[minmax(0,1fr)_220px] gap-3 items-center rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-gray-800">{column.name}</div>
                                        <div className="text-[11px] text-gray-400">
                                          Aba: {googleActiveWorksheet}
                                        </div>
                                      </div>
                                      <select
                                        value={googleConfig.columnTypes[googleActiveWorksheet]?.[column.name] ?? column.type}
                                        onChange={(event) =>
                                          updateGoogleColumnType(
                                            googleActiveWorksheet,
                                            column.name,
                                            event.target.value
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#5B4DFF] outline-none"
                                      >
                                        {GOOGLE_COLUMN_TYPE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                                  Carregue as colunas da aba <strong>{googleActiveWorksheet}</strong> para definir os tipos.
                                </div>
                              )
                            ) : (
                              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                                Adicione ao menos uma aba para configurar os tipos das colunas.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                 )}

                 {selectedType === 'bigquery' && (
                    <div className="pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
                      <div className="flex items-center gap-2 justify-between">
                        <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                          <Database size={16} className="text-gray-400" /> Configuração do BigQuery
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowBigQueryHelp((prev) => !prev)}
                          className="text-xs font-semibold text-[#5B4DFF] hover:text-[#4330ff] transition-colors"
                        >
                          {showBigQueryHelp ? 'Ocultar passo a passo' : 'Precisa de ajuda?'}
                        </button>
                      </div>

                      {showBigQueryHelp && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-[12px] text-indigo-900 space-y-2 shadow-sm">
                          <p className="font-semibold">Como reunir as credenciais:</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>
                              <a
                                href="https://console.cloud.google.com/projectcreate"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#5B4DFF] underline"
                              >
                                Crie ou selecione um projeto no Google Cloud
                              </a>{' '}
                              e certifique-se de ativar a API do BigQuery.
                            </li>
                            <li>
                              Abra o painel{' '}
                              <a
                                href="https://console.cloud.google.com/bigquery"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#5B4DFF] underline"
                              >
                                BigQuery
                              </a>
                              , copie o <strong>Project ID</strong> e confirme o nome do <strong>Dataset</strong> e da{' '}
                              <strong>Tabela</strong> que deseja consultar.
                            </li>
                            <li>
                              Em{' '}
                              <a
                                href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#5B4DFF] underline"
                              >
                                IAM &amp; Admin → Service Accounts
                              </a>
                              , crie uma conta de serviço com permissão de leitura no dataset e gere a chave{' '}
                              <strong>JSON</strong> (<code>.json</code>). Cole o conteúdo completo no campo abaixo.
                            </li>
                            <li>
                              No BigQuery, conceda ao e-mail da conta de serviço permissão{' '}
                              <em>BigQuery Data Viewer</em> (ou equivalente) no dataset para que a plataforma possa
                              ler os dados.
                            </li>
                          </ol>
                          <p className="text-[11px] text-indigo-800">
                            Guia oficial:{' '}
                            <a
                              href="https://cloud.google.com/bigquery/docs/exporting-data#service-account"
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#5B4DFF] underline"
                            >
                              cloud.google.com/bigquery/docs
                            </a>
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Project ID</label>
                          <input
                            type="text"
                            value={bigQueryConfig.projectId}
                            onChange={(event) =>
                              setBigQueryConfig((prev) => ({ ...prev, projectId: event.target.value }))
                            }
                            placeholder="ex: meu-projeto-123"
                            autoCapitalize="none"
                            spellCheck={false}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Dataset</label>
                          <input
                            type="text"
                            value={bigQueryConfig.dataset}
                            onChange={(event) =>
                              setBigQueryConfig((prev) => ({ ...prev, dataset: event.target.value }))
                            }
                            placeholder="ex: marketing"
                            autoCapitalize="none"
                            spellCheck={false}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Tabelas</label>
                          <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2">
                            {bigQueryConfig.tables.map((table) => (
                              <span
                                key={table}
                                className="inline-flex items-center gap-2 rounded-full bg-[#EEF0FF] px-3 py-1 text-[11px] font-semibold text-[#5B4DFF]"
                              >
                                {table}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBigQueryConfig((prev) => ({
                                      ...prev,
                                      tables: prev.tables.filter((item) => item !== table),
                                      table:
                                        prev.table === table
                                          ? prev.tables.filter((item) => item !== table)[0] ?? ''
                                          : prev.table,
                                    }))
                                  }
                                  className="text-[#5B4DFF]/70 hover:text-[#5B4DFF]"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            <input
                              type="text"
                              value={bigQueryTableInput}
                              onChange={(event) => setBigQueryTableInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === ',' || event.key === 'Enter') {
                                  event.preventDefault();
                                  const value = bigQueryTableInput.replace(',', '').trim();
                                  if (value) {
                                    addBigQueryTable(value);
                                    setBigQueryTableInput('');
                                  }
                                }
                              }}
                              onBlur={() => {
                                const value = bigQueryTableInput.trim();
                                if (value) {
                                  addBigQueryTable(value);
                                  setBigQueryTableInput('');
                                }
                              }}
                              placeholder="ex: leads_mensais"
                              autoCapitalize="none"
                              spellCheck={false}
                              className="flex-1 min-w-[160px] border-0 bg-transparent p-1 text-sm focus:outline-none"
                            />
                          </div>
                          <p className="text-[11px] text-gray-400 mt-1">
                            A primeira tabela da lista será usada como padrão se o widget não informar outra tabela.
                          </p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                            Localização (opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="us, eu..."
                            value={bigQueryConfig.location}
                            onChange={(event) =>
                              setBigQueryConfig((prev) => ({ ...prev, location: event.target.value }))
                            }
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-[#5B4DFF] outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                          JSON da conta de serviço
                        </label>
                        <textarea
                          value={bigQueryConfig.serviceAccountJson}
                          onChange={(event) =>
                            setBigQueryConfig((prev) => ({ ...prev, serviceAccountJson: event.target.value }))
                          }
                          placeholder='Cole aqui o conteúdo completo do arquivo .json gerado no IAM ({"type":"service_account",...}).'
                          className="w-full h-32 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:border-[#5B4DFF] outline-none"
                          spellCheck={false}
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Os dados são criptografados no armazenamento. Mantenha a conta com permissão somente leitura
                          no dataset informado.
                        </p>
                      </div>
                    </div>
                 )}
                 </>
                 )}
               </div>

               {errorMessage && (
                 <div className="mb-3 flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                   <AlertCircle size={14} />
                   {errorMessage}
                 </div>
               )}

               {catalogMode === 'manual' && (
                 <button 
                   onClick={handleCreate}
                   disabled={
                     isSaving ||
                     !configName.trim() ||
                     !selectedType ||
                     (selectedType === 'mysql' && connectionStatus !== 'success') ||
                     (selectedType === 'supabase' && connectionStatus !== 'success') ||
                     (selectedType === 'google_sheets' &&
                       (!googleConfig.spreadsheetId.trim() ||
                        (googleConfig.worksheets.length === 0 && !googleConfig.worksheet.trim()))) ||
                     (selectedType === 'bigquery' &&
                       (!bigQueryConfig.projectId.trim() ||
                        !bigQueryConfig.dataset.trim() ||
                        (bigQueryConfig.tables.length === 0 && !bigQueryConfig.table.trim()) ||
                        !bigQueryConfig.serviceAccountJson.trim())) ||
                     (selectedType === 'supabase' &&
                       (!supabaseConfig.host.trim() ||
                        !supabaseConfig.port.trim() ||
                        !supabaseConfig.database.trim() ||
                        !supabaseConfig.username.trim() ||
                        !supabaseConfig.password.trim()))
                   }
                   className="w-full py-3.5 bg-[#5B4DFF] text-white font-semibold rounded-xl shadow-lg shadow-indigo-200 hover:bg-[#4B3DCC] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                 >
                   {isSaving ? <Loader2 className="animate-spin" size={16} /> : editingId ? 'Salvar alterações' : 'Salvar e Conectar'}
                 </button>
               )}
            </div>
          )}
        </div>

        <button
          onMouseDown={handleResizeStart}
          className="absolute bottom-2 right-3 w-5 h-5 cursor-se-resize flex items-center justify-center text-slate-400 hover:text-slate-600"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 20h16v-4M8 20v-8m4 8v-12" />
          </svg>
        </button>
      </div>

      {(confirmDeleteId || confirmDeleteNativeId) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Excluir conexão</h3>
            <p className="text-sm text-gray-500 mt-2">
              Para confirmar a exclusão de <strong>{confirmDeleteName}</strong>, digite <strong>excluir</strong>.
            </p>
            <input
              value={confirmDeleteInput}
              onChange={(event) => setConfirmDeleteInput(event.target.value)}
              placeholder="excluir"
              className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#5B4DFF] outline-none"
            />
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setConfirmDeleteId(null);
                  setConfirmDeleteNativeId(null);
                  setConfirmDeleteName('');
                  setConfirmDeleteInput('');
                }}
                className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmDeleteId) {
                    void handleRemove(confirmDeleteId);
                    return;
                  }
                  if (confirmDeleteNativeId) {
                    void handleRemoveNative(confirmDeleteNativeId);
                  }
                }}
                disabled={confirmDeleteInput.trim().toLowerCase() !== 'excluir'}
                className="px-4 py-2 text-sm rounded-xl bg-red-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Excluir conexão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
