
export type WidgetType =
  | 'text'
  | 'image'
  | 'bar_chart'
  | 'line_chart'
  | 'radar_chart'
  | 'funnel_chart'
  | 'funnel'
  | 'gauge'
  | 'table'
  | 'filter'
  | 'counter'
  | 'card';

export type ReportLayout = 'desktop' | 'mobile';

export type CanvasBackgroundType = 'color' | 'gradient' | 'image';

export type CanvasImageFit = 'cover' | 'contain' | 'repeat' | 'auto';

export interface CustomFont {
  id: string;
  name: string;
  dataUrl: string;
  format: 'woff2' | 'woff' | 'opentype' | 'truetype';
}

export interface CanvasSettings {
  backgroundType: CanvasBackgroundType;
  backgroundColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
  imageUrl?: string;
  imageFit?: CanvasImageFit;
  fullscreen?: boolean;
  width?: number;
  height?: number;
  customFonts?: CustomFont[];
}

export type JoinType = 'left' | 'inner';

export interface JoinConfig {
  primary_table?: string;
  tables: Array<{
    name: string;
    alias?: string;
    date_column?: string;
  }>;
  joins: Array<{
    left_table: string;
    left_column: string;
    type: JoinType;
    right_table: string;
    right_column: string;
  }>;
}

export type DataSourceType = 'mysql' | 'google_sheets' | 'bigquery' | 'supabase';

export type DataSourceStatus = 'draft' | 'active' | 'inactive';

export type UserRole = 'admin' | 'standard' | 'viewer';

export type RolePermissionKey =
  | 'dashboard_list'
  | 'dashboard_create'
  | 'builder'
  | 'constructor'
  | 'manage_data_sources'
  | 'manage_schema'
  | 'admin_settings';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type RolePermissions = Record<UserRole, Record<RolePermissionKey, boolean>>;

export interface AppSettings {
  id?: number;
  tool_name: string;
  logo_url?: string | null;
  favicon_url?: string | null;
  role_permissions: RolePermissions;
  created_at?: string;
  updated_at?: string;
}

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  description?: string | null;
  config: Record<string, any>; // e.g., connection string, sheet ID
  credentialReference?: string | null;
  ownerId?: number | null;
  status?: DataSourceStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface DataSourcePayload {
  name: string;
  type: DataSourceType;
  description?: string;
  config: Record<string, any>;
  credential_reference?: string | null;
  owner_id?: number | null;
  status?: DataSourceStatus;
}

export type DateFilterPreset = 'today' | 'yesterday' | 'last7' | 'last15' | 'last30' | 'custom';
export type ComparisonMode = 'off' | 'previous_period' | 'previous_year' | 'custom';

export interface DateRange {
  start: string;
  end: string;
}

export interface ComparisonState {
  enabled: boolean;
  mode: ComparisonMode;
  customRange?: DateRange;
}

export interface GlobalFilterState {
  preset: DateFilterPreset;
  dateRange: DateRange;
  dimensionFilter?: { dimension: string; value: string };
  comparison?: ComparisonState;
}

export interface WidgetStyle {
  x: number;
  y: number;
  width: number; // pixels
  height: number; // pixels
  zIndex: number;
  backgroundColor?: string;
  filter?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  padding?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  titleColor?: string;
  titleFontSize?: number;
  titleFontFamily?: string;
  titleAlign?: 'left' | 'center' | 'right';
  titleMarginBottom?: number;
  contentColor?: string;
  contentFontSize?: number;
  contentFontFamily?: string;
  contentPadding?: number;
  contentTextAlign?: 'left' | 'center' | 'right';
}

export interface WidgetDataConfig {
  sourceId?: string;
  tableName?: string; // Added for dynamic selection
  dimension?: string; // e.g., 'date', 'campaign' (X Axis)
  metric?: string; // legacy primary metric
  metricX?: string; // numeric column for eixo X (bar horizontal / scatter)
  metricY?: string; // numeric column for eixo Y (gráficos)
  dateColumn?: string;
  limit?: number;
  imageUrlField?: string; // For dynamic images
  counterDuration?: number;
  counterLoop?: boolean;
  cardLabel?: string;
  meta?: number;
  cardIcon?:
    | 'bag'
    | 'analytics'
    | 'people'
    | 'cash'
    | 'globe'
    | 'speed'
    | 'rocket'
    | 'cart'
    | 'store'
    | 'shield';
  valueFormat?: 'number' | 'decimal' | 'currency' | 'percent';
  decimalPlaces?: number;
  currencySymbol?: string;
  tableDimensions?: string[];
  tableMetrics?: string[];
  tableComparisonMetric?: string;
  tableShowComparison?: boolean;
  tableBarMetric?: string;
  lineSecondaryAxis?: boolean;
  multiSelectFilter?: boolean;
  calculatedMetricOverrides?: Record<string, CalculatedMetric>;
  funnelSteps?: Array<{ label: string; metric: string }>;
}

