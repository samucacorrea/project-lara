import React, { useState, DragEvent, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { WidgetRenderer } from './components/WidgetRenderer';
import { DraggableWidget } from './components/DraggableWidget';
import { DataSourcesModal } from './components/DataSourcesModal';
import { DataSchemaModal } from './components/DataSchemaModal';
import { SaveReportModal } from './components/SaveReportModal';
import {
  Widget,
  DataSource,
  WidgetType,
  DataSourcePayload,
  DateFilterPreset,
  GlobalFilterState,
  WidgetStyle,
  ReportLayout,
  CanvasSettings,
  JoinConfig,
} from './types';
import {
  Eye,
  Save,
  Database,
  Settings,
  Search,
  Bell,
  MessageSquare,
  LogOut,
  Share2,
  LayoutGrid,
  Plus,
  FileText,
  Users,
} from 'lucide-react';
import { listDataSources, createDataSource, updateDataSource, deleteDataSource } from './services/dataSourcesService';
import { DebugProvider, useDebugNotifications } from './components/DebugProvider';
import { GlobalDateFilterBar } from './components/GlobalDateFilterBar';
import { fetchDashboardSettings, updateDashboardSettings } from './services/dashboardSettingsService';
import { saveReport, fetchReport, shareReport, listReports, updateReport, deleteReport, ReportRecord } from './services/reportsService';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { CalculatedMetricsProvider } from './components/CalculatedMetricsProvider';
import { LoginView } from './components/LoginView';
import { JoinBuilder } from './components/extractor/JoinBuilder';
import { UserSettingsView } from './components/UserSettingsView';

const INITIAL_WIDGETS: Widget[] = [];

const formatDate = (date: Date) => date.toISOString().split('T')[0];

const createRange = (days: number): { start: string; end: string } => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  return { start: formatDate(start), end: formatDate(end) };
};

const presetConfig: Record<Exclude<DateFilterPreset, 'custom'>, { label: string; range: { start: string; end: string } }> = {
  today: { label: 'Hoje', range: { start: formatDate(new Date()), end: formatDate(new Date()) } },
  yesterday: {
    label: 'Ontem',
    range: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      const iso = formatDate(date);
      return { start: iso, end: iso };
    })(),
  },
  last7: { label: 'Últimos 7 dias', range: createRange(7) },
  last15: { label: 'Últimos 15 dias', range: createRange(15) },
  last30: { label: 'Últimos 30 dias', range: createRange(30) },
};

const defaultGlobalFilter: GlobalFilterState = {
  preset: 'last30',
  dateRange: presetConfig.last30.range,
  dimensionFilter: { dimension: 'campaign', value: 'all' },
};

const defaultCanvasSettings: CanvasSettings = {
  backgroundType: 'color',
  backgroundColor: '#F3F4F8',
  gradientFrom: '#5B4DFF',
  gradientTo: '#9333EA',
  gradientAngle: 135,
  imageFit: 'cover',
  height: 900,
  fullscreen: false,
  customFonts: [],
};

const LAYOUT_CONFIG: Record<ReportLayout, { label: string; description: string; width: number }> = {
  desktop: {
    label: 'Desktop',
    description: 'Ideal para relatórios completos com múltiplos gráficos em paralelo.',
    width: 1200,
  },
  mobile: {
    label: 'Mobile',
    description: 'Layout compacto pensado para visualização vertical sem rolagem lateral.',
    width: 420,
  },
};

const AUTOSAVE_INTERVAL_MS = 12000;

const clampWidgetStyleToWidth = (style: WidgetStyle, widthLimit: number): WidgetStyle => {
  const safeWidth = Math.min(style.width ?? widthLimit, widthLimit);
  const maxX = Math.max(0, widthLimit - safeWidth);
  const safeX = Math.max(0, Math.min(style.x ?? 0, maxX));
  return {
    ...style,
    width: safeWidth,
    x: safeX,
  };
};

