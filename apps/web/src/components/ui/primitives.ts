import type { PlatformStatus } from './status-system.js';
import { createStatusBadge, type StatusBadgeModel } from './status-system.js';

export interface AppShellLayout {
  kind: 'app_shell';
  productName: string;
  railItems: Array<{ key: string; label: string; href: string; status?: PlatformStatus }>;
  utilityItems: Array<{ key: string; label: string; href: string }>;
}

export function createAppShellLayout(
  productName: string,
  railItems: AppShellLayout['railItems'],
  utilityItems: AppShellLayout['utilityItems'] = []
): AppShellLayout {
  return { kind: 'app_shell', productName, railItems, utilityItems };
}

export interface PageHeader {
  kind: 'page_header';
  title: string;
  description: string;
  badges: StatusBadgeModel[];
  actions: Array<{ key: string; label: string; actionId: string; intent?: 'default' | 'primary' | 'danger' }>;
}

export function createPageHeader(input: Omit<PageHeader, 'kind' | 'badges'> & { statuses?: PlatformStatus[] }): PageHeader {
  return {
    kind: 'page_header',
    title: input.title,
    description: input.description,
    actions: input.actions,
    badges: (input.statuses ?? []).map((status) => createStatusBadge(status)),
  };
}

export interface SectionHeader {
  kind: 'section_header';
  title: string;
  subtitle?: string;
  helperText?: string;
}

export function createSectionHeader(title: string, subtitle?: string, helperText?: string): SectionHeader {
  return { kind: 'section_header', title, subtitle, helperText };
}

export interface CardContainer {
  kind: 'card_container';
  title?: string;
  tone: 'default' | 'elevated' | 'danger';
  children: string[];
}

export function createCardContainer(children: string[], title?: string, tone: CardContainer['tone'] = 'default'): CardContainer {
  return { kind: 'card_container', title, tone, children };
}

export interface KpiCard {
  kind: 'kpi_card';
  label: string;
  value: string;
  delta?: string;
  trend?: PlatformStatus;
  auxiliary?: string;
}

export function createKpiCard(label: string, value: string, delta?: string, trend?: PlatformStatus, auxiliary?: string): KpiCard {
  return { kind: 'kpi_card', label, value, delta, trend, auxiliary };
}

export interface MetricRow {
  kind: 'metric_row';
  label: string;
  value: string;
  status?: PlatformStatus;
  note?: string;
}

export function createMetricRow(label: string, value: string, status?: PlatformStatus, note?: string): MetricRow {
  return { kind: 'metric_row', label, value, status, note };
}

export interface FilterBar {
  kind: 'filter_bar';
  filters: Array<{ key: string; label: string; values: string[]; selected?: string }>;
}

export function createFilterBar(filters: FilterBar['filters']): FilterBar {
  return { kind: 'filter_bar', filters };
}

export interface SegmentedControl {
  kind: 'segmented_control';
  key: string;
  options: Array<{ value: string; label: string }>;
  selected: string;
}

export function createSegmentedControl(
  key: string,
  options: SegmentedControl['options'],
  selected: string
): SegmentedControl {
  return { kind: 'segmented_control', key, options, selected };
}

export interface DataTableWrapper {
  kind: 'data_table';
  title: string;
  columns: Array<{ key: string; label: string; width?: string }>;
  emptyMessage: string;
  presentation: {
    density: 'comfortable' | 'compact';
    stickyHeader: boolean;
    stripedRows: boolean;
    horizontalScroll: 'auto' | 'always';
    mobilePriorityColumns: string[];
  };
}

export function createDataTableWrapper(
  title: string,
  columns: DataTableWrapper['columns'],
  emptyMessage = 'No records found for this view.',
  presentation?: Partial<DataTableWrapper['presentation']>
): DataTableWrapper {
  return {
    kind: 'data_table',
    title,
    columns,
    emptyMessage,
    presentation: {
      density: presentation?.density ?? 'compact',
      stickyHeader: presentation?.stickyHeader ?? true,
      stripedRows: presentation?.stripedRows ?? true,
      horizontalScroll: presentation?.horizontalScroll ?? 'auto',
      mobilePriorityColumns: presentation?.mobilePriorityColumns ?? columns.slice(0, 2).map((column) => column.key),
    },
  };
}

export interface ChartWrapper {
  kind: 'chart_wrapper';
  title: string;
  subtitle?: string;
  yAxisLabel?: string;
  presentation: {
    height: 'sm' | 'md' | 'lg';
    showLegend: boolean;
    loadingBars: number;
    emptyMessage: string;
  };
}

export function createChartWrapper(
  title: string,
  subtitle?: string,
  yAxisLabel?: string,
  presentation?: Partial<ChartWrapper['presentation']>
): ChartWrapper {
  return {
    kind: 'chart_wrapper',
    title,
    subtitle,
    yAxisLabel,
    presentation: {
      height: presentation?.height ?? 'md',
      showLegend: presentation?.showLegend ?? true,
      loadingBars: presentation?.loadingBars ?? 8,
      emptyMessage: presentation?.emptyMessage ?? 'No chart data available for the selected context.',
    },
  };
}

export interface TimelineEvent {
  timestamp: string;
  label: string;
  description: string;
  status?: PlatformStatus;
}

export interface TimelineFeed {
  kind: 'timeline_feed';
  title: string;
  events: TimelineEvent[];
}

export function createTimelineFeed(title: string, events: TimelineEvent[]): TimelineFeed {
  return { kind: 'timeline_feed', title, events };
}

export interface DetailPanel {
  kind: 'detail_panel';
  title: string;
  sections: Array<{ title: string; rows: MetricRow[] }>;
}

export function createDetailPanel(title: string, sections: DetailPanel['sections']): DetailPanel {
  return { kind: 'detail_panel', title, sections };
}

export interface LoadingState {
  kind: 'loading_state';
  title: string;
  skeletonRows: number;
}

export function createLoadingState(title: string, skeletonRows = 4): LoadingState {
  return { kind: 'loading_state', title, skeletonRows };
}

export interface EmptyState {
  kind: 'empty_state';
  title: string;
  message: string;
  action?: { label: string; actionId: string };
}

export function createEmptyState(title: string, message: string, action?: EmptyState['action']): EmptyState {
  return { kind: 'empty_state', title, message, action };
}

export interface ErrorState {
  kind: 'error_state';
  title: string;
  message: string;
  recoverable: boolean;
}

export function createErrorState(title: string, message: string, recoverable = true): ErrorState {
  return { kind: 'error_state', title, message, recoverable };
}

export interface ConfirmationDialog {
  kind: 'confirmation_dialog';
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export function createConfirmationDialog(
  title: string,
  message: string,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel'
): ConfirmationDialog {
  return { kind: 'confirmation_dialog', title, message, confirmLabel, cancelLabel };
}

export interface DangerActionDialog extends Omit<ConfirmationDialog, 'kind'> {
  kind: 'danger_action_dialog';
  requirePhrase?: string;
}

export function createDangerActionDialog(
  title: string,
  message: string,
  confirmLabel = 'Execute Dangerous Action',
  cancelLabel = 'Abort',
  requirePhrase?: string
): DangerActionDialog {
  return { kind: 'danger_action_dialog', title, message, confirmLabel, cancelLabel, requirePhrase };
}