export interface Widget {
  id: string;
  type: WidgetType;
  title?: string;
  content?: string; // For text/image URL
  style: WidgetStyle;
  dataConfig?: WidgetDataConfig;
  advancedCss?: string;
}

export interface Dashboard {
  id: string;
  name: string;
  isPublic: boolean;
  password?: string;
  widgets: Widget[];
  globalFilter: GlobalFilterState;
}

// Mock Data Interface for Visualization
export interface AnalyticsRow {
  date: string;
  campaign: string;
  adGroup: string;
  impressions: number;
  clicks: number;
  cost: number;
  imageUrl?: string; // For dynamic image binding mock
}

export type CalculatedMetricOutputFormat = 'number' | 'decimal' | 'currency' | 'percent';

export interface CalculatedMetric {
  id: number;
  name: string;
  key: string;
  formula: string;
  outputFormat: CalculatedMetricOutputFormat;
  createdAt?: string;
  updatedAt?: string;
}

export interface CalculatedMetricPayload {
  name: string;
  metricKey: string;
  formula: string;
  outputFormat: CalculatedMetricOutputFormat;
}

export type ExternalConnectionProvider =
  | 'google_ads'
  | 'meta_ads'
  | 'tiktok_ads'
  | 'google_analytics'
  | 'rd_station'
  | 'hubspot'
  | 'magneticgo';

export type ExternalConnectionAuthType = 'oauth2' | 'api_key' | 'token' | 'service_account';
export type ExternalConnectionStatus = 'draft' | 'connected' | 'expired' | 'error' | 'syncing' | 'inactive';

export interface ExternalConnection {
  id: number;
  user_id: number;
  name: string;
  provider: ExternalConnectionProvider;
  status: ExternalConnectionStatus;
  auth_type: ExternalConnectionAuthType;
  config_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExternalConnectionAccount {
  id: number;
  connection_id: number;
  external_account_id: string;
  external_account_name: string;
  external_account_type?: string | null;
  is_selected: boolean;
  metadata_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export type SourceDatasetKind = 'data_source' | 'external_connection';
export type SourceDatasetType = 'raw' | 'normalized' | 'manual' | 'imported';
export type SourceDatasetStatus = 'draft' | 'ready' | 'syncing' | 'error' | 'archived';

export interface SourceDataset {
  id: number;
  source_kind: SourceDatasetKind;
  source_ref_id: number;
  account_ref_id?: number | null;
  name: string;
  slug: string;
  dataset_type: SourceDatasetType;
  grain?: string | null;
  warehouse_schema: string;
  warehouse_table: string;
  primary_date_field?: string | null;
  status: SourceDatasetStatus;
  field_catalog_json?: Array<{ name: string; type?: string; role?: string; semantic_type?: string }> | Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export type DatasetDefinitionStatus = 'draft' | 'published' | 'error' | 'syncing' | 'archived';
export type DatasetNodeType = 'source' | 'derived';
export type DatasetEdgeJoinType = 'left' | 'inner';
export type DatasetAggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'none';

export interface DatasetDefinition {
  id: number;
  user_id: number;
  name: string;
  slug: string;
  description?: string | null;
  status: DatasetDefinitionStatus;
  warehouse_schema: string;
  warehouse_table?: string | null;
  primary_date_field?: string | null;
  version: number;
  created_at?: string;
  updated_at?: string;
}

export interface DatasetNode {
  id: number;
  dataset_definition_id: number;
  node_type: DatasetNodeType;
  source_dataset_id?: number | null;
  label: string;
  pos_x: number;
  pos_y: number;
  config_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface DatasetEdge {
  id: number;
  dataset_definition_id: number;
  from_node_id: number;
  to_node_id: number;
  join_type: DatasetEdgeJoinType;
  from_field: string;
  to_field: string;
  created_at?: string;
  updated_at?: string;
}

export interface DatasetSelectedColumn {
  id: number;
  dataset_definition_id: number;
  node_id: number;
  source_column: string;
  output_column: string;
  semantic_type?: string | null;
  aggregation_type?: DatasetAggregationType | null;
  is_dimension: boolean;
  is_metric: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface DatasetPreviewResponse {
  dataset: DatasetDefinition;
  sql: string;
  columns: Array<{
    output_column: string;
    source_column: string;
    semantic_type?: string | null;
    aggregation_type?: DatasetAggregationType | null;
    is_dimension: boolean;
    is_metric: boolean;
  }>;
  rows: Array<Record<string, unknown>>;
  row_count: number;
}

export interface DatasetPublishResponse {
  status: 'success';
  dataset: DatasetDefinition;
  warehouse_schema: string;
  warehouse_table: string;
  row_count: number;
  sql: string;
}
