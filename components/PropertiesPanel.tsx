import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Widget, DataSource, CanvasSettings, CustomFont } from '../types';
import { Trash2, Layout, Wand2, Upload, X, Loader2, ChevronDown } from 'lucide-react';
import { generateSqlFromNaturalLanguage } from '../services/geminiService';
import { listTablesForDataSource, listColumnsForDataSourceTable, ColumnPayload } from '../services/dataSourcesService';
import { CARD_ICON_OPTIONS } from './widgets/cardIcons';
import { AdvancedCssEditor } from './AdvancedCssEditor';
import { CalculatedMetricManager } from './CalculatedMetricManager';
import { useCalculatedMetrics } from '../hooks/useCalculatedMetrics';
import { getCalculatedMetricKey, metricMatchesColumns } from '../utils/calculatedMetrics';

const BASE_FONT_OPTIONS = [
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Poppins', value: 'Poppins, sans-serif' },
  { label: 'Roboto', value: 'Roboto, system-ui, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { label: 'Open Sans', value: '"Open Sans", sans-serif' },
  { label: 'Nunito', value: 'Nunito, sans-serif' },
];

type ColorWithAlpha = { hex: string; alpha: number };

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeHex = (hex: string): string => {
  if (!hex) return '#ffffff';
  let value = hex.trim().toLowerCase();
  if (!value.startsWith('#')) {
    value = `#${value}`;
  }
  const shortMatch = value.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    const short = shortMatch[1];
    value = `#${short
      .split('')
      .map((char) => char + char)
      .join('')}`;
  }
  const fullMatch = value.match(/^#([0-9a-f]{6})$/i);
  if (fullMatch) {
    return `#${fullMatch[1]}`.toLowerCase();
  }
  return '#ffffff';
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex);
  const value = normalized.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((channel) => clampNumber(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;

const parseColorWithAlpha = (value?: string): ColorWithAlpha => {
  if (!value) return { hex: '#ffffff', alpha: 1 };
  if (value === 'transparent') {
    return { hex: '#ffffff', alpha: 0 };
  }

  const rgbaMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    const r = parseInt(parts[0] ?? '255', 10);
    const g = parseInt(parts[1] ?? '255', 10);
    const b = parseInt(parts[2] ?? '255', 10);
    const aRaw = parts[3] ? parseFloat(parts[3]) : 1;
    return {
      hex: rgbToHex(r, g, b),
      alpha: clampNumber(Number.isNaN(aRaw) ? 1 : aRaw, 0, 1),
    };
  }

  return { hex: normalizeHex(value), alpha: 1 };
};

const composeColorWithAlpha = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  const safeAlpha = Math.round(clampNumber(alpha, 0, 1) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
};

type FilterState = {
  blur: number;
  brightness: number;
  contrast: number;
  grayscale: number;
  hueRotate: number;
  invert: number;
  opacity: number;
  saturate: number;
  sepia: number;
  dropShadow: string;
};

type StyleSectionKey =
  | 'position'
  | 'background'
  | 'filters'
  | 'radius'
  | 'padding'
  | 'title'
  | 'content';

const FILTER_DEFAULTS: FilterState = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  opacity: 100,
  saturate: 100,
  sepia: 0,
  dropShadow: '',
};

type FilterSliderKey = Exclude<keyof FilterState, 'dropShadow'>;

const FILTER_SLIDER_CONFIG: Array<{
  key: FilterSliderKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit: string;
}> = [
  { key: 'blur', label: 'Desfoque', min: 0, max: 30, step: 0.5, unit: 'px' },
  { key: 'brightness', label: 'Brilho', min: 50, max: 200, unit: '%' },
  { key: 'contrast', label: 'Contraste', min: 50, max: 200, unit: '%' },
  { key: 'grayscale', label: 'Escala de cinza', min: 0, max: 100, unit: '%' },
  { key: 'hueRotate', label: 'Hue rotate', min: 0, max: 360, unit: '°' },
  { key: 'invert', label: 'Inverter cores', min: 0, max: 100, unit: '%' },
  { key: 'opacity', label: 'Opacidade', min: 0, max: 100, unit: '%' },
  { key: 'saturate', label: 'Saturação', min: 50, max: 200, unit: '%' },
  { key: 'sepia', label: 'Sépia', min: 0, max: 100, unit: '%' },
];

const tokenizeFilterString = (value: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of value) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    }

    if (char === ' ' && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    tokens.push(current.trim());
  }
  return tokens;
};

const parsePercentValue = (value: string, fallback: number) => {
  const raw = value.trim();
  const cleaned = raw.replace('%', '');
  let numeric = parseFloat(cleaned);
  if (Number.isNaN(numeric)) return fallback;
  if (!raw.includes('%') && numeric <= 1) {
    numeric *= 100;
  }
  return numeric;
};

const parseFilterString = (value?: string): FilterState => {
  if (!value || value === 'none') {
    return { ...FILTER_DEFAULTS };
  }

  const state: FilterState = { ...FILTER_DEFAULTS };
  const tokens = tokenizeFilterString(value);

  tokens.forEach((token) => {
    const lower = token.toLowerCase();
    const start = token.indexOf('(');
    const end = token.lastIndexOf(')');
    const inner = start >= 0 && end > start ? token.slice(start + 1, end) : '';

    if (lower.startsWith('blur(')) {
      const parsed = parseFloat(inner);
      if (!Number.isNaN(parsed)) state.blur = parsed;
    } else if (lower.startsWith('brightness(')) {
      state.brightness = parsePercentValue(inner, state.brightness);
    } else if (lower.startsWith('contrast(')) {
      state.contrast = parsePercentValue(inner, state.contrast);
    } else if (lower.startsWith('grayscale(')) {
      state.grayscale = parsePercentValue(inner, state.grayscale);
    } else if (lower.startsWith('hue-rotate(')) {
      const parsed = parseFloat(inner.replace('deg', ''));
      if (!Number.isNaN(parsed)) state.hueRotate = parsed;
    } else if (lower.startsWith('invert(')) {
      state.invert = parsePercentValue(inner, state.invert);
    } else if (lower.startsWith('opacity(')) {
      state.opacity = parsePercentValue(inner, state.opacity);
    } else if (lower.startsWith('saturate(')) {
      state.saturate = parsePercentValue(inner, state.saturate);
    } else if (lower.startsWith('sepia(')) {
      state.sepia = parsePercentValue(inner, state.sepia);
    } else if (lower.startsWith('drop-shadow(')) {
      state.dropShadow = inner.trim();
    }
  });

  return state;
};

const buildFilterString = (state: FilterState) => {
  const parts: string[] = [];
  if (state.blur > 0) parts.push(`blur(${state.blur}px)`);
  if (state.brightness !== FILTER_DEFAULTS.brightness) parts.push(`brightness(${state.brightness}%)`);
  if (state.contrast !== FILTER_DEFAULTS.contrast) parts.push(`contrast(${state.contrast}%)`);
  if (state.grayscale > 0) parts.push(`grayscale(${state.grayscale}%)`);
  if (state.hueRotate !== FILTER_DEFAULTS.hueRotate) parts.push(`hue-rotate(${state.hueRotate}deg)`);
  if (state.invert > 0) parts.push(`invert(${state.invert}%)`);
  if (state.opacity !== FILTER_DEFAULTS.opacity) parts.push(`opacity(${state.opacity}%)`);
  if (state.saturate !== FILTER_DEFAULTS.saturate) parts.push(`saturate(${state.saturate}%)`);
  if (state.sepia > 0) parts.push(`sepia(${state.sepia}%)`);
  if (state.dropShadow.trim()) parts.push(`drop-shadow(${state.dropShadow.trim()})`);
  return parts.join(' ');
};

