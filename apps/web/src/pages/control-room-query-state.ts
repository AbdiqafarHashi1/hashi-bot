export type RunModeFilter = 'all' | 'replay' | 'backtest';
export type TradeResultFilter = 'all' | 'wins' | 'losses' | 'breakeven';
export type LiveSectionFocus = 'summary' | 'positions' | 'orders' | 'incidents' | 'safety';
export type SafetyViewFocus = 'summary' | 'incidents' | 'lockout';

export type SectionKey =
  | 'hero-metrics'
  | 'inventory-table'
  | 'trade-table'
  | 'trade-inspector'
  | 'comparison-panel'
  | 'safety-summary'
  | 'positions-panel'
  | 'incidents-panel'
  | 'run-console'
  | 'performance-panel';

export interface PaginationViewModel {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  rowStart: number;
  rowEnd: number;
}

export interface SectionRenderState {
  section: SectionKey | 'all';
  refreshTarget?: SectionKey;
}

export interface QueryStateViewModel {
  mode: RunModeFilter;
  runId?: string;
  result: TradeResultFilter;
  source?: string;
  reason?: string;
  sectionFocus?: LiveSectionFocus;
  safetyView?: SafetyViewFocus;
  sectionRender: SectionRenderState;
  page: number;
  pageSize: number;
}

function pickString(query: URLSearchParams, key: string): string | undefined {
  const value = query.get(key);
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeMode(value: string | undefined): RunModeFilter {
  return value === 'replay' || value === 'backtest' ? value : 'all';
}

export function normalizeResultFilter(value: string | undefined): TradeResultFilter {
  if (value === 'wins' || value === 'losses' || value === 'breakeven') {
    return value;
  }
  return 'all';
}

export function normalizeLiveSection(value: string | undefined): LiveSectionFocus {
  if (value === 'positions' || value === 'orders' || value === 'incidents' || value === 'safety') {
    return value;
  }
  return 'summary';
}

export function normalizeSafetyView(value: string | undefined): SafetyViewFocus {
  if (value === 'incidents' || value === 'lockout') {
    return value;
  }
  return 'summary';
}

const SECTION_KEYS: SectionKey[] = [
  'hero-metrics',
  'inventory-table',
  'trade-table',
  'trade-inspector',
  'comparison-panel',
  'safety-summary',
  'positions-panel',
  'incidents-panel',
  'run-console',
  'performance-panel',
];

function normalizeSectionKey(value: string | undefined): SectionKey | undefined {
  return value && SECTION_KEYS.includes(value as SectionKey) ? (value as SectionKey) : undefined;
}

function normalizePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, parsed);
}

export function parseQueryState(query: URLSearchParams): QueryStateViewModel {
  const mode = normalizeMode(pickString(query, 'mode'));
  const runId = pickString(query, 'runId');
  const result = normalizeResultFilter(pickString(query, 'result'));
  const sectionRender: SectionRenderState = {
    section: normalizeSectionKey(pickString(query, 'section')) ?? 'all',
    refreshTarget: normalizeSectionKey(pickString(query, 'refresh')),
  };

  return {
    mode,
    runId,
    result,
    source: pickString(query, 'source'),
    reason: pickString(query, 'reason'),
    sectionFocus: normalizeLiveSection(pickString(query, 'section')),
    safetyView: normalizeSafetyView(pickString(query, 'view')),
    sectionRender,
    page: normalizePositiveInt(pickString(query, 'page'), 1, 500),
    pageSize: normalizePositiveInt(pickString(query, 'pageSize'), 50, 200),
  };
}

export function shapePagination(totalRows: number, page: number, pageSize: number): PaginationViewModel {
  const normalizedTotal = Math.max(0, totalRows);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const rowStart = normalizedTotal === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rowEnd = normalizedTotal === 0 ? 0 : Math.min(normalizedTotal, safePage * pageSize);
  return {
    page: safePage,
    pageSize,
    totalRows: normalizedTotal,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
    rowStart,
    rowEnd,
  };
}

export function buildHref(path: string, state: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs.length > 0 ? `${path}?${qs}` : path;
}