function AppContent() {
  const [widgets, setWidgets] = useState<Widget[]>(INITIAL_WIDGETS);
  const [viewMode, setViewMode] = useState<'list' | 'builder' | 'extractor' | 'settings'>('list');
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState('');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const { addMessage } = useDebugNotifications();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isFetchingDataSources, setIsFetchingDataSources] = useState(true);
  const [dashboardDataSourceId, setDashboardDataSourceId] = useState<string>('');
  const [isDateFilterVisible, setIsDateFilterVisible] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<GlobalFilterState>(defaultGlobalFilter);
  const [joinConfig, setJoinConfig] = useState<JoinConfig>({ tables: [], joins: [] });
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [lastSavedReport, setLastSavedReport] = useState<ReportRecord | null>(null);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const [sharedReportSlug, setSharedReportSlug] = useState<string | null>(null);
  const [sharedReportName, setSharedReportName] = useState('');
  const [copiedWidget, setCopiedWidget] = useState<Widget | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingSaveValues, setPendingSaveValues] = useState({ name: '', isPublic: false });
  const settingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === '1';
  });
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('propertiesPanelCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [routerLocation, setRouterLocation] = useState(
    () => window.location.pathname + window.location.search
  );

  const [isPreview, setIsPreview] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [reportLayout, setReportLayout] = useState<ReportLayout>('desktop');
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>(defaultCanvasSettings);
  const { user, isAuthenticating, logout } = useAuth();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const dirtyGuardRef = useRef(true);
  const newRouteHandledRef = useRef(false);
  const updateRouterLocation = useCallback(() => {
    setRouterLocation(window.location.pathname + window.location.search);
  }, []);

  const markStateAsClean = useCallback(() => {
    dirtyGuardRef.current = true;
    setHasUnsavedChanges(false);
  }, []);

  useEffect(() => {
    const handlePopState = () => updateRouterLocation();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [updateRouterLocation]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('propertiesPanelCollapsed', String(isPropertiesCollapsed));
    } catch {
      // ignore storage errors
    }
  }, [isPropertiesCollapsed]);

  useEffect(() => {
    if (dirtyGuardRef.current) {
      dirtyGuardRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [widgets, canvasSettings, globalFilter, isDateFilterVisible, dashboardDataSourceId]);

  const pushRoute = useCallback(
    (path: string) => {
      const target = path.startsWith('/') ? path : `/${path}`;
      const current = window.location.pathname + window.location.search;
      if (current !== target) {
        window.history.pushState({}, '', target);
        updateRouterLocation();
      }
    },
    [updateRouterLocation]
  );

  const currentUrlInfo = useMemo(
    () => new URL(routerLocation, window.location.origin),
    [routerLocation]
  );
  const shareSlugFromQuery = currentUrlInfo.searchParams.get('report');
  const routeSegments = useMemo(
    () => currentUrlInfo.pathname.split('/').filter((segment) => segment !== ''),
    [currentUrlInfo]
  );
  const isShareRoute =
    routeSegments[0] === 'report' ||
    (routeSegments[0] === 'reports' && routeSegments.length === 2);
  const shareSlugFromPath = isShareRoute ? routeSegments[1] ?? null : null;
  const shareSlugFromRoute = shareSlugFromQuery ?? shareSlugFromPath ?? null;
  const currentShareUrl = useMemo(() => {
    if (lastSavedReport?.share_url) {
      return lastSavedReport.share_url;
    }

    if (sharedReportSlug) {
      return `${window.location.origin}/report/${sharedReportSlug}`;
    }

    return null;
  }, [lastSavedReport?.share_url, sharedReportSlug]);

  const presetOptions = useMemo(
    () => [
      { key: 'last30' as DateFilterPreset, label: 'Últimos 30 dias' },
      { key: 'last15' as DateFilterPreset, label: 'Últimos 15 dias' },
      { key: 'last7' as DateFilterPreset, label: 'Última semana' },
      { key: 'yesterday' as DateFilterPreset, label: 'Ontem' },
      { key: 'today' as DateFilterPreset, label: 'Hoje' },
      { key: 'custom' as DateFilterPreset, label: 'Personalizado' },
    ],
    []
  );

  const getCanvasWidth = useCallback(() => {
    if (canvasSettings.fullscreen && canvasSettings.width) {
      return canvasSettings.width;
    }
    const measured = canvasRef.current?.clientWidth;
    if (measured && measured > 0) {
      return measured;
    }
    if (canvasSettings.fullscreen && canvasRef.current?.parentElement) {
      const parentWidth = canvasRef.current.parentElement.clientWidth;
      if (parentWidth && parentWidth > 0) {
        return parentWidth;
      }
    }
    const base = canvasSettings.width ?? LAYOUT_CONFIG[reportLayout].width;
    return base;
  }, [canvasSettings.fullscreen, canvasSettings.width, reportLayout]);

  useEffect(() => {
    const clampAllWidgets = () => {
      const width = getCanvasWidth();
      setWidgets((prev) => {
        let changed = false;
        const next = prev.map((widget) => {
          const clamped = clampWidgetStyleToWidth(widget.style, width);
          if (clamped.x !== widget.style.x || clamped.width !== widget.style.width) {
            changed = true;
            return { ...widget, style: clamped };
          }
          return widget;
        });
        return changed ? next : prev;
      });
    };

    clampAllWidgets();
    window.addEventListener('resize', clampAllWidgets);
    return () => window.removeEventListener('resize', clampAllWidgets);
  }, [getCanvasWidth]);

  const canEdit = Boolean(user && (user.role === 'admin' || user.role === 'standard'));

  const formatDateTime = useCallback((value?: string) => {
    if (!value) return '---';
    try {
      return new Date(value).toLocaleString('pt-BR');
    } catch {
      return value;
    }
  }, []);

  const handlePresetChange = useCallback((preset: DateFilterPreset) => {
    if (preset === 'custom') {
      setGlobalFilter((prev) => ({ ...prev, preset }));
      return;
    }

    const config = presetConfig[preset];
    setGlobalFilter((prev) => ({
      ...prev,
      preset,
      dateRange: config?.range || prev.dateRange,
    }));
  }, []);

  const handleCustomDateChange = useCallback((field: 'start' | 'end', value: string) => {
    setGlobalFilter((prev) => ({
      ...prev,
      preset: 'custom',
      dateRange: { ...prev.dateRange, [field]: value },
    }));
  }, []);

  const handleDimensionFilterChange = useCallback((dimension: string, value: string) => {
    setGlobalFilter((prev) => ({
      ...prev,
      dimensionFilter: { dimension, value },
    }));
  }, []);

  const handleClearDimensionFilter = useCallback(() => {
    setGlobalFilter((prev) => {
      if (!prev.dimensionFilter) {
        return prev;
      }
      return {
        ...prev,
        dimensionFilter: { ...prev.dimensionFilter, value: 'all' },
      };
    });
  }, []);

  const handleDashboardSourceChange = useCallback(
    (value: string) => {
      if (isSharedView || !canEdit) return;
      setDashboardDataSourceId(value);
    },
    [canEdit, isSharedView]
  );

  const handleLayoutChange = useCallback(
    (layout: ReportLayout) => {
      if (!canEdit || isSharedView) return;
      setReportLayout(layout);
    },
    [canEdit, isSharedView]
  );

  const handleCanvasSettingsChange = useCallback((patch: Partial<CanvasSettings>) => {
    setCanvasSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const getErrorMessage = useCallback((error: unknown): string => {
    return error instanceof Error ? error.message : 'Erro inesperado ao comunicar com o servidor.';
  }, []);

  const getErrorDetails = useCallback((error: unknown): string | undefined => {
    if (error && typeof error === 'object' && 'details' in (error as Record<string, unknown>)) {
      const details = (error as Record<string, unknown>).details;
      try {
        return typeof details === 'string' ? details : JSON.stringify(details, null, 2);
      } catch {
        return String(details);
      }
    }
    return undefined;
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setIsLoadingReports(true);
      setReportsError(null);
      const data = await listReports();
      setReports(data);
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : 'Falha ao carregar dashboards.');
    } finally {
      setIsLoadingReports(false);
    }
  }, []);

  const loadReportFromSlug = useCallback(
    async (slug: string, options?: { shared?: boolean }) => {
      const sharedMode = options?.shared ?? false;
      try {
        setSharedReportSlug(slug);
        const report = await fetchReport(slug, { isPublic: sharedMode });
        setSharedReportName(report.name ?? 'Relatório');
        const loadedLayout = (report.layout_type as ReportLayout) ?? 'desktop';
        setReportLayout(loadedLayout);
        const preparedWidgets = (report.widgets ?? []).map((widget) => ({
          ...widget,
          style: clampWidgetStyleToWidth(widget.style, LAYOUT_CONFIG[loadedLayout].width),
        }));
        setWidgets(preparedWidgets);
        setDashboardDataSourceId(report.data_source_id ? String(report.data_source_id) : '');
        setGlobalFilter(report.global_filter ?? defaultGlobalFilter);
        setIsDateFilterVisible(report.date_filter_visible ?? true);
        setCanvasSettings(report.canvas_settings ?? defaultCanvasSettings);
        setJoinConfig((report.join_config as JoinConfig) ?? { tables: [], joins: [] });
        setLastSavedReport(report);
        setIsSharedView(sharedMode);
        setIsPreview(sharedMode);
        setSelectedWidgetId(null);
        setViewMode('builder');
        markStateAsClean();
      } catch (error) {
        addMessage({
          level: 'error',
          message: sharedMode ? 'Falha ao carregar relatório' : 'Não foi possível abrir o dashboard',
          details: getErrorMessage(error),
        });
        if (sharedMode) {
          setIsSharedView(false);
        } else {
          pushRoute('/dashboards');
        }
      }
    },
    [addMessage, defaultGlobalFilter, getErrorMessage, markStateAsClean, pushRoute]
  );

  const refreshDataSources = useCallback(async () => {
    try {
      setIsFetchingDataSources(true);
      const response = await listDataSources();
      setDataSources(response);
      addMessage({
        level: 'info',
        message: 'Fontes sincronizadas',
        details: `${response.length} conexão(ões) carregadas.`,
      });
    } catch (error) {
      addMessage({
        level: 'error',
        message: 'Falha ao carregar fontes de dados',
        details: getErrorMessage(error),
      });
    } finally {
      setIsFetchingDataSources(false);
    }
  }, [addMessage, getErrorMessage]);

  useEffect(() => {
    if (!user) return;
    refreshDataSources();
  }, [refreshDataSources, user]);

  useEffect(() => {
    if (!user) return;
    loadReports();
  }, [user, loadReports]);

  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      try {
        const settings = await fetchDashboardSettings();
        if (settings.dataSourceId) {
          setDashboardDataSourceId(settings.dataSourceId);
        }
        if (settings.globalFilter) {
          setGlobalFilter(settings.globalFilter);
        } else {
          setGlobalFilter(defaultGlobalFilter);
        }
        setIsDateFilterVisible(settings.dateFilterVisible);
      } catch (error) {
        addMessage({
          level: 'error',
          message: 'Falha ao carregar configurações do dashboard',
          details: error instanceof Error ? error.message : 'Erro inesperado',
        });
      } finally {
        setIsSettingsLoaded(true);
      }
    };

    loadSettings();
  }, [addMessage, user]);

  useEffect(() => {
    if (!user || isSharedView) return;
    if (dataSources.length > 0 && !dashboardDataSourceId) {
      setDashboardDataSourceId(dataSources[0].id);
    }
  }, [dataSources, dashboardDataSourceId, isSharedView, user]);

  useEffect(() => {
    if (!dashboardDataSourceId) return;
    setWidgets((prev) =>
      prev.map((widget) => ({
        ...widget,
        dataConfig: {
          ...widget.dataConfig,
          sourceId: dashboardDataSourceId,
        },
      }))
    );
  }, [dashboardDataSourceId]);

  useEffect(() => {
    if (!user || !isSettingsLoaded || isSharedView) return;

    if (settingsDebounceRef.current) {
      clearTimeout(settingsDebounceRef.current);
    }

    settingsDebounceRef.current = setTimeout(() => {
      setIsSavingSettings(true);
      updateDashboardSettings({
        data_source_id: dashboardDataSourceId || null,
        global_filter: globalFilter,
        date_filter_visible: isDateFilterVisible,
      })
        .catch((error) => {
          addMessage({
            level: 'error',
            message: 'Falha ao salvar dashboard',
            details: error instanceof Error ? error.message : 'Erro inesperado',
          });
        })
        .finally(() => {
          setIsSavingSettings(false);
        });
    }, 600);

    return () => {
      if (settingsDebounceRef.current) {
        clearTimeout(settingsDebounceRef.current);
      }
    };
  }, [dashboardDataSourceId, globalFilter, isDateFilterVisible, isSettingsLoaded, addMessage, isSharedView, user]);

  const handleAddDataSource = useCallback(async (payload: DataSourcePayload) => {
    if (!canEdit) return;
    try {
      const created = await createDataSource(payload);
      setDataSources(prev => [created, ...prev]);
      setDashboardDataSourceId((prev) => prev || created.id);
      addMessage({
        level: 'success',
        message: 'Fonte conectada com sucesso',
        details: `${created.name} (${created.type})`,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      addMessage({
        level: 'error',
        message: 'Erro ao salvar fonte de dados',
        details: getErrorDetails(error) ?? message,
      });
      throw error instanceof Error ? error : new Error(message);
    }
  }, [addMessage, canEdit, getErrorDetails, getErrorMessage]);

  const handleUpdateDataSource = useCallback(async (id: string, payload: DataSourcePayload) => {
    if (!canEdit) return;
    try {
      const updated = await updateDataSource(id, payload);
      setDataSources(prev => prev.map(ds => (ds.id === id ? updated : ds)));
      addMessage({
        level: 'success',
        message: 'Fonte atualizada',
        details: `${updated.name} (${updated.type})`,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      addMessage({
        level: 'error',
        message: 'Erro ao atualizar fonte',
        details: getErrorDetails(error) ?? message,
      });
      throw error instanceof Error ? error : new Error(message);
    }
  }, [addMessage, canEdit, getErrorDetails, getErrorMessage]);

  const handleRemoveDataSource = useCallback(async (id: string) => {
    if (!canEdit) return;
    if (!window.confirm('Tem certeza que deseja remover esta fonte de dados?')) {
      return;
    }

    try {
      await deleteDataSource(id);
      setDataSources(prev => {
        const updated = prev.filter(ds => ds.id !== id);
        if (dashboardDataSourceId === id) {
          setDashboardDataSourceId(updated[0]?.id ?? '');
        }
        return updated;
      });
      addMessage({
        level: 'info',
        message: 'Fonte removida',
        details: `ID ${id}`,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      addMessage({
        level: 'error',
        message: 'Erro ao remover fonte',
        details: getErrorDetails(error) ?? message,
      });
      throw error instanceof Error ? error : new Error(message);
    }
  }, [addMessage, canEdit, dashboardDataSourceId, getErrorDetails, getErrorMessage]);

  const canEditReportRecord = useCallback(
    (report: ReportRecord) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (report.owner_id === user.id) return true;
      return report.collaborator_permission === 'edit';
    },
    [user]
  );

  const canDeleteReportRecord = useCallback(
    (report: ReportRecord) => {
      if (!user) return false;
      return user.role === 'admin' || report.owner_id === user.id;
    },
    [user]
  );

  const startCreateDashboard = useCallback(
    (options?: { silent?: boolean }) => {
      if (!canEdit) return;
      if (!options?.silent) {
        pushRoute('/dashboards/new');
      }
      setReportLayout('desktop');
      setWidgets([]);
      setSelectedWidgetId(null);
      setSharedReportName('');
      setSharedReportSlug(null);
      setLastSavedReport(null);
      setIsSharedView(false);
      setGlobalFilter(defaultGlobalFilter);
      setIsDateFilterVisible(true);
      setCanvasSettings(defaultCanvasSettings);
      setJoinConfig({ tables: [], joins: [] });
      setViewMode('builder');
      setIsPreview(false);
      markStateAsClean();
    },
    [canEdit, pushRoute, markStateAsClean]
  );

  const startEditDashboard = useCallback(
    (report: ReportRecord, options?: { silent?: boolean }) => {
      if (!canEditReportRecord(report)) return;
      if (!options?.silent) {
        pushRoute(`/dashboards/${report.slug}`);
      }
      loadReportFromSlug(report.slug, { shared: false });
    },
    [canEditReportRecord, loadReportFromSlug, pushRoute]
  );

  const handleExitBuilder = useCallback(() => {
    pushRoute('/dashboards');
    setViewMode('list');
    setIsPreview(false);
    setIsSharedView(false);
    setSharedReportSlug(null);
    setSharedReportName('');
    setLastSavedReport(null);
    setWidgets(INITIAL_WIDGETS);
    setSelectedWidgetId(null);
    setCanvasSettings(defaultCanvasSettings);
    setJoinConfig({ tables: [], joins: [] });
    loadReports();
  }, [loadReports, pushRoute]);

  const handleDeleteReport = useCallback(
    async (report: ReportRecord) => {
      if (!canDeleteReportRecord(report)) return;
      if (!window.confirm(`Excluir o dashboard "${report.name}"? Esta ação não pode ser desfeita.`)) {
        return;
      }

      try {
        await deleteReport(report.id);
        addMessage({ level: 'success', message: 'Dashboard removido', details: report.name });
        loadReports();
      } catch (error) {
        addMessage({
          level: 'error',
          message: 'Erro ao excluir dashboard',
          details: getErrorMessage(error),
        });
      }
    },
    [addMessage, canDeleteReportRecord, getErrorMessage, loadReports]
  );

  const handleRequestSave = useCallback(() => {
    if (!canEdit) return;

    if (widgets.length === 0) {
      addMessage({
        level: 'warning',
        message: 'Nada para guardar',
        details: 'Adicione ao menos um componente antes de salvar.',
      });
      return;
    }

    const fallbackName =
      sharedReportName && sharedReportName.trim() !== ''
        ? sharedReportName
        : `Dashboard ${new Date().toLocaleDateString('pt-BR')}`;
    const defaultName = lastSavedReport?.name ?? fallbackName;

    setPendingSaveValues({
      name: defaultName,
      isPublic: Boolean(lastSavedReport?.is_public),
    });
    setIsSaveModalOpen(true);
  }, [addMessage, canEdit, lastSavedReport, sharedReportName, widgets.length]);

  const persistReport = useCallback(
    async (
      { name, isPublic }: { name: string; isPublic: boolean },
      options?: { silent?: boolean }
    ) => {
      if (!canEdit) return false;

      if (widgets.length === 0) {
        addMessage({
          level: 'warning',
          message: 'Nada para guardar',
          details: 'Adicione ao menos um componente antes de salvar.',
        });
        return false;
      }

      const isSilent = Boolean(options?.silent);
      const toggleSaving = isSilent ? setIsAutoSaving : setIsSavingReport;
      toggleSaving(true);
      try {
        const payload = {
          name,
          data_source_id: dashboardDataSourceId || null,
          global_filter: globalFilter,
          date_filter_visible: isDateFilterVisible,
          widgets,
          is_public: isPublic,
          layout_type: reportLayout,
          canvas_settings: canvasSettings,
          join_config: joinConfig,
        };

        let report: ReportRecord;
        if (lastSavedReport) {
          report = await updateReport(lastSavedReport.id, payload);
        } else {
          report = await saveReport(payload);
          pushRoute(`/dashboards/${report.slug}`);
        }

        const shareUrl = report.share_url ?? `${window.location.origin}/report/${report.slug}`;
        setSharedReportName(name);
        setSharedReportSlug(report.slug);
        setLastSavedReport(report);
        setReportLayout((report.layout_type as ReportLayout) ?? reportLayout);
        setCanvasSettings(report.canvas_settings ?? defaultCanvasSettings);
        setJoinConfig((report.join_config as JoinConfig) ?? { tables: [], joins: [] });
        markStateAsClean();
        if (!isSilent) {
          addMessage({
            level: 'success',
            message: 'Relatório guardado',
            details: shareUrl,
          });
          try {
            await navigator.clipboard?.writeText(shareUrl);
          } catch {
            // ignore clipboard errors
          }
        }
        return true;
      } catch (error) {
        addMessage({
          level: 'error',
          message: 'Erro ao guardar relatório',
          details: getErrorMessage(error),
        });
        return false;
      } finally {
        toggleSaving(false);
      }
    },
    [
      addMessage,
      canEdit,
      dashboardDataSourceId,
      globalFilter,
      isDateFilterVisible,
      lastSavedReport,
      pushRoute,
      widgets,
      canvasSettings,
      getErrorMessage,
      reportLayout,
      defaultCanvasSettings,
      markStateAsClean,
    ]
  );

  const handleConfirmSave = useCallback(
    async (values: { name: string; isPublic: boolean }) => {
      const success = await persistReport(values);
      if (success) {
        setIsSaveModalOpen(false);
      }
    },
    [persistReport]
  );

  const handleCancelSave = useCallback(() => {
    if (isSavingReport) return;
    setIsSaveModalOpen(false);
  }, [isSavingReport]);

  const handleShareReport = useCallback(async () => {
    if (!canEdit) return;
    if (!lastSavedReport) {
      addMessage({
        level: 'warning',
        message: 'Salve o relatório antes de compartilhar',
        details: 'Clique em Guardar para gerar o link e o ID.',
      });
      return;
    }

    if (user?.role !== 'admin' && lastSavedReport.owner_id !== user?.id) {
      addMessage({
        level: 'error',
        message: 'Somente o proprietário pode compartilhar',
        details: 'Peça ao dono do relatório para liberar o acesso.',
      });
      return;
    }

    const email = window.prompt('Informe o e-mail do usuário para conceder acesso:');
    if (!email) return;

    try {
      await shareReport(lastSavedReport.id, { email });
      addMessage({
        level: 'success',
        message: 'Compartilhado com sucesso',
        details: email,
      });
    } catch (error) {
      addMessage({
        level: 'error',
        message: 'Erro ao compartilhar relatório',
        details: getErrorMessage(error),
      });
    }
  }, [addMessage, canEdit, getErrorMessage, lastSavedReport, user]);

  const handleCopyWidget = useCallback(() => {
    if (!canEdit || viewMode !== 'builder') return;
    const widget = widgets.find((w) => w.id === selectedWidgetId);
    if (widget) {
      const snapshot: Widget = JSON.parse(JSON.stringify(widget));
      setCopiedWidget(snapshot);
      addMessage({ level: 'info', message: 'Widget copiado', details: widget.title ?? widget.type });
    }
  }, [addMessage, canEdit, selectedWidgetId, viewMode, widgets]);

  const handlePasteWidget = useCallback(() => {
    if (!canEdit || viewMode !== 'builder' || !copiedWidget) return;
    const newId = `${Date.now()}-${Math.random()}`;
    setWidgets((prev) => {
      const clone: Widget = JSON.parse(JSON.stringify(copiedWidget));
      clone.id = newId;
      clone.title = clone.title ? `${clone.title} (cópia)` : clone.title;
      clone.style = {
        ...clone.style,
        x: (clone.style.x ?? 0) + 24,
        y: (clone.style.y ?? 0) + 24,
        zIndex: prev.length + 1,
      };
      clone.style = clampWidgetStyleToWidth(clone.style, getCanvasWidth());
      return [...prev, clone];
    });
    setSelectedWidgetId(newId);
  }, [canEdit, copiedWidget, getCanvasWidth, viewMode]);

  const handleAddWidget = (type: WidgetType, dropX?: number, dropY?: number) => {
    if (isSharedView || !canEdit) return;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const canvasWidth = getCanvasWidth();
    const x = dropX && canvasRect ? dropX - canvasRect.left : 50;
    const y = dropY && canvasRect ? dropY - canvasRect.top : 50;
    const defaultTitle =
      type === 'text' ? 'Novo Título' : type === 'image' ? '' : `Novo ${type.replace('_', ' ')}`;
    const widgetId = `${Date.now()}-${Math.random()}`;

    setWidgets((prev) => {
      const newWidget: Widget = {
        id: widgetId,
        type,
        title: defaultTitle,
        content: type === 'text' ? 'Duplo clique para editar' : undefined,
        advancedCss: '',
        style: {
          x,
          y,
          width: type === 'card' ? 360 : type === 'funnel_chart' ? 420 : 320,
          height: type === 'text' ? 100 : type === 'card' ? 200 : type === 'funnel_chart' ? 420 : 280,
          zIndex: prev.length + 1,
          backgroundColor: type === 'image' ? 'transparent' : '#ffffff',
          padding: 16,
          borderRadius: 16,
          color: '#0f172a',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'left',
          titleColor: '#0f172a',
          titleFontSize: 16,
          titleFontFamily: 'Inter, system-ui, sans-serif',
          titleAlign: 'left',
          titleMarginBottom: 6,
          contentColor: '#0f172a',
          contentFontSize: 13,
          contentFontFamily: 'Inter, system-ui, sans-serif',
          contentPadding: 16,
        },
        dataConfig: {
          sourceId: '',
          tableName: '',
          dimension: '',
          metric: '',
          cardLabel: type === 'card' ? 'Orders' : undefined,
          cardIcon: type === 'card' ? 'bag' : undefined,
          funnelSteps:
            type === 'funnel_chart'
              ? [
                  { label: 'Etapa 1', metric: '' },
                  { label: 'Etapa 2', metric: '' },
                  { label: 'Etapa 3', metric: '' },
                ]
              : undefined,
        },
      };
      newWidget.style = clampWidgetStyleToWidth(newWidget.style, canvasWidth);
      return [...prev, newWidget];
    });

    setSelectedWidgetId(widgetId);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('widgetType') as WidgetType;
    if (type) {
      handleAddWidget(type, e.clientX, e.clientY);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const updateWidget = useCallback(
    (id: string, updates: Partial<Widget>) => {
      if (!canEdit) return;
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const next: Widget = { ...w, ...updates };
          if (updates.style) {
            next.style = clampWidgetStyleToWidth({ ...w.style, ...updates.style }, getCanvasWidth());
          }
          if (updates.dataConfig) {
            next.dataConfig = {
              ...w.dataConfig,
              ...updates.dataConfig,
            };
          }
          return next;
        })
      );
    },
    [canEdit, getCanvasWidth]
  );

  const deleteWidget = useCallback(
    (id: string) => {
      if (!canEdit) return;
      setWidgets((prev) => prev.filter((w) => w.id !== id));
      setSelectedWidgetId((prev) => (prev === id ? null : prev));
    },
    [canEdit]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!canEdit || viewMode !== 'builder') return;
      const target = event.target as HTMLElement | null;
      const editableElement =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('input,textarea,[contenteditable=\"true\"]'));
      if (editableElement) {
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (isMeta && key === 'c') {
        event.preventDefault();
        handleCopyWidget();
      } else if (isMeta && key === 'v') {
        event.preventDefault();
        handlePasteWidget();
      } else if ((key === 'delete' || key === 'backspace') && selectedWidgetId) {
        event.preventDefault();
        deleteWidget(selectedWidgetId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, viewMode, handleCopyWidget, handlePasteWidget, selectedWidgetId, deleteWidget]);

  useEffect(() => {
    const currentUrl = currentUrlInfo;
    const sharedSlug = shareSlugFromRoute;
    if (sharedSlug) {
      if (sharedSlug !== sharedReportSlug || !isSharedView) {
        if (hasUnsavedChanges && sharedSlug === lastSavedReport?.slug) {
          return;
        }
        loadReportFromSlug(sharedSlug, { shared: true });
      }
      return;
    }

    const segments = routeSegments;
    const isNewRoute = segments[0] === 'dashboards' && segments[1] === 'new';
    if (isNewRoute) {
      if (!newRouteHandledRef.current) {
        startCreateDashboard({ silent: true });
        newRouteHandledRef.current = true;
      }
      return;
    }
    newRouteHandledRef.current = false;

    if (segments.length === 0) {
      pushRoute('/dashboards');
      return;
    }

    if (segments[0] === 'settings') {
      setViewMode('settings');
      setIsSharedView(false);
      setSharedReportSlug(null);
      return;
    }

    if (segments[0] === 'extractor') {
      setViewMode('extractor');
      setIsSharedView(false);
      setSharedReportSlug(null);
      return;
    }

    if (segments[0] === 'dashboards') {
      if (segments.length === 1) {
        setViewMode('list');
        setIsSharedView(false);
        setSharedReportSlug(null);
        return;
      }
      const slug = segments[1];
      if (slug) {
        if (
          (slug === lastSavedReport?.slug && !isSharedView && viewMode === 'builder') ||
          (hasUnsavedChanges && slug === lastSavedReport?.slug)
        ) {
          return;
        }
        loadReportFromSlug(slug, { shared: false });
        return;
      }
    }

    if (!shareSlugFromRoute) {
      pushRoute('/dashboards');
    }
  }, [
    hasUnsavedChanges,
    isSharedView,
    lastSavedReport?.slug,
    loadReportFromSlug,
    pushRoute,
    sharedReportSlug,
    startCreateDashboard,
    viewMode,
    routerLocation,
    currentUrlInfo,
    shareSlugFromRoute,
    routeSegments,
  ]);

  const previewMode = isPreview || !canEdit;
  const isEditMode = viewMode === 'builder' && canEdit && !isSharedView;
  const selectedWidget = widgets.find(w => w.id === selectedWidgetId) || null;
  const canvasStyle = useMemo(() => {
    const isFullscreen = Boolean(canvasSettings.fullscreen);
    const widthValue = canvasSettings.width ?? LAYOUT_CONFIG[reportLayout].width;
    const widthCss = typeof widthValue === 'number' ? `${widthValue}px` : widthValue;
    const minHeight = isFullscreen ? '100vh' : canvasSettings.height ?? 900;
    const type = canvasSettings.backgroundType;
    const hasCustomWidth = Boolean(canvasSettings.width);
    const capWidthToViewport = previewMode && !isFullscreen;
    const style: React.CSSProperties = {
      width: capWidthToViewport ? '100%' : widthCss,
      maxWidth: capWidthToViewport ? widthCss : isFullscreen || hasCustomWidth ? 'none' : '100%',
      minWidth: capWidthToViewport ? undefined : isFullscreen || hasCustomWidth ? widthCss : undefined,
      minHeight,
      height: isFullscreen ? '100vh' : undefined,
      backgroundColor: canvasSettings.backgroundColor ?? '#F3F4F8',
      backgroundImage: undefined,
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      transition: 'background 0.3s ease, background-image 0.3s ease',
    };

    if (type === 'gradient') {
      const from = canvasSettings.gradientFrom ?? '#5B4DFF';
      const to = canvasSettings.gradientTo ?? '#9333EA';
      const angle = canvasSettings.gradientAngle ?? 135;
      style.backgroundImage = `linear-gradient(${angle}deg, ${from}, ${to})`;
      style.backgroundColor = from;
    } else if (type === 'image' && canvasSettings.imageUrl) {
      style.backgroundImage = `url(${canvasSettings.imageUrl})`;
      const fit = canvasSettings.imageFit ?? 'cover';
      if (fit === 'repeat') {
        style.backgroundRepeat = 'repeat';
        style.backgroundSize = 'auto';
      } else if (fit === 'contain') {
        style.backgroundSize = 'contain';
      } else if (fit === 'auto') {
        style.backgroundSize = 'auto';
      } else {
        style.backgroundSize = 'cover';
      }
    }

    return style;
  }, [canvasSettings, previewMode, reportLayout]);

  useEffect(() => {
    const styleId = 'project-lara-custom-fonts';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    const fonts = canvasSettings.customFonts ?? [];
    if (fonts.length === 0) {
      styleElement.textContent = '';
      return () => {
        if (styleElement && styleElement.textContent === '') {
          styleElement.parentElement?.removeChild(styleElement);
        }
      };
    }

    const css = fonts
      .map((font) => {
        const safeName = font.name.replace(/'/g, "\\'");
        return `@font-face { font-family: '${safeName}'; src: url(${font.dataUrl}) format('${font.format}'); font-display: swap; }`;
      })
      .join('\n');
    styleElement.textContent = css;

    return () => {
      // nothing on cleanup; style element reused on next render
    };
  }, [canvasSettings.customFonts]);
  const canShareReport = Boolean(
    lastSavedReport && (user?.role === 'admin' || lastSavedReport.owner_id === user?.id)
  );
  const activeShareSlug = isSharedView && sharedReportSlug ? sharedReportSlug : undefined;
  const userDisplayName = user?.name ?? (isSharedView ? 'Visualização pública' : 'Visitante');
  const userDisplayRole = user?.role ?? (isSharedView ? 'acesso limitado' : 'convidado');
  const canEditCurrentReport = useMemo(() => {
    if (!user) return false;
    if (lastSavedReport) {
      return canEditReportRecord(lastSavedReport);
    }
    return canEdit;
  }, [canEdit, canEditReportRecord, lastSavedReport, user]);

  useEffect(() => {
    const autoSaveAllowed = canEdit && !isSharedView && viewMode === 'builder';
    if (!autoSaveAllowed || !hasUnsavedChanges || widgets.length === 0) return;

    const interval = setInterval(() => {
      if (isSavingReport || isAutoSaving) return;
      const savedName = lastSavedReport?.name?.trim();
      const manualName = sharedReportName?.trim();
      const targetName = savedName && savedName.length > 0
        ? savedName
        : manualName && manualName.length > 0
          ? manualName
          : `Rascunho automático ${new Date().toLocaleDateString('pt-BR')}`;
      void persistReport(
        {
          name: targetName,
          isPublic: lastSavedReport?.is_public ?? false,
        },
        { silent: true }
      );
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    canEdit,
    hasUnsavedChanges,
    isAutoSaving,
    isSavingReport,
    isSharedView,
    lastSavedReport?.is_public,
    lastSavedReport?.name,
    persistReport,
    sharedReportName,
    viewMode,
    widgets.length,
  ]);

  if (isAuthenticating && !shareSlugFromRoute) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F3F4F8] text-gray-500 text-sm">
        Validando sessão...
      </div>
    );
  }

  if (!user && !shareSlugFromRoute && !isSharedView) {
    return <LoginView />;
  }

  if (shareSlugFromRoute && !isSharedView) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F3F4F8] text-gray-500 text-sm">
        Preparando visualização pública...
      </div>
    );
  }

  if (viewMode === 'extractor' && !sharedReportSlug) {
    return (
      <div className="flex h-screen bg-[#F3F4F8] text-slate-800">
        <Sidebar
          onAddWidget={() => null}
          showMenu
          activeView="extractor"
          onNavigateView={(next) => {
            if (next === 'list') pushRoute('/dashboards');
            if (next === 'builder') startCreateDashboard();
            if (next === 'extractor') setViewMode('extractor');
          }}
        />
        <div className="flex-1 overflow-y-auto">
          <JoinBuilder
            dataSources={dataSources}
            activeDataSourceId={dashboardDataSourceId}
            joinConfig={joinConfig}
            onChange={setJoinConfig}
          />
        </div>
      </div>
    );
  }

  if (viewMode === 'list' && !sharedReportSlug) {
    const normalizedSearch = reportSearch.trim().toLowerCase();
    const filteredReports = normalizedSearch
      ? reports.filter((report) => {
          const name = (report.name ?? '').toLowerCase();
          const id = report.id ? String(report.id) : '';
          const updatedAt = report.updated_at ?? '';
          return (
            name.includes(normalizedSearch) ||
            id.includes(normalizedSearch) ||
            updatedAt.includes(normalizedSearch)
          );
        })
      : reports;
    return (
      <div className="flex h-screen bg-[#F5F6FA] text-slate-800">
        <aside className="w-64 bg-white border-r border-gray-100 flex flex-col">
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#5B4DFF]/10 flex items-center justify-center text-[#5B4DFF]">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">DashBuilder</p>
                <p className="text-xs text-gray-400">Painéis e relatórios</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase">Menu</p>
              <div className="mt-3 space-y-2">
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium bg-[#5B4DFF]/10 text-[#5B4DFF]">
                  <LayoutGrid className="w-4 h-4" />
                  Dashboards
                </button>
                <button
                  onClick={startCreateDashboard}
                  disabled={!canEdit}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${
                    canEdit
                      ? 'text-gray-600 hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/10'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  Criar dashboard
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/10">
                  <FileText className="w-4 h-4" />
                  Relatórios
                </button>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase">Configurações</p>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => pushRoute('/settings')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/10"
                >
                  <Settings className="w-4 h-4" />
                  Geral
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/10">
                  <Users className="w-4 h-4" />
                  Equipe
                </button>
              </div>
            </div>
          </div>

          <div className="mt-auto p-6">
            <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
              <p className="text-xs text-gray-500">Central em desenvolvimento.</p>
              <div className="mt-2 h-1 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full w-2/3 bg-[#5B4DFF]" />
              </div>
              <button className="mt-3 text-xs text-[#5B4DFF] font-semibold">Ver roadmap</button>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="px-10 pt-10 pb-6 border-b border-gray-100 bg-white sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Meus dashboards</h1>
                <p className="text-sm text-gray-500 mt-1">Gerencie seus relatórios e painéis de dados.</p>
              </div>
              <div className="flex items-center gap-4">
                <button className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-[#5B4DFF]">
                  <Bell className="w-4 h-4" />
                </button>
                <div className="w-10 h-10 rounded-full bg-[#5B4DFF] text-white flex items-center justify-center text-sm font-semibold overflow-hidden">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    user?.name?.slice(0, 2).toUpperCase() ?? 'JD'
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px] max-w-[420px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  placeholder="Buscar por nome, data..."
                  value={reportSearch}
                  onChange={(event) => setReportSearch(event.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4DFF]/30"
                />
              </div>
              <select className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                <option>Todos os Status</option>
                <option>Proprietário</option>
                <option>Editor</option>
                <option>Visualizador</option>
              </select>
              <select className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                <option>Proprietário</option>
                <option>Editor</option>
                <option>Visualizador</option>
              </select>
              {canEdit && (
                <button
                  onClick={startCreateDashboard}
                  className="px-4 py-2.5 bg-[#5B4DFF] text-white rounded-xl shadow-sm hover:bg-[#4b3ae6] text-sm font-semibold flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Novo dashboard
                </button>
              )}
            </div>
          </div>

          <div className="p-10">

          {reportsError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {reportsError}
            </div>
          )}

          {isLoadingReports ? (
            <div className="text-sm text-gray-500">Carregando dashboards...</div>
          ) : filteredReports.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-gray-500">
              <p className="text-lg font-medium">
                {reports.length === 0
                  ? 'Nenhum dashboard criado ainda.'
                  : 'Nenhum resultado encontrado.'}
              </p>
              {reports.length === 0 && canEdit && (
                <button
                  onClick={startCreateDashboard}
                  className="mt-4 px-5 py-2.5 bg-[#5B4DFF] text-white rounded-xl shadow-md hover:bg-[#4b3ae6] text-sm font-semibold"
                >
                  Criar meu primeiro dashboard
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredReports.map((report) => {
                const canEditThis = canEditReportRecord(report);
                const canDeleteThis = canDeleteReportRecord(report);
                return (
                  <div key={report.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#5B4DFF]/10 flex items-center justify-center text-[#5B4DFF]">
                        <LayoutGrid className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-gray-900">{report.name}</h3>
                            <p className="text-xs text-gray-400">ID: #{report.id}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            report.owner_id === user.id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {report.owner_id === user.id
                              ? 'Proprietário'
                              : report.collaborator_permission === 'edit'
                              ? 'Editor'
                              : 'Visualizador'}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-gray-300" />
                            Atualizado
                          </div>
                          <span className="text-right">{formatDateTime(report.updated_at)}</span>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#5B4DFF]/60" />
                            Visualizações
                          </div>
                          <span className="text-right">-</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                      <div className="flex -space-x-2">
                        <div className="w-7 h-7 rounded-full bg-gray-200 border border-white overflow-hidden flex items-center justify-center text-[10px] text-gray-500">
                          {user?.avatar_url ? (
                            <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            user?.name?.slice(0, 2).toUpperCase() ?? 'EU'
                          )}
                        </div>
                        {(report.collaborator_count ?? 0) > 0 && (
                          <div className="w-7 h-7 rounded-full bg-gray-300 border border-white flex items-center justify-center text-[10px] text-white">
                            U
                          </div>
                        )}
                        {(report.collaborator_count ?? 0) > 1 && (
                          <div className="w-7 h-7 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[10px] text-gray-500">
                            +{(report.collaborator_count ?? 0) - 1}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <button
                          onClick={() => window.open(`${window.location.origin}?report=${report.slug}`, '_blank')}
                          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:text-[#5B4DFF] hover:border-[#5B4DFF]"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEditThis && (
                          <button
                            onClick={() => startEditDashboard(report)}
                            className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:text-[#5B4DFF] hover:border-[#5B4DFF]"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteThis && (
                          <button
                            onClick={() => handleDeleteReport(report)}
                            className="w-9 h-9 rounded-full border border-red-200 text-red-500 flex items-center justify-center hover:bg-red-50"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {canEdit && (
                <button
                  onClick={startCreateDashboard}
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-gray-500 hover:border-[#5B4DFF] hover:text-[#5B4DFF] transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-[#5B4DFF]/10 mx-auto flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <p className="mt-4 font-semibold">Criar novo dashboard</p>
                  <p className="text-xs text-gray-400 mt-1">Comece um novo projeto do zero</p>
                </button>
              )}
            </div>
          )}
          </div>
        </main>
      </div>
    );
  }

  if (viewMode === 'settings' && !sharedReportSlug) {
    return (
      <div className="flex h-screen bg-[#F5F6FA] text-slate-800">
        <aside className="w-64 bg-white border-r border-gray-100 flex flex-col">
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#5B4DFF]/10 flex items-center justify-center text-[#5B4DFF]">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">DashBuilder</p>
                <p className="text-xs text-gray-400">Painéis e relatórios</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase">Menu</p>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => pushRoute('/dashboards')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/10"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Dashboards
                </button>
                <button
                  onClick={startCreateDashboard}
                  disabled={!canEdit}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${
                    canEdit
                      ? 'text-gray-600 hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/10'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  Criar dashboard
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/10">
                  <FileText className="w-4 h-4" />
                  Relatórios
                </button>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase">Configurações</p>
              <div className="mt-3 space-y-2">
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium bg-[#5B4DFF]/10 text-[#5B4DFF]">
                  <Settings className="w-4 h-4" />
                  Perfil
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/10">
                  <Users className="w-4 h-4" />
                  Equipe
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-10">
          <UserSettingsView />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[#F3F4F8] overflow-hidden text-slate-800">
      {/* Left Sidebar - Hide in Preview */}
      {!previewMode && (
        <Sidebar
          onAddWidget={(type) => handleAddWidget(type)}
          showMenu
          activeView={viewMode}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          onNavigateView={(next) => {
            if (next === 'list') {
              setViewMode('list');
              pushRoute('/dashboards');
            }
            if (next === 'builder') {
              startCreateDashboard();
            }
            if (next === 'extractor') {
              setViewMode('extractor');
              pushRoute('/extractor');
            }
          }}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* Top Bar */}
        {!previewMode && (
        <header className="h-20 flex items-center justify-between px-8 shrink-0 z-20 bg-[#F3F4F8]">
          <div className="flex items-center gap-6 w-full max-w-2xl">
             {!isSharedView && (
               <button
                 onClick={handleExitBuilder}
                 className="inline-flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded-xl border border-gray-200 shadow-sm hover:border-[#5B4DFF] hover:text-[#5B4DFF] text-sm"
               >
                 ← Voltar
               </button>
             )}
             {/* Search Bar */}
             <div className="relative w-full max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Buscar..." 
                  className="w-full pl-12 pr-4 py-3 bg-white text-gray-900 rounded-2xl border-none shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4DFF]/20"
                />
             </div>
          </div>

          <div className="flex items-center gap-5">
            <button className="relative text-gray-500 hover:text-[#5B4DFF] transition-colors">
               <MessageSquare size={22} />
            </button>
            <button className="relative text-gray-500 hover:text-[#5B4DFF] transition-colors">
               <Bell size={22} />
               <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            
            <div className="h-8 w-px bg-gray-200 mx-2"></div>

            <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-gray-800">{userDisplayName}</div>
                    <div className="text-xs text-gray-500 capitalize">{userDisplayRole}</div>
                </div>
                {user ? (
                  <button
                    onClick={logout}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white text-gray-700 border border-gray-100 shadow-sm hover:bg-gray-50 text-sm"
                  >
                    <LogOut size={16} />
                    Sair
                  </button>
                ) : null}
           </div>
         </div>
       </header>
        )}

        {/* Toolbar / Actions Bar */}
        {!previewMode && (
        <div className="px-8 pb-4 flex items-center justify-between bg-[#F3F4F8]">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
              {isSavingSettings && (
                <p className="text-xs text-gray-500 mt-1">Sincronizando preferências...</p>
              )}
              {isSharedView && (
                <p className="text-xs text-[#5B4DFF] font-semibold mt-1">
                  Link compartilhado: {sharedReportName || sharedReportSlug}
                </p>
              )}
              {!canEdit && (
                <p className="text-xs text-amber-600 mt-1">Modo somente leitura habilitado para seu perfil.</p>
              )}
            </div>
            
            <div className="flex items-center gap-3">
                 <div className="hidden md:flex flex-col text-xs text-gray-500 uppercase font-bold tracking-wide">
                   <span>Conexão Global</span>
                   <select
                     value={dashboardDataSourceId}
                     onChange={(event) => handleDashboardSourceChange(event.target.value)}
                     className="mt-1 text-sm normal-case font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg px-2 py-1 focus:border-[#5B4DFF] outline-none disabled:opacity-50"
                     disabled={dataSources.length === 0 || isSharedView || !canEdit}
                   >
                     {dataSources.length === 0 && <option>Sem fontes</option>}
                     {dataSources.map((source) => (
                       <option key={source.id} value={source.id}>
                         {source.name}
                       </option>
                     ))}
                   </select>
                 </div>

                  <button 
                    onClick={() => canEdit && !isSharedView && setIsDataModalOpen(true)}
                    disabled={!canEdit || isSharedView}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl shadow-sm transition-all text-sm font-medium border border-gray-100 disabled:opacity-50"
                  >
                    <Database size={16} className="text-[#5B4DFF]" />
                    Fontes de Dados
                  </button>
                  <button
                    onClick={() => canEdit && !isSharedView && setIsSchemaModalOpen(true)}
                    disabled={!canEdit || isSharedView || !dashboardDataSourceId}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl shadow-sm transition-all text-sm font-medium border border-gray-100 disabled:opacity-50"
                    title={!dashboardDataSourceId ? 'Selecione uma fonte primeiro' : 'Gerenciar dados'}
                  >
                    <Database size={16} className="text-[#0f766e]" />
                    Gerenciar Dados
                  </button>

                  <button
                    onClick={() => canEdit && setIsDateFilterVisible((prev) => !prev)}
                    disabled={!canEdit}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl shadow-sm transition-all text-sm font-medium border border-gray-100 disabled:opacity-50"
                  >
                    {isDateFilterVisible ? 'Ocultar filtro de data' : 'Mostrar filtro de data'}
                  </button>

                  <button 
                    onClick={() => {
                      if (!canEdit) return;
                      setIsPreview(!isPreview);
                      setSelectedWidgetId(null);
                    }}
                    disabled={!canEdit}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-sm transition-all text-sm font-medium ${
                        isPreview ? 'bg-[#5B4DFF] text-white' : 'bg-white text-gray-700 border border-gray-100'
                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    {isPreview ? <Settings size={16} /> : <Eye size={16} className="text-[#5B4DFF]" />}
                    {isPreview ? 'Modo Edição' : 'Visualizar'}
                  </button>
                  
                  {!previewMode && canEdit && (
                    <>
                      <button
                        onClick={handleShareReport}
                        disabled={!canShareReport}
                        className={`flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl border border-gray-100 shadow-sm transition-all text-sm font-medium ${
                          canShareReport ? 'hover:shadow-md' : 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <Share2 size={16} className="text-[#5B4DFF]" />
                        Compartilhar
                      </button>
                      <button
                        onClick={handleRequestSave}
                        disabled={isSavingReport}
                        className={`flex items-center gap-2 px-4 py-2 bg-[#111827] text-white rounded-xl shadow-md transition-all text-sm font-medium ${
                          isSavingReport ? 'opacity-70 cursor-not-allowed' : 'hover:bg-black'
                        }`}
                      >
                          <Save size={16} />
                          {isSavingReport ? 'Guardando...' : 'Guardar'}
                      </button>
                    </>
                  )}
            </div>
        </div>
        )}

        {isDateFilterVisible && (
          <GlobalDateFilterBar
            presets={presetOptions}
            value={globalFilter}
            onPresetChange={handlePresetChange}
            onCustomDateChange={handleCustomDateChange}
            onClearDimensionFilter={handleClearDimensionFilter}
          />
        )}

        {previewMode && user && (
          <div className="px-8 pb-4 bg-[#F3F4F8] flex justify-end">
            {canEditCurrentReport ? (
              <button
                type="button"
                onClick={() => {
                  setIsPreview(false);
                  setSelectedWidgetId(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5B4DFF] text-white text-sm font-semibold shadow-md hover:bg-[#4b3ae6]"
              >
                Editar dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExitBuilder}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-gray-700 border border-gray-200 text-sm font-medium shadow-sm hover:border-[#5B4DFF] hover:text-[#5B4DFF]"
              >
                ← Voltar
              </button>
            )}
          </div>
        )}

        {/* Canvas */}
        <div 
          className={`flex-1 overflow-y-auto p-8 pt-0 relative ${
            previewMode || isEditMode ? 'overflow-x-hidden' : 'overflow-x-auto'
          }`}
          onClick={() => setSelectedWidgetId(null)}
        >
          <div 
            ref={canvasRef}
            className={`${canvasSettings.fullscreen ? 'mx-0' : 'mx-auto'} rounded-3xl relative transition-all duration-300 ${
               widgets.length === 0 ? 'border-2 border-dashed border-gray-300/50 bg-gray-50/50' : ''
            }`}
            style={canvasStyle}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {widgets.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-gray-400">
                  <div className="mb-2 font-medium text-lg">Canvas Vazio</div>
                  <div className="text-sm">Arraste elementos do menu lateral para começar</div>
                </div>
              </div>
            )}
            
            {widgets.map(widget => (
              <DraggableWidget
                key={widget.id}
                widget={widget}
                isSelected={selectedWidgetId === widget.id}
                isPreview={previewMode}
                onSelect={() => setSelectedWidgetId(widget.id)}
                onUpdate={updateWidget}
              >
                <WidgetRenderer
                  widget={widget}
                  globalFilter={globalFilter}
                  onDimensionFilterChange={handleDimensionFilterChange}
                  shareSlug={activeShareSlug}
                />
              </DraggableWidget>
            ))}
          </div>
        </div>

      </div>

      {/* Right Properties Panel - Hide in Preview */}
      {!previewMode && canEdit && (
        <aside
          className="h-full border-l border-gray-100 bg-white shadow-lg flex flex-col transition-all duration-200"
          style={{ width: isPropertiesCollapsed ? 72 : 320 }}
        >
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
            <span className={`text-sm font-semibold text-gray-700 ${isPropertiesCollapsed ? 'hidden' : ''}`}>
              Propriedades
            </span>
            <button
              type="button"
              onClick={() => setIsPropertiesCollapsed((prev) => !prev)}
              className="px-2 py-1 text-[10px] border border-gray-200 rounded-md text-gray-500 hover:text-[#5B4DFF]"
            >
              {isPropertiesCollapsed ? 'Expandir' : 'Reduzir'}
            </button>
          </div>
          {isPropertiesCollapsed ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400 rotate-90">
              Painel
            </div>
          ) : (
            <PropertiesPanel 
              widget={selectedWidget} 
              dataSources={dataSources}
              dashboardDataSourceId={dashboardDataSourceId}
              onUpdate={updateWidget}
              onDelete={deleteWidget}
              canvasSettings={canvasSettings}
              onCanvasSettingsChange={handleCanvasSettingsChange}
              canvasBaseWidth={LAYOUT_CONFIG[reportLayout].width}
            />
          )}
        </aside>
      )}

      <SaveReportModal
        isOpen={isSaveModalOpen}
        defaultName={pendingSaveValues.name}
        defaultIsPublic={pendingSaveValues.isPublic}
        isSaving={isSavingReport}
        shareUrl={currentShareUrl}
        onCancel={handleCancelSave}
        onConfirm={handleConfirmSave}
      />

      <DataSourcesModal 
        isOpen={viewMode === 'builder' && canEdit && !isSharedView && isDataModalOpen} 
        onClose={() => setIsDataModalOpen(false)}
        dataSources={dataSources}
        onAdd={handleAddDataSource}
        onUpdate={handleUpdateDataSource}
        onRemove={handleRemoveDataSource}
        isLoading={isFetchingDataSources}
      />
      <DataSchemaModal
        isOpen={viewMode === 'builder' && canEdit && !isSharedView && isSchemaModalOpen}
        onClose={() => setIsSchemaModalOpen(false)}
        dataSourceId={dashboardDataSourceId ? String(dashboardDataSourceId) : null}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CalculatedMetricsProvider>
        <DebugProvider>
          <AppContent />
        </DebugProvider>
      </CalculatedMetricsProvider>
    </AuthProvider>
  );
}