interface PropertiesPanelProps {
  widget: Widget | null;
  dataSources: DataSource[];
  dashboardDataSourceId?: string | null;
  onUpdate: (id: string, updates: Partial<Widget>) => void;
  onDelete: (id: string) => void;
  canvasSettings: CanvasSettings;
  onCanvasSettingsChange: (settings: Partial<CanvasSettings>) => void;
  canvasBaseWidth: number;
}

const NUMERIC_TYPES = ['int', 'decimal', 'double', 'float', 'numeric', 'real', 'bit'];

const isNumericType = (type?: string) => {
  if (!type) return false;
  const normalized = type.toLowerCase();
  return NUMERIC_TYPES.some(token => normalized.includes(token));
};

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  widget,
  dataSources,
  dashboardDataSourceId,
  onUpdate,
  onDelete,
  canvasSettings,
  onCanvasSettingsChange,
  canvasBaseWidth,
}) => {
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [availableColumns, setAvailableColumns] = useState<ColumnPayload[]>([]);
  const { metrics: calculatedMetrics } = useCalculatedMetrics();
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isUploadingFont, setIsUploadingFont] = useState(false);
  const [backgroundHex, setBackgroundHex] = useState('#ffffff');
  const [backgroundAlpha, setBackgroundAlpha] = useState(1);
  const [filterState, setFilterState] = useState<FilterState>({ ...FILTER_DEFAULTS });
  const [openStyleSections, setOpenStyleSections] = useState<Record<StyleSectionKey, boolean>>({
    position: true,
    background: true,
    filters: false,
    radius: false,
    padding: false,
    title: false,
    content: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontUploadInputRef = useRef<HTMLInputElement>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const MAX_TABLE_DIMENSIONS = 3;
  const MAX_TABLE_METRICS = 10;
  const widgetTabs: Array<{ id: 'content' | 'style' | 'data' | 'advanced'; label: string }> = [
    { id: 'content', label: 'Conteúdo' },
    { id: 'style', label: 'Estilo' },
    { id: 'data', label: 'Dados' },
    { id: 'advanced', label: 'Avançado' },
  ];
  const canvasTabs: Array<{ id: 'background' | 'dimensions' | 'fonts'; label: string }> = [
    { id: 'background', label: 'Fundo' },
    { id: 'dimensions', label: 'Dimensões' },
    { id: 'fonts', label: 'Fontes' },
  ];
  const [activeWidgetTab, setActiveWidgetTab] = useState<'content' | 'style' | 'data' | 'advanced'>('content');
  const [activeCanvasTab, setActiveCanvasTab] = useState<'background' | 'dimensions' | 'fonts'>('background');
  const dataDrivenWidgets: Widget['type'][] = [
    'bar_chart',
    'line_chart',
    'radar_chart',
    'gauge',
    'table',
    'filter',
    'counter',
    'card',
    'funnel_chart',
    'funnel',
  ];
  const widgetSupportsData = widget ? dataDrivenWidgets.includes(widget.type) : false;
  const visibleWidgetTabs = widgetSupportsData
    ? widgetTabs
    : widgetTabs.filter((tab) => tab.id !== 'data');
  const [cssValidationMessage, setCssValidationMessage] = useState<string | null>(null);
  useEffect(() => {
    setCssValidationMessage(null);
  }, [widget?.id]);

  const toggleStyleSection = useCallback((key: StyleSectionKey) => {
    setOpenStyleSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const renderStyleSection = useCallback(
    (key: StyleSectionKey, title: string, children: React.ReactNode) => {
      const isOpen = openStyleSections[key];
      return (
        <div className="border border-gray-200 rounded-xl bg-white/90 shadow-sm">
          <button
            type="button"
            onClick={() => toggleStyleSection(key)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              {title}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {isOpen && <div className="px-4 pb-4">{children}</div>}
        </div>
      );
    },
    [openStyleSections, toggleStyleSection],
  );

  const toggleTableSelection = (
    key: 'tableDimensions' | 'tableMetrics',
    column: string,
    limit: number
  ) => {
    if (!widget) return;
    const current: string[] = widget.dataConfig?.[key] ?? [];
    const exists = current.includes(column);
    let next = current;
    if (exists) {
      next = current.filter((item) => item !== column);
    } else if (current.length < limit) {
      next = [...current, column];
    }
    if (next !== current) {
      handleDataChange(key, next);
    }
  };

  // Effect to load Tables when Source changes
  const activeSourceId = widget?.dataConfig?.sourceId || dashboardDataSourceId || '';
  const normalizedSourceId = activeSourceId ? String(activeSourceId) : '';
  const activeSource = dataSources.find((ds) => String(ds.id) === normalizedSourceId);

  useEffect(() => {
    if (!activeSourceId) {
      setAvailableTables([]);
      return;
    }

    if (activeSourceId) {
      setIsLoadingTables(true);
      setSchemaError(null);
      listTablesForDataSource(activeSourceId)
        .then((tables) => setAvailableTables(tables))
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Erro ao carregar tabelas.';
          setSchemaError(message);
          setAvailableTables([]);
        })
        .finally(() => setIsLoadingTables(false));
    }
  }, [activeSourceId]);

  // Effect to load Columns when Table changes
  useEffect(() => {
    if (!activeSourceId || !widget?.dataConfig?.tableName) {
      setAvailableColumns([]);
      return;
    }

    if (activeSourceId) {
      setIsLoadingColumns(true);
      setSchemaError(null);
      listColumnsForDataSourceTable(activeSourceId, widget.dataConfig.tableName)
        .then((columns) => setAvailableColumns(columns))
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Erro ao carregar colunas.';
          setSchemaError(message);
          setAvailableColumns([]);
        })
        .finally(() => setIsLoadingColumns(false));
    }
  }, [widget?.dataConfig?.tableName, activeSourceId]);
  const metricColumns = useMemo(() => {
    const classified = availableColumns.filter((col) => col.role === 'metric');
    if (classified.length > 0) return classified;
    const numeric = availableColumns.filter(col => isNumericType(col.type));
    return numeric.length > 0 ? numeric : availableColumns;
  }, [availableColumns]);

  const dimensionColumns = useMemo(() => {
    const classified = availableColumns.filter((col) => col.role === 'dimension');
    if (classified.length > 0) return classified;
    const nonNumeric = availableColumns.filter(col => !isNumericType(col.type));
    return nonNumeric.length > 0 ? nonNumeric : availableColumns;
  }, [availableColumns]);

  const applicableCalculatedMetrics = useMemo(
    () => calculatedMetrics.filter((metric) => metricMatchesColumns(metric, availableColumns)),
    [calculatedMetrics, availableColumns]
  );

  const buildCalculatedOptions = useCallback(
    (currentValue?: string | null) => {
      const options = [...applicableCalculatedMetrics];
      const selectedKey = getCalculatedMetricKey(currentValue ?? '');
      if (selectedKey) {
        const selectedMetric = calculatedMetrics.find((metric) => metric.key === selectedKey);
        if (selectedMetric && !options.some((metric) => metric.key === selectedMetric.key)) {
          options.push(selectedMetric);
        }
      }
      return options;
    },
    [applicableCalculatedMetrics, calculatedMetrics]
  );

  const primaryMetricValue = widget?.dataConfig?.metricX || widget?.dataConfig?.metric || '';
  const secondaryMetricValue = widget?.dataConfig?.metricY || '';

  const metricXCalculatedOptions = useMemo(
    () => buildCalculatedOptions(primaryMetricValue),
    [buildCalculatedOptions, primaryMetricValue]
  );
  const metricYCalculatedOptions = useMemo(
    () => buildCalculatedOptions(secondaryMetricValue),
    [buildCalculatedOptions, secondaryMetricValue]
  );

  const applyDataConfigPatch = useCallback(
    (patch: Partial<WidgetDataConfig>) => {
      if (!widget) return;
      const nextConfig: WidgetDataConfig = {
        ...widget.dataConfig,
        ...patch,
      };
      if (patch.metricX !== undefined) {
        nextConfig.metric = patch.metricX;
      }
      onUpdate(widget.id, { dataConfig: nextConfig });
    },
    [widget, onUpdate]
  );

  const handleDataChange = useCallback(
    (key: string, value: any) => {
      applyDataConfigPatch({ [key]: value } as Partial<WidgetDataConfig>);
    },
    [applyDataConfigPatch]
  );

  const updateFunnelSteps = useCallback(
    (steps: Array<{ label: string; metric: string }>) => {
      handleDataChange('funnelSteps', steps);
    },
    [handleDataChange]
  );

  const handleFunnelStepChange = useCallback(
    (index: number, patch: Partial<{ label: string; metric: string }>) => {
      if (!widget) return;
      const current =
        widget.dataConfig?.funnelSteps && widget.dataConfig.funnelSteps.length > 0
          ? widget.dataConfig.funnelSteps
          : [
              { label: 'Etapa 1', metric: '' },
              { label: 'Etapa 2', metric: '' },
              { label: 'Etapa 3', metric: '' },
            ];
      const next = current.map((step, idx) => (idx === index ? { ...step, ...patch } : step));
      updateFunnelSteps(next);
    },
    [updateFunnelSteps, widget]
  );

  const handleMetricFieldChange = useCallback(
    (field: 'metric' | 'metricX' | 'metricY', value: string) => {
      const patch: Partial<WidgetDataConfig> = {
        [field]: value,
      };

      if (
        (widget?.type === 'card' || widget?.type === 'counter' || widget?.type === 'gauge') &&
        field === 'metricX'
      ) {
        patch.metric = value;
      }

      const metricKey = getCalculatedMetricKey(value);
      if (metricKey) {
        const definition = calculatedMetrics.find((metric) => metric.key === metricKey);
        if (!definition) return;

        patch.calculatedMetricOverrides = {
          ...(widget?.dataConfig?.calculatedMetricOverrides ?? {}),
          [definition.key]: definition,
        };
        if (field === 'metric' || field === 'metricX') {
          patch.valueFormat = definition.outputFormat;
        }
      }
      applyDataConfigPatch(patch);
    },
    [applyDataConfigPatch, calculatedMetrics, widget?.dataConfig?.calculatedMetricOverrides, widget?.type]
  );

  useEffect(() => {
    if (!isIconPickerOpen) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(event.target as Node)) {
        setIsIconPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isIconPickerOpen]);

  useEffect(() => {
    if (widget) {
      setActiveWidgetTab('content');
    }
  }, [widget?.id]);

  useEffect(() => {
    if (!widget) {
      setActiveCanvasTab('background');
    }
  }, [widget]);

  useEffect(() => {
    if (!widget) return;
    const { hex, alpha } = parseColorWithAlpha(widget.style.backgroundColor);
    setBackgroundHex(hex);
    setBackgroundAlpha(alpha);
  }, [widget?.id, widget?.style.backgroundColor]);

  useEffect(() => {
    if (!widget) return;
    setFilterState(parseFilterString(widget.style.filter));
  }, [widget?.id, widget?.style.filter]);

  const rgbaPreview = useMemo(() => composeColorWithAlpha(backgroundHex, backgroundAlpha), [backgroundHex, backgroundAlpha]);
  const filterPreview = useMemo(() => buildFilterString(filterState), [filterState]);

  const backgroundOptions: Array<{ value: CanvasSettings['backgroundType']; label: string }> = [
    { value: 'color', label: 'Cor sólida' },
    { value: 'gradient', label: 'Gradiente' },
    { value: 'image', label: 'Imagem' },
  ];
  const inputClasses =
    'w-full px-3 py-2 text-sm bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-[#5B4DFF] outline-none transition-colors';
  const alignmentOptions: Array<{ label: string; value: 'left' | 'center' | 'right' }> = [
    { label: 'Esq', value: 'left' },
    { label: 'Centro', value: 'center' },
    { label: 'Dir', value: 'right' },
  ];
  const MIN_CANVAS_WIDTH = 360;
  const MAX_CANVAS_WIDTH = 1920;
  const MIN_CANVAS_HEIGHT = 400;
  const MAX_CANVAS_HEIGHT = 2400;
  const allowedFontExtensions = ['.ttf', '.otf', '.woff', '.woff2'];

  const customFontOptions = useMemo(() => {
    return (canvasSettings.customFonts ?? []).map((font) => {
      const safeName = font.name.replace(/'/g, "\\'");
      return {
        label: font.name,
        value: `'${safeName}', sans-serif`,
      };
    });
  }, [canvasSettings.customFonts]);

  const combinedFontOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...BASE_FONT_OPTIONS, ...customFontOptions].filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
  }, [customFontOptions]);

  if (!widget) {
    const gradientFrom = canvasSettings.gradientFrom ?? '#5B4DFF';
    const gradientTo = canvasSettings.gradientTo ?? '#9333EA';
    const gradientAngle = canvasSettings.gradientAngle ?? 135;
    const bgColor = canvasSettings.backgroundColor ?? '#F3F4F8';
    const imageUrl = canvasSettings.imageUrl ?? '';
    const imageFit = canvasSettings.imageFit ?? 'cover';
    const canvasWidthValue = canvasSettings.width ?? canvasBaseWidth;
    const canvasHeightValue = canvasSettings.height ?? 900;
    const isFullscreen = Boolean(canvasSettings.fullscreen);
    const customFonts = canvasSettings.customFonts ?? [];

    const handleCanvasColorChange = (value: string) => {
      onCanvasSettingsChange({ backgroundColor: value, backgroundType: 'color' });
    };

    const handleCanvasDimensionChange = (key: 'width' | 'height', raw: string) => {
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed)) {
        onCanvasSettingsChange({ [key]: undefined } as Partial<CanvasSettings>);
        return;
      }
      const limited = key === 'width'
        ? clampNumber(parsed, MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH)
        : clampNumber(parsed, MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT);
      onCanvasSettingsChange({ [key]: limited } as Partial<CanvasSettings>);
    };

    const resetCanvasWidth = () => onCanvasSettingsChange({ width: undefined });
    const resetCanvasHeight = () => onCanvasSettingsChange({ height: undefined });
    const handleCanvasHeightSlider = (value: number) => {
      const limited = clampNumber(value, MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT);
      onCanvasSettingsChange({ height: limited });
    };

    const readFileAsDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Dados inválidos.'));
          }
        };
        reader.readAsDataURL(file);
      });

    const detectFontFormat = (file: File): CustomFont['format'] => {
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext === 'woff2') return 'woff2';
      if (ext === 'woff') return 'woff';
      if (ext === 'otf') return 'opentype';
      if (ext === 'ttf') return 'truetype';
      if (file.type.includes('woff2')) return 'woff2';
      if (file.type.includes('woff')) return 'woff';
      if (file.type.includes('opentype')) return 'opentype';
      return 'truetype';
    };

    const handleFontFilesSelection = async (files: FileList | null) => {
      if (!files?.length) return;
      const allowed = Array.from(files).filter((file) =>
        allowedFontExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
      );
      if (allowed.length === 0) {
        alert('Formato não suportado. Use arquivos .ttf, .otf, .woff ou .woff2.');
        return;
      }

      setIsUploadingFont(true);
      try {
        const newFonts = await Promise.all(
          allowed.map(async (file) => {
            const dataUrl = await readFileAsDataUrl(file);
            const baseName = file.name.replace(/\.[^.]+$/, '') || 'Fonte personalizada';
            return {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: baseName,
              dataUrl,
              format: detectFontFormat(file),
            } satisfies CustomFont;
          })
        );
        onCanvasSettingsChange({ customFonts: [...customFonts, ...newFonts] });
      } catch (error) {
        console.error('Erro ao carregar fonte personalizada', error);
        alert('Não foi possível carregar a fonte selecionada. Tente novamente.');
      } finally {
        setIsUploadingFont(false);
      }
    };

    const handleFontInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFontFilesSelection(event.target.files);
      event.target.value = '';
    };

    const handleRemoveCustomFont = (id: string) => {
      onCanvasSettingsChange({ customFonts: customFonts.filter((font) => font.id !== id) });
    };

    const handleRenameCustomFont = (id: string, name: string) => {
      onCanvasSettingsChange({
        customFonts: customFonts.map((font) => (font.id === id ? { ...font, name } : font)),
      });
    };

    const handleAddFontClick = () => {
      if (isUploadingFont) return;
      fontUploadInputRef.current?.click();
    };

    return (
      <div className="w-80 bg-white h-full flex flex-col border-l border-gray-100 shadow-lg z-20">
        <div className="h-20 flex items-center px-6 border-b border-gray-100 justify-between bg-white">
          <div>
            <h2 className="font-bold text-lg text-gray-800">Canvas</h2>
            <p className="text-xs text-gray-500">Plano de fundo do dashboard</p>
          </div>
        </div>
        <div className="px-6 border-b border-gray-100">
          <div className="flex gap-2 py-3 overflow-x-auto">
            {canvasTabs.map((tab) => {
              const isActive = activeCanvasTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCanvasTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-[#5B4DFF] bg-[#5B4DFF]/10 text-[#5B4DFF]'
                      : 'border-transparent text-gray-500 hover:text-[#5B4DFF]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {activeCanvasTab === 'background' && (
            <>
              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Tipo de fundo</h3>
                <div className="grid grid-cols-3 gap-2">
                  {backgroundOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        onCanvasSettingsChange({
                          backgroundType: option.value,
                          ...(option.value === 'color' ? { backgroundColor: bgColor } : {}),
                          ...(option.value === 'gradient' ? { gradientFrom, gradientTo, gradientAngle } : {}),
                        })
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        canvasSettings.backgroundType === option.value
                          ? 'border-[#5B4DFF] bg-[#5B4DFF]/10 text-[#5B4DFF]'
                          : 'border-gray-200 text-gray-600 hover:border-[#5B4DFF]/40'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              {canvasSettings.backgroundType === 'color' && (
                <section className="space-y-3">
                  <label className="block text-xs font-medium text-gray-600">Cor de fundo</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => handleCanvasColorChange(e.target.value)}
                      className="w-12 h-12 rounded-lg border border-gray-200"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={(e) => handleCanvasColorChange(e.target.value)}
                      className={inputClasses}
                    />
                  </div>
                </section>
              )}

              {canvasSettings.backgroundType === 'gradient' && (
                <section className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Cor inicial</label>
                      <input
                        type="color"
                        value={gradientFrom}
                        onChange={(e) =>
                          onCanvasSettingsChange({ gradientFrom: e.target.value || '#5B4DFF' })
                        }
                        className="w-full h-12 rounded-lg border border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Cor final</label>
                      <input
                        type="color"
                        value={gradientTo}
                        onChange={(e) =>
                          onCanvasSettingsChange({ gradientTo: e.target.value || '#9333EA' })
                        }
                        className="w-full h-12 rounded-lg border border-gray-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Ângulo ({gradientAngle}°)</label>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={gradientAngle}
                      onChange={(e) => onCanvasSettingsChange({ gradientAngle: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </section>
              )}

              {canvasSettings.backgroundType === 'image' && (
                <section className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">URL da imagem</label>
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => onCanvasSettingsChange({ imageUrl: e.target.value })}
                      placeholder="https://..."
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Ajuste</label>
                    <select
                      value={imageFit}
                      onChange={(e) => onCanvasSettingsChange({ imageFit: e.target.value as CanvasSettings['imageFit'] })}
                      className={inputClasses}
                    >
                      <option value="cover">Preencher (cover)</option>
                      <option value="contain">Conter (contain)</option>
                      <option value="auto">Original</option>
                      <option value="repeat">Repetir</option>
                    </select>
                  </div>
                </section>
              )}

              <p className="text-[11px] text-gray-400">
                Dica: deixe o canvas com uma cor neutra para destacar os cards ou use um gradiente inspirado na paleta da marca.
              </p>
            </>
          )}

          {activeCanvasTab === 'fonts' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Fontes personalizadas</h3>
                <button
                  type="button"
                  onClick={handleAddFontClick}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#5B4DFF] hover:text-[#5B4DFF]"
                >
                  {isUploadingFont ? 'Carregando...' : 'Adicionar'}
                </button>
              </div>
              <input
                ref={fontUploadInputRef}
                type="file"
                accept={allowedFontExtensions.join(',')}
                multiple
                className="hidden"
                onChange={handleFontInputChange}
              />
              {customFonts.length === 0 ? (
                <p className="text-xs text-gray-500">Faça upload de arquivos .otf, .ttf, .woff ou .woff2 para habilitar fontes.</p>
              ) : (
                <div className="space-y-3">
                  {customFonts.map((font) => (
                    <div key={font.id} className="border border-gray-200 rounded-xl p-3 bg-white/60 shadow-sm">
                      <div className="flex items-center gap-2">
                        <input type="text" value={font.name} onChange={(e) => handleRenameCustomFont(font.id, e.target.value)} className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-[#5B4DFF]" />
                        <button type="button" onClick={() => handleRemoveCustomFont(font.id)} className="p-1.5 rounded-md border border-transparent text-gray-400 hover:text-red-500 hover:border-red-200" aria-label={`Remover fonte ${font.name}`}><Trash2 size={14} /></button>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">Formato: {font.format}</p>
                      <p className="text-sm text-gray-700 mt-2" style={{ fontFamily: `'${font.name}', sans-serif` }}>Exemplo rápido de texto</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeCanvasTab === 'dimensions' && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dimensões do canvas</h3>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={isFullscreen}
                  onChange={(e) => onCanvasSettingsChange({ fullscreen: e.target.checked })}
                  className="rounded border-gray-300 text-[#5B4DFF] focus:ring-[#5B4DFF]"
                />
                Full screen (usar altura total da janela)
              </label>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Largura (px)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={MIN_CANVAS_WIDTH}
                    max={MAX_CANVAS_WIDTH}
                    value={canvasSettings.width ?? canvasWidthValue}
                    onChange={(e) => handleCanvasDimensionChange('width', e.target.value)}
                    className={inputClasses}
                  />
                  <button
                    type="button"
                    onClick={resetCanvasWidth}
                    className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:border-[#5B4DFF]"
                  >
                    Padrão ({canvasBaseWidth}px)
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Altura mínima ({canvasHeightValue}px)</label>
                <input
                  type="range"
                  min={MIN_CANVAS_HEIGHT}
                  max={MAX_CANVAS_HEIGHT}
                  value={canvasHeightValue}
                  onChange={(e) => handleCanvasHeightSlider(Number(e.target.value))}
                  className="w-full accent-[#5B4DFF]"
                  disabled={isFullscreen}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={MIN_CANVAS_HEIGHT}
                    max={MAX_CANVAS_HEIGHT}
                    value={canvasHeightValue}
                    onChange={(e) => handleCanvasDimensionChange('height', e.target.value)}
                    className={inputClasses}
                    disabled={isFullscreen}
                  />
                  <button
                    type="button"
                    onClick={resetCanvasHeight}
                    className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:border-[#5B4DFF]"
                    disabled={isFullscreen}
                  >
                    Resetar
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  const titleAlignValue = widget.style.titleAlign ?? 'left';
  const contentAlignValue = widget.style.contentTextAlign ?? widget.style.textAlign ?? 'left';
  const cardIconValue = widget.dataConfig?.cardIcon || 'bag';
  const selectedCardIcon = CARD_ICON_OPTIONS.find((option) => option.value === cardIconValue) || CARD_ICON_OPTIONS[0];

  const handleStyleChange = (key: string, value: any) => {
    onUpdate(widget.id, {
      style: { ...widget.style, [key]: value }
    });
  };

  const applyBackgroundColor = (hex: string, alpha: number) => {
    const formattedHex = normalizeHex(hex);
    const safeAlpha = clampNumber(alpha, 0, 1);
    setBackgroundHex(formattedHex);
    setBackgroundAlpha(safeAlpha);
    handleStyleChange('backgroundColor', composeColorWithAlpha(formattedHex, safeAlpha));
  };

  const handleColorPickerChange = (value: string) => {
    applyBackgroundColor(value, backgroundAlpha);
  };

  const handleAlphaChange = (percentage: number) => {
    applyBackgroundColor(backgroundHex, percentage / 100);
  };

  const handleResetBackground = () => applyBackgroundColor('#ffffff', 1);

  const updateFilterState = (producer: (prev: FilterState) => FilterState) => {
    setFilterState((prev) => {
      const next = producer(prev);
      const serialized = buildFilterString(next);
      handleStyleChange('filter', serialized || undefined);
      return next;
    });
  };

  const handleFilterSliderChange = (key: FilterSliderKey, value: number) => {
    updateFilterState((prev) => ({ ...prev, [key]: value }));
  };

  const handleDropShadowChange = (value: string) => {
    updateFilterState((prev) => ({ ...prev, dropShadow: value }));
  };

  const handleResetFilters = () => updateFilterState(() => ({ ...FILTER_DEFAULTS }));

  const handleTableChange = (value: string) => {
    applyDataConfigPatch({
      sourceId: activeSourceId,
      tableName: value,
      dimension: '',
      metric: '',
      metricX: '',
      metricY: '',
      calculatedMetricOverrides: undefined,
    });
  };

  const handleAiSqlGen = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    // If table is selected, give context to AI
    const columnList = availableColumns.map((col) => col.name).join(', ');
    const tableContext = widget.dataConfig?.tableName 
        ? `Context: Table '${widget.dataConfig.tableName}' with columns ${columnList}` 
        : '';
    
    const schema = `Table Schema: ${tableContext || "generic analytics table"}`;
    const sql = await generateSqlFromNaturalLanguage(aiPrompt, schema);
    alert(`AI Generated SQL:\n${sql}`);
    setIsGenerating(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onUpdate(widget.id, { content: event.target.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };


  return (
    <div className="w-80 bg-white border-l border-gray-100 h-full flex flex-col shadow-lg z-40">
      <div className="h-20 flex items-center px-6 border-b border-gray-100 justify-between bg-white">
        <div>
            <h2 className="font-bold text-lg text-gray-800">Propriedades</h2>
            <p className="text-xs text-gray-500 capitalize">{widget.type.replace('_', ' ')} Widget</p>
        </div>
        <button onClick={() => onUpdate(widget.id, {})} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
        </button>
      </div>

      <div className="px-6 border-b border-gray-100">
        <div className="flex gap-2 py-3 overflow-x-auto">
          {visibleWidgetTabs.map((tab) => {
            const isActive = activeWidgetTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveWidgetTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-[#5B4DFF] bg-[#5B4DFF]/10 text-[#5B4DFF]'
                    : 'border-transparent text-gray-500 hover:text-[#5B4DFF]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {activeWidgetTab === 'content' && (
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-wider flex items-center gap-2">
            Conteúdo
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Título</label>
              <input 
                type="text" 
                value={widget.title || ''} 
                onChange={(e) => onUpdate(widget.id, { title: e.target.value })}
                className={inputClasses}
              />
            </div>
            
            {widget.type === 'text' && (
              <div>
                 <label className="block text-xs font-medium text-gray-600 mb-1.5">Texto</label>
                 <textarea 
                    value={widget.content || ''} 
                    onChange={(e) => onUpdate(widget.id, { content: e.target.value })}
                    className={`${inputClasses} h-24 resize-none`}
                 />
              </div>
            )}

            {widget.type === 'card' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Texto do Card</label>
                  <input
                    type="text"
                    value={widget.dataConfig?.cardLabel || ''}
                    onChange={(e) => handleDataChange('cardLabel', e.target.value)}
                    className={inputClasses}
                  />
                </div>
                <div className="col-span-2 relative" ref={iconPickerRef}>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Ícone</label>
                  <button
                    type="button"
                    onClick={() => setIsIconPickerOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-[#5B4DFF] outline-none transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <img src={selectedCardIcon.src} alt={selectedCardIcon.label} className="w-5 h-5" />
                      {selectedCardIcon.label}
                    </span>
                    <ChevronDown size={16} className="text-gray-400" />
                  </button>
                  {isIconPickerOpen && (
                    <div className="mt-2 p-3 border border-gray-200 rounded-xl shadow-lg bg-white absolute z-30 w-full max-h-64 overflow-y-auto grid grid-cols-4 gap-3">
                      {CARD_ICON_OPTIONS.map((option) => {
                        const isActive = option.value === cardIconValue;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              handleDataChange('cardIcon', option.value);
                              setIsIconPickerOpen(false);
                            }}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors ${
                              isActive ? 'border-[#5B4DFF] bg-[#5B4DFF]/5 text-[#5B4DFF]' : 'border-gray-200 hover:border-[#5B4DFF]/50'
                            }`}
                          >
                            <img src={option.src} alt={option.label} className="w-6 h-6" />
                            <span className="text-[10px] text-center leading-tight">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {['card', 'counter'].includes(widget.type) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Formatação</label>
                  <select
                    value={widget.dataConfig?.valueFormat || 'number'}
                    onChange={(e) => handleDataChange('valueFormat', e.target.value)}
                    className={inputClasses}
                  >
                    <option value="number">Número inteiro</option>
                    <option value="decimal">Decimal</option>
                    <option value="currency">Moeda</option>
                    <option value="percent">Percentual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Casas decimais</label>
                  <input
                    type="number"
                    min="0"
                    max="6"
                    value={widget.dataConfig?.decimalPlaces ?? (widget.dataConfig?.valueFormat === 'number' ? 0 : 2)}
                    onChange={(e) => handleDataChange('decimalPlaces', Number(e.target.value))}
                    className={inputClasses}
                  />
                </div>
                {widget.dataConfig?.valueFormat === 'currency' && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Símbolo da moeda</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={widget.dataConfig?.currencySymbol || 'R$'}
                      onChange={(e) => handleDataChange('currencySymbol', e.target.value)}
                      className={inputClasses}
                    />
                  </div>
                )}
              </div>
            )}

            {widget.type === 'image' && (
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                <label className="block text-xs font-bold text-gray-700 mb-3">Origem da Imagem</label>
                
                <div className="space-y-4">
                  <div>
                    <input 
                      type="text" 
                      placeholder="https://example.com/image.png"
                      value={widget.content?.startsWith('data:') ? '' : widget.content || ''}
                      onChange={(e) => onUpdate(widget.id, { content: e.target.value })}
                      className={inputClasses}
                    />
                  </div>

                  <div className="text-center">
                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 relative z-10">OU</span>
                    <div className="h-px bg-gray-200 -mt-2"></div>
                  </div>

                  <div>
                    <input 
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2.5 text-xs font-medium border-2 border-dashed border-gray-300 rounded-lg hover:border-[#5B4DFF] hover:text-[#5B4DFF] hover:bg-[#5B4DFF]/5 text-gray-500 transition-all flex items-center justify-center gap-2"
                    >
                      <Upload size={14} />
                      Upload Imagem
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        )}

        {activeWidgetTab === 'style' && (
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-wider flex items-center gap-2">
             Estilo
          </h3>
          <div className="space-y-4">
            {renderStyleSection(
              'position',
              'Posição e tamanho',
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">X</label>
                  <input
                    type="number"
                    value={Math.round(widget.style.x)}
                    onChange={(e) => handleStyleChange('x', parseInt(e.target.value))}
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Y</label>
                  <input
                    type="number"
                    value={Math.round(widget.style.y)}
                    onChange={(e) => handleStyleChange('y', parseInt(e.target.value))}
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">L (Largura)</label>
                  <input
                    type="number"
                    value={Math.round(widget.style.width)}
                    onChange={(e) => handleStyleChange('width', parseInt(e.target.value))}
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">A (Altura)</label>
                  <input
                    type="number"
                    value={Math.round(widget.style.height)}
                    onChange={(e) => handleStyleChange('height', parseInt(e.target.value))}
                    className={inputClasses}
                  />
                </div>
              </div>,
            )}

            {renderStyleSection(
              'background',
              'Cor de fundo',
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={backgroundHex}
                    onChange={(e) => handleColorPickerChange(e.target.value)}
                    className="h-8 w-8 rounded cursor-pointer border border-gray-200"
                  />
                  <div className="text-[11px] text-gray-500 font-mono bg-gray-100/80 rounded px-2 py-1">
                    {rgbaPreview}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 font-semibold uppercase">
                    <span>Transparência</span>
                    <span>{Math.round(backgroundAlpha * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(backgroundAlpha * 100)}
                    onChange={(e) => handleAlphaChange(parseInt(e.target.value, 10))}
                    className="w-full mt-1 accent-[#5B4DFF]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyBackgroundColor(backgroundHex, 0)}
                    className="flex-1 px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:border-[#5B4DFF] hover:text-[#5B4DFF] transition-colors"
                  >
                    Transparente
                  </button>
                  <button
                    type="button"
                    onClick={handleResetBackground}
                    className="flex-1 px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:border-[#5B4DFF] hover:text-[#5B4DFF] transition-colors"
                  >
                    Resetar
                  </button>
                </div>
              </div>,
            )}

            {renderStyleSection(
              'filters',
              'Filtros CSS',
              <div className="space-y-3">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] font-semibold text-[#5B4DFF] hover:underline"
                  >
                    Limpar
                  </button>
                </div>
                {FILTER_SLIDER_CONFIG.map(({ key, label, min, max, step = 1, unit }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium">
                      <span>{label}</span>
                      <span className="text-gray-400">
                        {filterState[key]}
                        {unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={filterState[key]}
                      onChange={(e) => handleFilterSliderChange(key, parseFloat(e.target.value))}
                      className="w-full mt-1 accent-[#5B4DFF]"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Drop Shadow</label>
                  <input
                    type="text"
                    value={filterState.dropShadow}
                    onChange={(e) => handleDropShadowChange(e.target.value)}
                    placeholder="ex: 0px 12px 30px rgba(0,0,0,0.12)"
                    className={inputClasses}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Aceita o mesmo formato da propriedade CSS drop-shadow().
                  </p>
                </div>
                <div className="text-[11px] text-gray-500 font-mono bg-gray-50 rounded-lg px-2 py-1 break-all">
                  {filterPreview || 'none'}
                </div>
              </div>,
            )}

            {renderStyleSection(
              'radius',
              'Arredondamento',
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={widget.style.borderRadius || 0}
                  onChange={(e) => handleStyleChange('borderRadius', parseInt(e.target.value))}
                  className="flex-1 accent-[#5B4DFF]"
                />
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={widget.style.borderRadius || 0}
                  onChange={(e) => handleStyleChange('borderRadius', parseInt(e.target.value))}
                  className="w-16 px-2 py-2 text-sm bg-white text-gray-900 border border-gray-200 rounded-lg text-center focus:border-[#5B4DFF] outline-none"
                />
              </div>,
            )}

            {renderStyleSection(
              'padding',
              'Espaçamento',
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Padding do Card</label>
                  <input
                    type="number"
                    min="0"
                    value={widget.style.padding ?? 16}
                    onChange={(e) => handleStyleChange('padding', parseInt(e.target.value))}
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Padding do Conteúdo</label>
                  <input
                    type="number"
                    min="0"
                    value={widget.style.contentPadding ?? widget.style.padding ?? 16}
                    onChange={(e) => handleStyleChange('contentPadding', parseInt(e.target.value))}
                    className={inputClasses}
                  />
                </div>
              </div>,
            )}

            {renderStyleSection(
              'title',
              'Estilo do título',
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Fonte</label>
                  <select
                    value={widget.style.titleFontFamily || ''}
                    onChange={(e) => handleStyleChange('titleFontFamily', e.target.value)}
                    className={inputClasses}
                  >
                    <option value="">Padrão (Inter)</option>
                    {combinedFontOptions.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Cor</label>
                    <input
                      type="color"
                      value={widget.style.titleColor ?? '#0f172a'}
                      onChange={(e) => handleStyleChange('titleColor', e.target.value)}
                      className="h-8 w-full rounded cursor-pointer border border-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Tamanho (px)</label>
                    <input
                      type="number"
                      min="10"
                      max="64"
                      value={widget.style.titleFontSize ?? 16}
                      onChange={(e) => handleStyleChange('titleFontSize', parseInt(e.target.value))}
                      className={inputClasses}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Margem inferior</label>
                    <input
                      type="number"
                      min="0"
                      value={widget.style.titleMarginBottom ?? 4}
                      onChange={(e) => handleStyleChange('titleMarginBottom', parseInt(e.target.value))}
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Alinhamento</label>
                    <div className="flex gap-2">
                      {alignmentOptions.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => handleStyleChange('titleAlign', option.value)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                            titleAlignValue === option.value
                              ? 'border-[#5B4DFF] text-[#5B4DFF] bg-[#5B4DFF]/10'
                              : 'border-gray-200 text-gray-500 bg-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>,
            )}

            {renderStyleSection(
              'content',
              'Estilo do conteúdo',
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Fonte</label>
                  <select
                    value={widget.style.contentFontFamily || widget.style.fontFamily || ''}
                    onChange={(e) => handleStyleChange('contentFontFamily', e.target.value)}
                    className={inputClasses}
                  >
                    <option value="">Padrão (Inter)</option>
                    {combinedFontOptions.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Cor do texto</label>
                    <input
                      type="color"
                      value={widget.style.contentColor ?? widget.style.color ?? '#0f172a'}
                      onChange={(e) => handleStyleChange('contentColor', e.target.value)}
                      className="h-8 w-full rounded cursor-pointer border border-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Tamanho (px)</label>
                    <input
                      type="number"
                      min="10"
                      max="48"
                      value={widget.style.contentFontSize ?? widget.style.fontSize ?? 13}
                      onChange={(e) => handleStyleChange('contentFontSize', parseInt(e.target.value))}
                      className={inputClasses}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Alinhamento</label>
                  <div className="flex gap-2">
                    {alignmentOptions.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => handleStyleChange('contentTextAlign', option.value)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          contentAlignValue === option.value
                            ? 'border-[#5B4DFF] text-[#5B4DFF] bg-[#5B4DFF]/10'
                            : 'border-gray-200 text-gray-500 bg-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>,
            )}
          </div>
        </section>
        )}

        {activeWidgetTab === 'data' && widgetSupportsData && (
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-wider flex items-center gap-2">
              Dados
            </h3>
            
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-600">
                {activeSource ? (
                  <div>
                    <p className="font-semibold text-gray-800">Conexão Global</p>
                    <p>{activeSource.name} ({activeSource.type.replace('_', ' ')})</p>
                    <p className="text-[10px] text-gray-500 mt-1">Defina a conexão no topo do dashboard.</p>
                  </div>
                ) : (
                  <p className="text-red-500 text-xs">Nenhuma conexão global definida. Configure uma fonte para o dashboard.</p>
                )}
              </div>

              {/* 2. Select Table (Dynamic) */}
              {activeSourceId && (
                <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5 flex justify-between">
                        Tabela Oficial
                        {(isLoadingTables || isLoadingColumns) && <Loader2 size={12} className="animate-spin text-[#5B4DFF]"/>}
                    </label>
                    <select 
                        value={widget.dataConfig?.tableName || ''} 
                        onChange={(e) => handleTableChange(e.target.value)}
                        className={inputClasses}
                        disabled={isLoadingTables || availableTables.length === 0}
                    >
                        <option value="">Selecionar Tabela...</option>
                        {availableTables.map(table => (
                            <option key={table} value={table}>{table}</option>
                        ))}
                    </select>
                    {schemaError && (
                        <p className="text-[10px] text-red-500 mt-1">{schemaError}</p>
                    )}
                    {availableTables.length === 0 && !isLoadingTables && !schemaError && (
                        <p className="text-[10px] text-red-500 mt-1">Nenhuma tabela encontrada nesta conexão.</p>
                    )}
                </div>
              )}

              {widget.dataConfig?.tableName && widget.type === 'filter' && (
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={widget.dataConfig?.multiSelectFilter ?? false}
                    onChange={(e) => handleDataChange('multiSelectFilter', e.target.checked)}
                    className="rounded border-gray-300 text-[#5B4DFF] focus:ring-[#5B4DFF]"
                  />
                  Permitir seleção múltipla
                </label>
              )}

              {widget.type === 'counter' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                      Tempo (ms)
                    </label>
                    <input
                      type="number"
                      min="500"
                      value={widget.dataConfig?.counterDuration ?? 2000}
                      onChange={(e) =>
                        handleDataChange('counterDuration', Number(e.target.value))
                      }
                      className={inputClasses}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={widget.dataConfig?.counterLoop ?? false}
                      onChange={(e) => handleDataChange('counterLoop', e.target.checked)}
                      className="rounded border-gray-300 text-[#5B4DFF] focus:ring-[#5B4DFF]"
                    />
                    Ativar looping
                  </label>
                </div>
              )}

              {(widget.type === 'funnel_chart' || widget.type === 'funnel') && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  {(() => {
                    const funnelSteps =
                      widget.dataConfig?.funnelSteps && widget.dataConfig.funnelSteps.length > 0
                        ? widget.dataConfig.funnelSteps
                        : [
                            { label: 'Etapa 1', metric: '' },
                            { label: 'Etapa 2', metric: '' },
                            { label: 'Etapa 3', metric: '' },
                          ];
                    return (
                      <>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                      Etapas do funil
                    </label>
                    <input
                      type="number"
                      min={3}
                      max={10}
                      value={funnelSteps.length}
                      onChange={(e) => {
                        const nextCount = Math.max(3, Math.min(10, Number(e.target.value) || 3));
                        const current = funnelSteps;
                        if (current.length === nextCount) return;
                        const nextSteps = [...current];
                        if (nextCount > current.length) {
                          for (let i = current.length; i < nextCount; i += 1) {
                            nextSteps.push({ label: `Etapa ${i + 1}`, metric: '' });
                          }
                        } else {
                          nextSteps.length = nextCount;
                        }
                        updateFunnelSteps(nextSteps);
                      }}
                      className={inputClasses}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Mínimo 3 etapas. Cada etapa precisa de uma métrica.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {funnelSteps.map((step, index) => {
                      const calcOptions = buildCalculatedOptions(step.metric);
                      return (
                        <div key={`funnel-step-${index}`} className="p-3 border border-gray-100 rounded-xl bg-white space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-gray-500 font-semibold uppercase">
                            <span>Etapa {index + 1}</span>
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Texto</label>
                            <input
                              type="text"
                              value={step.label ?? ''}
                              onChange={(e) => handleFunnelStepChange(index, { label: e.target.value })}
                              className={inputClasses}
                              placeholder={`Etapa ${index + 1}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Métrica</label>
                            <select
                              value={step.metric ?? ''}
                              onChange={(e) => handleFunnelStepChange(index, { metric: e.target.value })}
                              className={inputClasses}
                              disabled={!widget.dataConfig?.tableName || isLoadingColumns || availableColumns.length === 0}
                            >
                              <option value="">Selecione...</option>
                              {metricColumns.map((col) => (
                                <option key={col.name} value={col.name}>
                                  {col.name} {col.type ? `(${col.type})` : ''}
                                </option>
                              ))}
                              {calcOptions.length > 0 && (
                                <optgroup label="Métricas calculadas">
                                  {calcOptions.map((metric) => (
                                    <option key={`calc-${metric.key}`} value={`calc:${metric.key}`}>
                                      {metric.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {widget.dataConfig?.tableName && (
                <CalculatedMetricManager availableColumns={availableColumns} />
              )}

              {/* 3. Select Columns (Dynamic) */}
              {widget.dataConfig?.tableName &&
                widget.type !== 'filter' &&
                widget.type !== 'funnel_chart' &&
                widget.type !== 'funnel' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  {widget.type !== 'gauge' && widget.type !== 'counter' && widget.type !== 'card' && widget.type !== 'table' && (
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Dimensão (Eixo X)</label>
                      <select
                        value={widget.dataConfig?.dimension || ''}
                        onChange={(e) => handleDataChange('dimension', e.target.value)}
                        className={inputClasses}
                        disabled={isLoadingColumns || availableColumns.length === 0}
                      >
                        <option value="">Selecione...</option>
                        {dimensionColumns.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name} {col.type ? `(${col.type})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">
                        {widget.type === 'gauge' || widget.type === 'counter' || widget.type === 'card'
                          ? 'Métrica'
                          : 'Métrica (Eixo X)'}
                      </label>
                      <select
                        value={primaryMetricValue}
                        onChange={(e) => handleMetricFieldChange('metricX', e.target.value)}
                        className={inputClasses}
                        disabled={isLoadingColumns || availableColumns.length === 0}
                      >
                        <option value="">Selecione...</option>
                        {metricColumns.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name} {col.type ? `(${col.type})` : ''}
                          </option>
                        ))}
                        {metricXCalculatedOptions.length > 0 && (
                          <optgroup label="Métricas calculadas">
                            {metricXCalculatedOptions.map((metric) => (
                              <option key={`calc-${metric.key}`} value={`calc:${metric.key}`}>
                                {metric.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                    {widget.type !== 'gauge' && widget.type !== 'counter' && widget.type !== 'card' && widget.type !== 'table' && (
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Métrica (Eixo Y)</label>
                        <select
                          value={secondaryMetricValue}
                          onChange={(e) => handleMetricFieldChange('metricY', e.target.value)}
                          className={inputClasses}
                          disabled={isLoadingColumns || availableColumns.length === 0}
                        >
                          <option value="">Selecione...</option>
                          {metricColumns.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.name} {col.type ? `(${col.type})` : ''}
                            </option>
                          ))}
                          {metricYCalculatedOptions.length > 0 && (
                            <optgroup label="Métricas calculadas">
                              {metricYCalculatedOptions.map((metric) => (
                                <option key={`calc-${metric.key}`} value={`calc:${metric.key}`}>
                                  {metric.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-gray-400">Opcional. Use para uma segunda série.</p>
                          {widget.type === 'line_chart' && (
                            <label className="flex items-center gap-1 text-[10px] text-gray-500">
                              <input
                                type="checkbox"
                                checked={widget.dataConfig?.lineSecondaryAxis ?? false}
                                onChange={(e) => handleDataChange('lineSecondaryAxis', e.target.checked)}
                                className="rounded border-gray-300 text-[#5B4DFF] focus:ring-[#5B4DFF]"
                                disabled={!widget.dataConfig?.metricY}
                              />
                              Eixo secundário
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {widget.type === 'card' && (
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Meta (opcional)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={widget.dataConfig?.meta ?? ''}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          handleDataChange('meta', nextValue === '' ? undefined : Number(nextValue));
                        }}
                        className={inputClasses}
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        Define a meta para o círculo mostrar o % de atingimento.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {widget.type === 'table' && widget.dataConfig?.tableName && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                      Dimensões (até {MAX_TABLE_DIMENSIONS})
                    </label>
                    <div className="max-h-32 overflow-auto border border-gray-100 rounded-xl p-3 space-y-1 bg-white">
                      {dimensionColumns.map((col) => {
                        const selected = widget.dataConfig?.tableDimensions?.includes(col.name) ?? false;
                        const limitReached = !selected && (widget.dataConfig?.tableDimensions?.length ?? 0) >= MAX_TABLE_DIMENSIONS;
                        return (
                          <label key={col.name} className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={limitReached}
                              onChange={() => toggleTableSelection('tableDimensions', col.name, MAX_TABLE_DIMENSIONS)}
                              className="rounded border-gray-300 text-[#5B4DFF] focus:ring-[#5B4DFF]"
                            />
                            {col.name}
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Selecionadas: {widget.dataConfig?.tableDimensions?.length ?? 0} de {MAX_TABLE_DIMENSIONS}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                      Métricas (até {MAX_TABLE_METRICS})
                    </label>
                    <div className="max-h-40 overflow-auto border border-gray-100 rounded-xl p-3 space-y-1 bg-white">
                      {metricColumns.map((col) => {
                        const selected = widget.dataConfig?.tableMetrics?.includes(col.name) ?? false;
                        const limitReached = !selected && (widget.dataConfig?.tableMetrics?.length ?? 0) >= MAX_TABLE_METRICS;
                        return (
                          <label key={col.name} className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={limitReached}
                              onChange={() => toggleTableSelection('tableMetrics', col.name, MAX_TABLE_METRICS)}
                              className="rounded border-gray-300 text-[#5B4DFF] focus:ring-[#5B4DFF]"
                            />
                            {col.name}
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Selecionadas: {widget.dataConfig?.tableMetrics?.length ?? 0} de {MAX_TABLE_METRICS}
                    </p>
                  </div>
                  {(widget.dataConfig?.tableMetrics?.length ?? 0) > 0 && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Métrica principal da comparação</label>
                        <select
                          value={widget.dataConfig?.tableComparisonMetric || widget.dataConfig?.tableMetrics?.[0] || ''}
                          onChange={(e) => handleDataChange('tableComparisonMetric', e.target.value)}
                          className={inputClasses}
                        >
                          {(widget.dataConfig?.tableMetrics ?? []).map((metric) => (
                            <option key={metric} value={metric}>
                              {metric}
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Quando a comparação global estiver ativa, esta métrica define a coluna “vs anterior”.
                        </p>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Métrica da barra por linha</label>
                        <select
                          value={widget.dataConfig?.tableBarMetric || ''}
                          onChange={(e) => handleDataChange('tableBarMetric', e.target.value || undefined)}
                          className={inputClasses}
                        >
                          <option value="">Sem barra adicional</option>
                          {(widget.dataConfig?.tableMetrics ?? []).map((metric) => (
                            <option key={metric} value={metric}>
                              {metric}
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Exibe uma barra horizontal proporcional para a métrica escolhida em cada linha.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Filter Specific Configuration */}
              {widget.type === 'filter' && widget.dataConfig?.tableName && (
                 <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="block text-[10px] text-gray-500 mb-1">Campo para Filtrar</label>
                    <select 
                        value={widget.dataConfig?.dimension || ''} 
                        onChange={(e) => handleDataChange('dimension', e.target.value)}
                        className={inputClasses}
                        disabled={isLoadingColumns || availableColumns.length === 0}
                    >
                        <option value="">Selecione a coluna...</option>
                      {dimensionColumns.map((col) => (
                        <option key={col.name} value={col.name}>
                          {col.name} {col.type ? `(${col.type})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">
                        Selecionar este campo fará com que este widget filtre os outros gráficos pelo valor selecionado na coluna <b>{widget.dataConfig?.dimension || '...'}</b>.
                    </p>
                 </div>
              )}
              
              {/* AI Helper */}
              <div className="bg-[#F3F4F8] p-4 rounded-xl border border-[#E0E7FF] mt-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#5B4DFF] mb-2">
                  <Wand2 size={14} /> Perguntar à IA
                </label>
                <textarea 
                  placeholder="Ex: Quero ver as vendas do mês passado..."
                  className={`${inputClasses} mb-2`}
                  rows={2}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                />
                <button 
                  onClick={handleAiSqlGen}
                  disabled={isGenerating}
                  className="w-full py-1.5 bg-[#5B4DFF] text-white text-xs font-medium rounded-lg hover:bg-[#4B3DCC] transition-colors shadow-sm shadow-indigo-200 disabled:opacity-50"
                >
                  {isGenerating ? 'Pensando...' : 'Gerar Query SQL'}
                </button>
              </div>
            </div>
          </section>
        )}

        {activeWidgetTab === 'advanced' && (
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-1 tracking-wider flex items-center gap-2">
              CSS Avançado
            </h3>
            <p className="text-xs text-gray-500">
              Utilize <code className="px-1 py-0.5 rounded bg-gray-100">.this</code> para estilizar o widget atual.
              Exemplo: <code className="px-1 py-0.5 rounded bg-gray-100">.this .titulo</code> afeta apenas elementos deste componente.
            </p>
            <AdvancedCssEditor
              value={widget.advancedCss ?? ''}
              onChange={(next) => onUpdate(widget.id, { advancedCss: next })}
              onValidationChange={setCssValidationMessage}
            />
            <div className="text-[11px] text-gray-500 space-y-1">
              <p>
                Classe interna do widget:{' '}
                <code className="px-1 py-0.5 bg-gray-100 rounded">.widget-scope-{widget.id}</code>
              </p>
              <p>Palette: digite “color: #” para abrir rapidamente o seletor de cores.</p>
              {cssValidationMessage && (
                <p className="text-red-500 text-xs flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  {cssValidationMessage}
                </p>
              )}
            </div>
          </section>
        )}

        <section className="pt-4">
          <button 
            onClick={() => onDelete(widget.id)}
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
          >
            <Trash2 size={16} /> Remover Widget
          </button>
        </section>

      </div>
    </div>
  );
};
