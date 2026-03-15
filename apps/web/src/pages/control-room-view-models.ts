import {
  buildHref,
  normalizeResultFilter,
  normalizeSortDirection,
  shapePagination,
  type PaginationViewModel,
  type QueryStateViewModel,
  type SectionRenderState,
  type SortDirection,
} from './control-room-query-state.js';
export interface PanelAvailability {
  status: 'available' | 'unavailable' | 'empty';
  reason?: string;
}

export interface HeroMetricEntry {
  key: string;
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  availability: PanelAvailability;
}

export interface ChartSeriesPoint {
  x: number;
  y: number;
}

export interface ChartSeriesViewModel {
  key: string;
  label: string;
  points: ChartSeriesPoint[];
  availability: PanelAvailability;
}

export interface RunSummaryRowViewModel {
  runId: string;
  dataset: string;
  profile: string;
  status: string;
  createdAt: string;
  completedAt: string;
  netPnl: string;
  winRate: string;
  trades: string;
}

export interface TradeRowViewModel {
  tradeId: string;
  symbol: string;
  side: string;
  setup: string;
  state: string;
  openedAt: string;
  closedAt: string;
  netPnl: string;
  reason: string;
}

export interface EvaluationSummaryBlock {
  title: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  availability: PanelAvailability;
}

export interface BacktestLabViewModel {
  commandContext: {
    dataset: string;
    symbols: string;
    timeframe: string;
    profile: string;
    selectedRun: string;
    runCount: string;
    status: string;
  };
  heroMetrics: HeroMetricEntry[];
  equitySeries: ChartSeriesViewModel;
  drawdownSeries: ChartSeriesViewModel;
  distribution: {
    winsLosses: string;
    avgWin: string;
    avgLoss: string;
    bestTrade: string;
    worstTrade: string;
    reasonSummary: string;
    pnlDistributionStatus: PanelAvailability;
  };
  runRows: RunSummaryRowViewModel[];
  tradeRows: TradeRowViewModel[];
  evaluation: EvaluationSummaryBlock[];
  launchDefaults: {
    datasetPlaceholder: string;
    profilePlaceholder: string;
    timeframePlaceholder: string;
    symbolsPlaceholder: string;
    initialBalancePlaceholder: string;
    slippageBpsPlaceholder: string;
    commissionBpsPlaceholder: string;
    maxConcurrentPositionsPlaceholder: string;
  };
}

type GenericRecord = Record<string, unknown>;

const localCache = new Map<string, BacktestLabViewModel>();

function asRecord(value: unknown): GenericRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as GenericRecord) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function findSection(page: GenericRecord, key: string): GenericRecord | undefined {
  const data = findSectionData(page, key);
  return asRecord(data);
}

function findSectionData(page: GenericRecord, key: string): unknown {
  const sections = asArray(page.sections);
  for (const section of sections) {
    const item = asRecord(section);
    if (item?.key === key) {
      return item.data;
    }
  }
  return undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown, fallback = '—'): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function iso(ts: unknown): string {
  const num = numberOrUndefined(ts);
  return num === undefined ? '—' : new Date(num).toISOString();
}

function pct(value: unknown): string {
  const num = numberOrUndefined(value);
  return num === undefined ? '—' : `${num.toFixed(2)}%`;
}

function money(value: unknown): string {
  const num = numberOrUndefined(value);
  if (num === undefined) {
    return '—';
  }
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function numeric(value: unknown): string {
  const num = numberOrUndefined(value);
  return num === undefined ? '—' : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function availabilityFromMetric(value: unknown, reason: string): PanelAvailability {
  return numberOrUndefined(value) === undefined
    ? { status: 'unavailable', reason }
    : { status: 'available' };
}

function toneFromPnl(value: unknown): 'good' | 'warn' | 'bad' | 'neutral' {
  const pnl = numberOrUndefined(value);
  if (pnl === undefined) {
    return 'neutral';
  }
  if (pnl > 0) {
    return 'good';
  }
  if (pnl < 0) {
    return 'bad';
  }
  return 'warn';
}

function tradeRowsFromDetail(activeRun: GenericRecord | undefined): TradeRowViewModel[] {
  const run = asRecord(activeRun?.run);
  const trades = asArray(run?.tradeSummaries);
  return trades
    .filter((item): item is GenericRecord => typeof item === 'object' && item !== null)
    .slice(0, 200)
    .map((trade) => ({
      tradeId: text(trade.tradeId),
      symbol: text(trade.symbolCode),
      side: text(trade.side),
      setup: text(trade.setupCode),
      state: text(trade.lifecycleState),
      openedAt: iso(trade.openedAtTs),
      closedAt: iso(trade.closedAtTs),
      netPnl: money(trade.netPnl),
      reason: text(trade.closeReason, 'n/a'),
    }));
}

function runRows(runsSection: GenericRecord | undefined): RunSummaryRowViewModel[] {
  const items = asArray(runsSection?.items);
  return items
    .filter((item): item is GenericRecord => typeof item === 'object' && item !== null)
    .slice(0, 500)
    .map((run) => ({
      runId: text(run.runId),
      dataset: text(run.datasetId),
      profile: text(run.profileCode),
      status: text(run.status),
      createdAt: iso(run.startedAtTs),
      completedAt: iso(run.completedAtTs),
      netPnl: money(run.netPnl),
      winRate: pct(run.winRatePct),
      trades: numeric(run.totalTrades),
    }));
}

function chartSeries(activeRun: GenericRecord | undefined): { equitySeries: ChartSeriesViewModel; drawdownSeries: ChartSeriesViewModel } {
  const run = asRecord(activeRun?.run);
  const equityPoints = asArray(run?.timeline)
    .filter((item): item is GenericRecord => typeof item === 'object' && item !== null)
    .map((item, index) => {
      const ts = numberOrUndefined(item.ts);
      const maybeEquity = numberOrUndefined(item.equity);
      return ts !== undefined && maybeEquity !== undefined ? { x: ts, y: maybeEquity } : { x: index, y: maybeEquity ?? 0 };
    });

  if (equityPoints.length > 0) {
    const peakByIndex: number[] = [];
    let peak = -Infinity;
    for (const point of equityPoints) {
      peak = Math.max(peak, point.y);
      peakByIndex.push(peak);
    }

    return {
      equitySeries: {
        key: 'equity',
        label: 'Equity Curve',
        points: equityPoints,
        availability: { status: 'available' },
      },
      drawdownSeries: {
        key: 'drawdown',
        label: 'Drawdown Overlay',
        points: equityPoints.map((point, idx) => {
          const peakVal = peakByIndex[idx] ?? point.y;
          const dd = peakVal === 0 ? 0 : ((peakVal - point.y) / Math.abs(peakVal)) * 100;
          return { x: point.x, y: Math.max(0, dd) };
        }),
        availability: { status: 'available' },
      },
    };
  }

  return {
    equitySeries: {
      key: 'equity',
      label: 'Equity Curve',
      points: [],
      availability: { status: 'unavailable', reason: 'Runtime run detail does not currently surface equity timeline points.' },
    },
    drawdownSeries: {
      key: 'drawdown',
      label: 'Drawdown Overlay',
      points: [],
      availability: { status: 'unavailable', reason: 'Drawdown series requires equity points from runtime payload.' },
    },
  };
}

export function createBacktestLabViewModel(pagePayload: unknown): BacktestLabViewModel {
  const page = asRecord(pagePayload) ?? {};
  const runs = findSection(page, 'runs');
  const activeRun = findSection(page, 'active_run');
  const launchContext = findSection(page, 'launch_context');
  const defaults = asRecord(findSection(page, 'defaults')?.defaults);
  const run = asRecord(activeRun?.run);
  const summary = asRecord(run?.summary);
  const metrics = asRecord(run?.metrics);

  const cacheKey = JSON.stringify({
    path: page.path,
    runCount: runs?.count,
    activeRunId: summary?.runId,
    completedAt: summary?.completedAtTs,
    tradeCount: metrics?.totalTrades,
    netPnl: metrics?.netPnl,
  });

  const cached = localCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const runItems = asArray(runs?.items);
  const firstRun = runItems[0] && typeof runItems[0] === 'object' ? (runItems[0] as GenericRecord) : undefined;
  const symbols = asArray(summary?.symbols).filter((item): item is string => typeof item === 'string' && item.length > 0);
  const tradeRows = tradeRowsFromDetail(activeRun);

  const wins = tradeRows.filter((row) => {
    const pnl = Number(row.netPnl.replaceAll(',', ''));
    return Number.isFinite(pnl) && pnl > 0;
  }).length;
  const losses = tradeRows.filter((row) => {
    const pnl = Number(row.netPnl.replaceAll(',', ''));
    return Number.isFinite(pnl) && pnl < 0;
  }).length;

  const winPnlValues = tradeRows
    .map((row) => Number(row.netPnl.replaceAll(',', '')))
    .filter((val) => Number.isFinite(val) && val > 0);
  const lossPnlValues = tradeRows
    .map((row) => Number(row.netPnl.replaceAll(',', '')))
    .filter((val) => Number.isFinite(val) && val < 0);

  const grossPnl = Number.isFinite(winPnlValues.reduce((sum, v) => sum + v, 0)) ? winPnlValues.reduce((sum, v) => sum + v, 0) : undefined;
  const netPnl = numberOrUndefined(metrics?.netPnl ?? firstRun?.netPnl);

  const model: BacktestLabViewModel = {
    commandContext: {
      dataset: text(summary?.datasetId ?? firstRun?.datasetId, 'unavailable'),
      symbols: symbols.length > 0 ? symbols.join(', ') : 'unavailable',
      timeframe: text(summary?.timeframe ?? firstRun?.timeframe, 'unavailable'),
      profile: text(summary?.profileCode ?? firstRun?.profileCode, 'unavailable'),
      selectedRun: text(summary?.runId ?? firstRun?.runId, 'none selected'),
      runCount: numeric(runs?.count),
      status: text(summary?.status ?? firstRun?.status, 'unknown'),
    },
    heroMetrics: [
      { key: 'net', label: 'Net PnL', value: money(netPnl), tone: toneFromPnl(netPnl), availability: availabilityFromMetric(netPnl, 'Net PnL unavailable from current run payload.') },
      { key: 'gross', label: 'Gross PnL', value: money(grossPnl), tone: toneFromPnl(grossPnl), availability: availabilityFromMetric(grossPnl, 'Gross PnL requires trade-level values from run detail.') },
      { key: 'fees', label: 'Fees', value: 'not yet surfaced', tone: 'neutral', availability: { status: 'unavailable', reason: 'Fee totals are not currently surfaced in run summary/detail payload.' } },
      { key: 'trades', label: 'Total Trades', value: numeric(metrics?.totalTrades ?? firstRun?.totalTrades), tone: 'neutral', availability: availabilityFromMetric(metrics?.totalTrades ?? firstRun?.totalTrades, 'Total trades unavailable from current run payload.') },
      { key: 'winRate', label: 'Win Rate', value: pct(metrics?.winRatePct ?? firstRun?.winRatePct), tone: 'neutral', availability: availabilityFromMetric(metrics?.winRatePct ?? firstRun?.winRatePct, 'Win rate unavailable from current run payload.') },
      { key: 'expectancy', label: 'Expectancy', value: 'not yet surfaced', tone: 'neutral', availability: { status: 'unavailable', reason: 'Expectancy metric is not currently surfaced by runtime.' } },
      { key: 'profitFactor', label: 'Profit Factor', value: 'not yet surfaced', tone: 'neutral', availability: { status: 'unavailable', reason: 'Profit factor requires gross win/loss totals from runtime metrics.' } },
      { key: 'drawdown', label: 'Max Drawdown', value: pct(metrics?.maxDrawdownPct ?? firstRun?.maxDrawdownPct), tone: 'warn', availability: availabilityFromMetric(metrics?.maxDrawdownPct ?? firstRun?.maxDrawdownPct, 'Max drawdown unavailable from current run payload.') },
      { key: 'evaluation', label: 'Evaluation Status', value: netPnl !== undefined && netPnl > 0 ? 'in_progress' : 'pending', tone: netPnl !== undefined && netPnl > 0 ? 'good' : 'warn', availability: { status: 'available' } },
    ],
    ...chartSeries(activeRun),
    distribution: {
      winsLosses: `${wins.toLocaleString()} / ${losses.toLocaleString()}`,
      avgWin: winPnlValues.length > 0 ? money(winPnlValues.reduce((sum, val) => sum + val, 0) / winPnlValues.length) : '—',
      avgLoss: lossPnlValues.length > 0 ? money(lossPnlValues.reduce((sum, val) => sum + val, 0) / lossPnlValues.length) : '—',
      bestTrade: tradeRows.length > 0 ? tradeRows.slice().sort((a, b) => Number(b.netPnl.replaceAll(',', '')) - Number(a.netPnl.replaceAll(',', '')))[0]?.netPnl ?? '—' : '—',
      worstTrade: tradeRows.length > 0 ? tradeRows.slice().sort((a, b) => Number(a.netPnl.replaceAll(',', '')) - Number(b.netPnl.replaceAll(',', '')))[0]?.netPnl ?? '—' : '—',
      reasonSummary: 'not yet surfaced by runtime',
      pnlDistributionStatus: { status: 'unavailable', reason: 'Bucketed PnL distribution is not currently surfaced by runtime payload.' },
    },
    runRows: runRows(runs),
    tradeRows,
    evaluation: [
      { title: 'Target Progress', value: netPnl === undefined ? '—' : pct(Math.max(0, Math.min(100, (netPnl / 500) * 100))), tone: netPnl !== undefined && netPnl >= 500 ? 'good' : 'warn', availability: netPnl === undefined ? { status: 'unavailable', reason: 'Target progress requires net PnL from selected run.' } : { status: 'available' } },
      { title: 'Drawdown State', value: pct(metrics?.maxDrawdownPct ?? firstRun?.maxDrawdownPct), tone: numberOrUndefined(metrics?.maxDrawdownPct ?? firstRun?.maxDrawdownPct) !== undefined && Number(metrics?.maxDrawdownPct ?? firstRun?.maxDrawdownPct) > 8 ? 'bad' : 'warn', availability: availabilityFromMetric(metrics?.maxDrawdownPct ?? firstRun?.maxDrawdownPct, 'Drawdown state unavailable from runtime payload.') },
      { title: 'Account Preservation', value: netPnl !== undefined && netPnl < -1000 ? 'elevated risk' : 'stable', tone: netPnl !== undefined && netPnl < -1000 ? 'bad' : 'good', availability: netPnl === undefined ? { status: 'unavailable', reason: 'Account preservation estimate requires net PnL.' } : { status: 'available' } },
      { title: 'Remaining Buffer', value: netPnl === undefined ? '—' : money(500 - netPnl), tone: netPnl !== undefined && netPnl >= 500 ? 'good' : 'neutral', availability: netPnl === undefined ? { status: 'unavailable', reason: 'Remaining buffer requires selected run metrics.' } : { status: 'available' } },
    ],
    launchDefaults: {
      datasetPlaceholder: text(asArray(launchContext?.datasets)[0] && asRecord(asArray(launchContext?.datasets)[0])?.id, 'dataset-btc-1m'),
      profilePlaceholder: text(asArray(launchContext?.profiles)[0], 'PROP_HUNTER'),
      timeframePlaceholder: text(asRecord(asArray(launchContext?.datasets)[0])?.timeframe, '1m'),
      symbolsPlaceholder: text(asRecord(asArray(launchContext?.datasets)[0])?.symbolCode, 'BTCUSDT'),
      initialBalancePlaceholder: numeric(defaults?.initialBalance ?? 10000),
      slippageBpsPlaceholder: numeric(defaults?.slippageBps ?? 5),
      commissionBpsPlaceholder: numeric(defaults?.commissionBps ?? 4),
      maxConcurrentPositionsPlaceholder: numeric(defaults?.maxConcurrentPositions ?? 5),
    },
  };

  localCache.clear();
  localCache.set(cacheKey, model);
  return model;
}

export interface ResultBadgeViewModel {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

export interface EmptyStateViewModel {
  title: string;
  detail: string;
  availability: PanelAvailability;
}

export interface TradeReviewMetrics {
  totalTrades: HeroMetricEntry;
  wins: HeroMetricEntry;
  losses: HeroMetricEntry;
  breakeven: HeroMetricEntry;
  winRate: HeroMetricEntry;
  totalNetPnl: HeroMetricEntry;
  grossPnl: HeroMetricEntry;
  fees: HeroMetricEntry;
  avgWin: HeroMetricEntry;
  avgLoss: HeroMetricEntry;
  bestTrade: HeroMetricEntry;
  worstTrade: HeroMetricEntry;
}

export interface TradeRowReviewViewModel {
  tradeId: string;
  result: ResultBadgeViewModel;
  side: string;
  symbol: string;
  qty: string;
  entry: string;
  exit: string;
  tpSl: string;
  pnlNet: string;
  pnlRaw?: number;
  fees: string;
  reason: string;
  opened: string;
  closed: string;
  sourceRun: string;
  sourceMode: 'replay' | 'backtest';
  quickActions: { label: string; href: string }[];
}

export interface TradeInspectorViewModel {
  symbol: string;
  side: string;
  entry: string;
  exit: string;
  pnl: string;
  fees: string;
  reason: string;
  result: ResultBadgeViewModel;
  lifecycle: string;
  runSource: string;
  opened: string;
  closed: string;
  tpSl: string;
  links: { label: string; href: string }[];
  availability: PanelAvailability;
}

export interface OutcomeSummaryBlock {
  winsVsLosses: string;
  avgWin: string;
  avgLoss: string;
  pnlRange: string;
  reasonFrequency: string;
  exitReasonSummary: string;
  availability: PanelAvailability;
}

export interface ActiveFilterSummary {
  mode: string;
  run: string;
  result: string;
  reason: string;
  sourceCount: string;
  rowCount: string;
}

export interface TradesReviewViewModel {
  queryState: QueryStateViewModel;
  sectionRender: SectionRenderState;
  pagination: PaginationViewModel;
  filterSummary: ActiveFilterSummary;
  context: {
    replaySources: string;
    backtestSources: string;
    selectedSourceMode: string;
    selectedRunId: string;
    selectedDetailEndpoint: string;
    reviewStatus: string;
  };
  metrics: TradeReviewMetrics;
  investigationRail: {
    replaySources: { runId: string; status: string; createdAt: string }[];
    backtestSources: { runId: string; status: string; createdAt: string }[];
    filters: string[];
    reasonFilterAvailability: PanelAvailability;
    links: { label: string; href: string }[];
  };
  tradeRows: TradeRowReviewViewModel[];
  inspector: TradeInspectorViewModel;
  outcome: OutcomeSummaryBlock;
  timelineBridge: { title: string; notes: string[]; links: { label: string; href: string }[] };
  emptyState?: EmptyStateViewModel;
}

export interface RunInventoryRowViewModel {
  runId: string;
  mode: 'replay' | 'backtest';
  dataset: string;
  profile: string;
  timeframe: string;
  symbols: string;
  status: string;
  createdAt: string;
  completedAt: string;
  totalTrades: string;
  netPnl: string;
  netPnlRaw?: number;
  winRate: string;
  winRateRaw?: number;
  quickActions: { label: string; href: string }[];
}

export interface RunComparisonSummary {
  bestRun: string;
  worstRun: string;
  highestWinRate: string;
  highestTradeCount: string;
  latestCompletedRun: string;
  latestReplayRun: string;
  latestBacktestRun: string;
}

export interface RunsIntelligenceViewModel {
  queryState: QueryStateViewModel;
  sectionRender: SectionRenderState;
  pagination: PaginationViewModel;
  dispatchSummary: {
    selectedMode: string;
    selectedRun: string;
    inventoryState: string;
    nextAction: string;
  };
  context: {
    replayRunCount: string;
    backtestRunCount: string;
    totalRuns: string;
    selectedMode: string;
    latestRunTs: string;
    status: string;
  };
  metrics: HeroMetricEntry[];
  inventoryRows: RunInventoryRowViewModel[];
  comparison: RunComparisonSummary;
  healthPanel: {
    completedVsPending: string;
    replayVsBacktest: string;
    emptyGuidance: string;
    operatorNotes: string[];
  };
  crossNavigation: { label: string; href: string }[];
  emptyState?: EmptyStateViewModel;
}

function classifyResult(netPnl: number | undefined): ResultBadgeViewModel {
  if (netPnl === undefined) return { label: 'unknown', tone: 'neutral' };
  if (netPnl > 0) return { label: 'win', tone: 'good' };
  if (netPnl < 0) return { label: 'loss', tone: 'bad' };
  return { label: 'breakeven', tone: 'warn' };
}

function numericMaybe(value: unknown): number | undefined {
  return numberOrUndefined(value);
}

function avg(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function normalizeTradeSortField(value: unknown): 'pnl' | 'opened' | 'closed' | 'symbol' | 'result' | undefined {
  return value === 'pnl' || value === 'opened' || value === 'closed' || value === 'symbol' || value === 'result' ? value : undefined;
}

function normalizeRunSortField(value: unknown): 'createdAt' | 'completedAt' | 'netPnl' | 'winRate' | 'tradeCount' | undefined {
  return value === 'createdAt' || value === 'completedAt' || value === 'netPnl' || value === 'winRate' || value === 'tradeCount' ? value : undefined;
}

function applyRowSorting<T>(rows: T[], dir: SortDirection, read: (row: T) => string | number | undefined): T[] {
  const multiplier = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = read(a);
    const bv = read(b);
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * multiplier;
    return String(av).localeCompare(String(bv)) * multiplier;
  });
}

function parseTradeRowsFromRun(mode: 'replay' | 'backtest', runId: string, runDetail: GenericRecord | undefined): TradeRowReviewViewModel[] {
  const run = asRecord(runDetail?.run);
  const summary = asRecord(run?.summary);
  const fallbackSymbol = asArray(summary?.symbols).find((item): item is string => typeof item === 'string' && item.length > 0);
  const trades = asArray(run?.tradeSummaries)
    .filter((item): item is GenericRecord => typeof item === 'object' && item !== null)
    .slice(0, 500);

  return trades.map((trade, idx) => {
    const net = numericMaybe(trade.netPnl);
    const qty = numericMaybe(trade.qty ?? trade.quantity ?? asRecord(trade.position)?.qty);
    const entry = numericMaybe(trade.entryPrice ?? asRecord(trade.position)?.entryPrice);
    const exit = numericMaybe(trade.exitPrice ?? trade.closePrice ?? asRecord(trade.position)?.exitPrice);
    const fees = numericMaybe(trade.totalFees ?? trade.fees);
    const tp = numericMaybe(trade.takeProfitPrice ?? trade.tpPrice);
    const sl = numericMaybe(trade.stopLossPrice ?? trade.slPrice);
    return {
      tradeId: text(trade.tradeId, `${mode}-trade-${idx + 1}`),
      result: classifyResult(net),
      side: text(trade.side),
      symbol: text(trade.symbolCode ?? fallbackSymbol),
      qty: numeric(qty),
      entry: numeric(entry),
      exit: numeric(exit),
      tpSl: tp !== undefined || sl !== undefined ? `${numeric(tp)} / ${numeric(sl)}` : '—',
      pnlNet: money(net),
      pnlRaw: net,
      fees: money(fees),
      reason: text(trade.closeReason, 'n/a'),
      opened: iso(trade.openedAtTs),
      closed: iso(trade.closedAtTs),
      sourceRun: runId,
      sourceMode: mode,
      quickActions: [
        { label: 'Open Trades Review', href: '/trades' },
        { label: mode === 'replay' ? 'Inspect Replay' : 'Inspect Backtest', href: mode === 'replay' ? '/replay' : '/backtest' },
        { label: 'Open Run Detail', href: mode === 'replay' ? `/api/replay/${encodeURIComponent(runId)}` : `/api/backtests/${encodeURIComponent(runId)}` },
      ],
    };
  });
}

function parseRunRows(inventorySection: GenericRecord | undefined): RunInventoryRowViewModel[] {
  const items = asArray(inventorySection?.items).filter((item): item is GenericRecord => typeof item === 'object' && item !== null);
  return items.slice(0, 2500).map((run) => {
    const mode = run.mode === 'replay' ? 'replay' : 'backtest';
    const createdTs = numericMaybe(run.startedAtTs);
    const completedTs = numericMaybe(run.completedAtTs);
    const net = numericMaybe(run.netPnl);
    const winRate = numericMaybe(run.winRatePct);
    const runId = text(run.runId);
    return {
      runId,
      mode,
      dataset: text(run.datasetId),
      profile: text(run.profileCode),
      timeframe: text(run.timeframe),
      symbols: text(run.symbols && asArray(run.symbols).join(', '), '—'),
      status: text(run.status),
      createdAt: iso(createdTs),
      completedAt: iso(completedTs),
      totalTrades: numeric(run.totalTrades),
      netPnl: money(net),
      netPnlRaw: net,
      winRate: pct(winRate),
      winRateRaw: winRate,
      quickActions: [
        { label: 'Review trades', href: buildHref('/trades', { mode, runId }) },
        { label: 'Open replay', href: buildHref('/replay', { runId: mode === 'replay' ? runId : undefined }) },
        { label: 'Open backtest', href: buildHref('/backtest', { runId: mode === 'backtest' ? runId : undefined }) },
        { label: 'Detail endpoint', href: mode === 'replay' ? `/api/replay/${encodeURIComponent(runId)}` : `/api/backtests/${encodeURIComponent(runId)}` },
      ],
    };
  });
}

export function createTradesReviewViewModel(pagePayload: unknown): TradesReviewViewModel {
  const page = asRecord(pagePayload) ?? {};
  const sourceSection = findSection(page, 'trade_sources');
  const querySection = findSection(page, 'query_state');
  const replayCandidates = asArray(findSectionData(page, 'replay_run_candidates')).filter((item): item is GenericRecord => typeof item === 'object' && item !== null);
  const backtestCandidates = asArray(findSectionData(page, 'backtest_run_candidates')).filter((item): item is GenericRecord => typeof item === 'object' && item !== null);
  const selectedReplayRun = findSection(page, 'selected_replay_run');
  const selectedBacktestRun = findSection(page, 'selected_backtest_run');

  const selectedMode = text(sourceSection?.selectedSourceMode, 'none');
  const selectedRunId = text(sourceSection?.selectedRunId, 'none');
  const resultFilter = normalizeResultFilter(text(querySection?.result, 'all'));
  const sortField = normalizeTradeSortField(querySection?.sort);
  const sortDir = normalizeSortDirection(typeof querySection?.dir === 'string' ? querySection.dir : undefined);
  const reasonFilter = text(querySection?.reason, 'none');

  const detailEndpoint = selectedMode === 'replay'
    ? text(sourceSection?.replayDetailEndpointTemplate).replace('{runId}', selectedRunId)
    : selectedMode === 'backtest'
      ? text(sourceSection?.backtestDetailEndpointTemplate).replace('{runId}', selectedRunId)
      : '—';

  const replayRows = selectedReplayRun ? parseTradeRowsFromRun('replay', text(selectedRunId), selectedReplayRun) : [];
  const backtestRows = selectedBacktestRun ? parseTradeRowsFromRun('backtest', text(selectedRunId), selectedBacktestRun) : [];
  const sourceFiltered = selectedMode === 'replay' ? replayRows : selectedMode === 'backtest' ? backtestRows : [...backtestRows, ...replayRows];
  const resultFiltered = sourceFiltered.filter((row) => {
    if (resultFilter === 'all') return true;
    if (resultFilter === 'wins') return row.result.label === 'win';
    if (resultFilter === 'losses') return row.result.label === 'loss';
    return row.result.label === 'breakeven';
  });
  const sortedRows = sortField
    ? applyRowSorting(resultFiltered, sortDir, (row) => {
        if (sortField === 'pnl') return row.pnlRaw;
        if (sortField === 'opened') return row.opened;
        if (sortField === 'closed') return row.closed;
        if (sortField === 'symbol') return row.symbol;
        return row.result.label;
      })
    : resultFiltered;
  const selected = sortedRows[0];

  const pageNum = Math.max(1, Number(querySection?.page ?? 1));
  const pageSize = Math.max(10, Math.min(200, Number(querySection?.pageSize ?? 50)));
  const pagination = shapePagination(sortedRows.length, pageNum, pageSize);
  const pagedRows = sortedRows.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize);

  const wins = resultFiltered.filter((row) => row.pnlRaw !== undefined && row.pnlRaw > 0);
  const losses = resultFiltered.filter((row) => row.pnlRaw !== undefined && row.pnlRaw < 0);
  const breakeven = resultFiltered.filter((row) => row.pnlRaw !== undefined && row.pnlRaw === 0);
  const gross = wins.reduce((sum, row) => sum + (row.pnlRaw ?? 0), 0);
  const totalNet = resultFiltered.reduce((sum, row) => sum + (row.pnlRaw ?? 0), 0);
  const feeValues = resultFiltered.map((row) => Number(row.fees.replaceAll(',', ''))).filter((value) => Number.isFinite(value));
  const best = resultFiltered.slice().sort((a, b) => (b.pnlRaw ?? -Infinity) - (a.pnlRaw ?? -Infinity))[0];
  const worst = resultFiltered.slice().sort((a, b) => (a.pnlRaw ?? Infinity) - (b.pnlRaw ?? Infinity))[0];

  const reasonCounts = new Map<string, number>();
  for (const row of resultFiltered) {
    reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1);
  }
  const reasonSummary = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, count]) => `${reason}: ${count}`).join(' · ');

  return {
    queryState: {
      mode: selectedMode === 'replay' || selectedMode === 'backtest' ? selectedMode : 'all',
      runId: selectedRunId === 'none' ? undefined : selectedRunId,
      result: resultFilter,
      source: text(querySection?.selectedSource, ''),
      reason: reasonFilter === 'none' ? undefined : reasonFilter,
      sectionRender: { section: 'all' },
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: { field: sortField, dir: sortDir },
    },
    sectionRender: { section: 'all' },
    pagination,
    filterSummary: {
      mode: selectedMode,
      run: selectedRunId,
      result: resultFilter,
      reason: reasonFilter,
      sourceCount: `${replayCandidates.length + backtestCandidates.length}`,
      rowCount: `${resultFiltered.length}`,
    },
    context: {
      replaySources: numeric(sourceSection?.replayRunsAvailable),
      backtestSources: numeric(sourceSection?.backtestRunsAvailable),
      selectedSourceMode: selectedMode,
      selectedRunId,
      selectedDetailEndpoint: detailEndpoint,
      reviewStatus: resultFiltered.length > 0 ? 'review_ready' : 'empty',
    },
    metrics: {
      totalTrades: { key: 'total', label: 'Total Trades', value: numeric(resultFiltered.length), tone: 'neutral', availability: { status: resultFiltered.length ? 'available' : 'empty', reason: resultFiltered.length ? undefined : 'No trade summaries surfaced in selected run details.' } },
      wins: { key: 'wins', label: 'Wins', value: numeric(wins.length), tone: 'good', availability: { status: resultFiltered.length ? 'available' : 'empty' } },
      losses: { key: 'losses', label: 'Losses', value: numeric(losses.length), tone: 'bad', availability: { status: resultFiltered.length ? 'available' : 'empty' } },
      breakeven: { key: 'breakeven', label: 'Breakeven', value: numeric(breakeven.length), tone: 'warn', availability: { status: resultFiltered.length ? 'available' : 'empty' } },
      winRate: { key: 'winRate', label: 'Win Rate', value: resultFiltered.length ? pct((wins.length / resultFiltered.length) * 100) : '—', tone: 'neutral', availability: { status: resultFiltered.length ? 'available' : 'empty' } },
      totalNetPnl: { key: 'net', label: 'Total Net PnL', value: money(totalNet), tone: classifyResult(totalNet).tone, availability: { status: resultFiltered.length ? 'available' : 'empty' } },
      grossPnl: { key: 'gross', label: 'Gross PnL', value: money(gross), tone: classifyResult(gross).tone, availability: { status: resultFiltered.length ? 'available' : 'empty' } },
      fees: { key: 'fees', label: 'Fees', value: feeValues.length ? money(feeValues.reduce((sum, v) => sum + v, 0)) : 'not yet surfaced', tone: 'neutral', availability: feeValues.length ? { status: 'available' } : { status: 'unavailable', reason: 'Fees are not consistently surfaced on trade summaries.' } },
      avgWin: { key: 'avgWin', label: 'Average Win', value: money(avg(wins.map((row) => row.pnlRaw ?? 0))), tone: 'good', availability: wins.length ? { status: 'available' } : { status: 'empty', reason: 'No winning trades in current selection.' } },
      avgLoss: { key: 'avgLoss', label: 'Average Loss', value: money(avg(losses.map((row) => row.pnlRaw ?? 0))), tone: 'bad', availability: losses.length ? { status: 'available' } : { status: 'empty', reason: 'No losing trades in current selection.' } },
      bestTrade: { key: 'best', label: 'Best Trade', value: best ? money(best.pnlRaw) : '—', tone: best?.result.tone ?? 'neutral', availability: best ? { status: 'available' } : { status: 'empty' } },
      worstTrade: { key: 'worst', label: 'Worst Trade', value: worst ? money(worst.pnlRaw) : '—', tone: worst?.result.tone ?? 'neutral', availability: worst ? { status: 'available' } : { status: 'empty' } },
    },
    investigationRail: {
      replaySources: replayCandidates.map((row) => ({ runId: text(row.runId), status: text(row.status), createdAt: iso(row.startedAtTs) })),
      backtestSources: backtestCandidates.map((row) => ({ runId: text(row.runId), status: text(row.status), createdAt: iso(row.startedAtTs) })),
      filters: ['all', 'wins', 'losses', 'breakeven'],
      reasonFilterAvailability: { status: reasonFilter !== 'none' ? 'unavailable' : 'unavailable', reason: reasonFilter !== 'none' ? `Reason filter query detected (${reasonFilter}) but runtime endpoint support is pending.` : 'Reason filter requires dedicated query/filter endpoint support.' },
      links: [
        { label: 'Replay Lab', href: buildHref('/replay', { runId: selectedMode === 'replay' ? selectedRunId : undefined }) },
        { label: 'Backtest Lab', href: buildHref('/backtest', { runId: selectedMode === 'backtest' ? selectedRunId : undefined }) },
        { label: 'Runs Intelligence', href: buildHref('/runs', { mode: selectedMode, runId: selectedRunId }) },
      ],
    },
    tradeRows: pagedRows,
    inspector: selected ? {
      symbol: selected.symbol,
      side: selected.side,
      entry: selected.entry,
      exit: selected.exit,
      pnl: selected.pnlNet,
      fees: selected.fees,
      reason: selected.reason,
      result: selected.result,
      lifecycle: `Opened ${selected.opened} → Closed ${selected.closed}`,
      runSource: `${selected.sourceMode}:${selected.sourceRun}`,
      opened: selected.opened,
      closed: selected.closed,
      tpSl: selected.tpSl,
      links: selected.quickActions,
      availability: { status: 'available' },
    } : {
      symbol: '—', side: '—', entry: '—', exit: '—', pnl: '—', fees: '—', reason: '—', result: { label: 'unavailable', tone: 'neutral' }, lifecycle: 'No trade selected.', runSource: '—', opened: '—', closed: '—', tpSl: '—', links: [{ label: 'Open Runs', href: '/runs' }], availability: { status: 'empty', reason: 'No trade row available for inspector.' },
    },
    outcome: {
      winsVsLosses: `${wins.length} / ${losses.length}`,
      avgWin: money(avg(wins.map((row) => row.pnlRaw ?? 0))),
      avgLoss: money(avg(losses.map((row) => row.pnlRaw ?? 0))),
      pnlRange: best && worst ? `${money(worst.pnlRaw)} → ${money(best.pnlRaw)}` : '—',
      reasonFrequency: reasonSummary || 'not yet surfaced',
      exitReasonSummary: reasonSummary || 'not yet surfaced',
      availability: resultFiltered.length ? { status: 'available' } : { status: 'empty', reason: 'Outcome distribution requires surfaced trade rows.' },
    },
    timelineBridge: {
      title: selectedMode === 'replay' ? 'reviewing replay run' : selectedMode === 'backtest' ? 'reviewing backtest run' : 'cross-source review',
      notes: [
        resultFilter === 'all' ? 'Reviewing all outcomes for selected run/source.' : `filtering ${resultFilter} trades`,
        'Use Replay Lab for bar-by-bar lifecycle and control timeline investigation.',
        'Use Backtest Lab for deterministic aggregate research and regime-level checks.',
      ],
      links: [
        { label: 'Open Replay Lab', href: buildHref('/replay', { runId: selectedMode === 'replay' ? selectedRunId : undefined }) },
        { label: 'Open Backtest Lab', href: buildHref('/backtest', { runId: selectedMode === 'backtest' ? selectedRunId : undefined }) },
        { label: 'Live Positions', href: buildHref('/live', { section: 'positions' }) },
        { label: 'Safety Incidents', href: buildHref('/safety', { view: 'incidents' }) },
      ],
    },
    emptyState: resultFiltered.length ? undefined : {
      title: 'No Trades Surfaced Yet',
      detail: 'Selected replay/backtest run details did not expose tradeSummaries. Launch or complete runs to populate trade review.',
      availability: { status: 'empty' },
    },
  };
}

export function createRunsIntelligenceViewModel(pagePayload: unknown): RunsIntelligenceViewModel {
  const page = asRecord(pagePayload) ?? {};
  const replayRuns = findSection(page, 'replay_runs');
  const backtestRuns = findSection(page, 'backtest_runs');
  const inventory = findSection(page, 'run_inventory');
  const querySection = findSection(page, 'query_state');
  const dispatchActions = findSection(page, 'run_dispatch_actions');
  const rows = parseRunRows(inventory);

  const mode = text(querySection?.mode, 'all');
  const sortField = normalizeRunSortField(querySection?.sort);
  const sortDir = normalizeSortDirection(typeof querySection?.dir === 'string' ? querySection.dir : undefined);
  const selectedRunId = text(querySection?.selectedRunId, rows[0]?.runId ?? 'none');
  const sortedRows = sortField
    ? applyRowSorting(rows, sortDir, (row) => {
        if (sortField === 'createdAt') return row.createdAt;
        if (sortField === 'completedAt') return row.completedAt;
        if (sortField === 'netPnl') return row.netPnlRaw;
        if (sortField === 'winRate') return row.winRateRaw;
        return Number(row.totalTrades.replaceAll(',', ''));
      })
    : rows;
  const selectedRun = sortedRows.find((row) => row.runId === selectedRunId);

  const pageNum = Math.max(1, Number(querySection?.page ?? 1));
  const pageSize = Math.max(10, Math.min(200, Number(querySection?.pageSize ?? 50)));
  const pagination = shapePagination(sortedRows.length, pageNum, pageSize);
  const pageRows = sortedRows.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize);

  const completed = rows.filter((row) => row.status === 'completed').length;
  const failed = rows.filter((row) => row.status.includes('fail') || row.status.includes('error')).length;
  const pending = rows.length - completed - failed;
  const replayCount = rows.filter((row) => row.mode === 'replay').length;
  const backtestCount = rows.filter((row) => row.mode === 'backtest').length;
  const pnlVals = rows.map((row) => row.netPnlRaw).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const winRateVals = rows.map((row) => row.winRateRaw).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const best = rows.slice().sort((a, b) => (b.netPnlRaw ?? -Infinity) - (a.netPnlRaw ?? -Infinity))[0];
  const worst = rows.slice().sort((a, b) => (a.netPnlRaw ?? Infinity) - (b.netPnlRaw ?? Infinity))[0];
  const highestWr = rows.slice().sort((a, b) => (b.winRateRaw ?? -Infinity) - (a.winRateRaw ?? -Infinity))[0];
  const highestTrades = rows.slice().sort((a, b) => Number(b.totalTrades.replaceAll(',', '')) - Number(a.totalTrades.replaceAll(',', '')))[0];
  const latestCompleted = rows.filter((row) => row.completedAt !== '—').sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
  const latestReplay = rows.filter((row) => row.mode === 'replay').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const latestBacktest = rows.filter((row) => row.mode === 'backtest').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const latestTs = rows.map((row) => row.completedAt !== '—' ? row.completedAt : row.createdAt).find((v) => v !== '—') ?? '—';

  return {
    queryState: {
      mode: mode === 'replay' || mode === 'backtest' ? mode : 'all',
      runId: selectedRun?.runId,
      result: 'all',
      sectionRender: { section: 'all' },
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: { field: sortField, dir: sortDir },
    },
    sectionRender: { section: 'all' },
    pagination,
    dispatchSummary: {
      selectedMode: mode,
      selectedRun: selectedRun?.runId ?? 'none',
      inventoryState: rows.length ? 'inventory populated' : 'inventory empty',
      nextAction: selectedRun ? 'Review trades or open run-specific lab links.' : 'Select a run to dispatch into trades/replay/backtest workflows.',
    },
    context: {
      replayRunCount: numeric(asArray(replayRuns?.runs).length),
      backtestRunCount: numeric(asArray(backtestRuns?.runs).length),
      totalRuns: numeric(rows.length),
      selectedMode: mode,
      latestRunTs: latestTs,
      status: rows.length ? 'inventory_ready' : 'empty',
    },
    metrics: [
      { key: 'total', label: 'Total Runs', value: numeric(rows.length), tone: 'neutral', availability: { status: rows.length ? 'available' : 'empty' } },
      { key: 'completed', label: 'Completed Runs', value: numeric(completed), tone: 'good', availability: { status: rows.length ? 'available' : 'empty' } },
      { key: 'failed', label: 'Failed Runs', value: numeric(failed), tone: failed > 0 ? 'bad' : 'neutral', availability: { status: rows.length ? 'available' : 'empty' } },
      { key: 'replay', label: 'Replay Count', value: numeric(replayCount), tone: 'neutral', availability: { status: rows.length ? 'available' : 'empty' } },
      { key: 'backtest', label: 'Backtest Count', value: numeric(backtestCount), tone: 'neutral', availability: { status: rows.length ? 'available' : 'empty' } },
      { key: 'bestPnl', label: 'Best Surfaced PnL', value: best ? money(best.netPnlRaw) : '—', tone: best && (best.netPnlRaw ?? 0) > 0 ? 'good' : 'neutral', availability: best ? { status: 'available' } : { status: 'empty' } },
      { key: 'worstPnl', label: 'Worst Surfaced PnL', value: worst ? money(worst.netPnlRaw) : '—', tone: worst && (worst.netPnlRaw ?? 0) < 0 ? 'bad' : 'neutral', availability: worst ? { status: 'available' } : { status: 'empty' } },
      { key: 'avgPnl', label: 'Average Surfaced PnL', value: money(avg(pnlVals)), tone: avg(pnlVals) && avg(pnlVals)! > 0 ? 'good' : 'warn', availability: pnlVals.length ? { status: 'available' } : { status: 'unavailable', reason: 'Average PnL requires surfaced run PnL values.' } },
      { key: 'avgWinRate', label: 'Average Win Rate', value: pct(avg(winRateVals)), tone: 'neutral', availability: winRateVals.length ? { status: 'available' } : { status: 'unavailable', reason: 'Average win rate unavailable when run payload lacks winRatePct.' } },
      { key: 'reviewReady', label: 'Review-Ready Runs', value: numeric(completed), tone: 'good', availability: { status: rows.length ? 'available' : 'empty' } },
    ],
    inventoryRows: pageRows,
    comparison: {
      bestRun: best ? `${best.runId} (${best.netPnl})` : '—',
      worstRun: worst ? `${worst.runId} (${worst.netPnl})` : '—',
      highestWinRate: highestWr ? `${highestWr.runId} (${highestWr.winRate})` : '—',
      highestTradeCount: highestTrades ? `${highestTrades.runId} (${highestTrades.totalTrades})` : '—',
      latestCompletedRun: latestCompleted ? `${latestCompleted.runId} (${latestCompleted.completedAt})` : '—',
      latestReplayRun: latestReplay ? `${latestReplay.runId} (${latestReplay.createdAt})` : '—',
      latestBacktestRun: latestBacktest ? `${latestBacktest.runId} (${latestBacktest.createdAt})` : '—',
    },
    healthPanel: {
      completedVsPending: `${completed} completed / ${pending} pending`,
      replayVsBacktest: `${replayCount} replay / ${backtestCount} backtest`,
      emptyGuidance: rows.length ? 'Inventory populated. Use quick actions to pivot into run/trade detail.' : 'No runs surfaced yet. Launch replay/backtest smoke flows to populate inventory.',
      operatorNotes: [
        `viewing ${mode} mode inventory`,
        selectedRun ? `selected run ${selectedRun.runId}` : 'no run selected — showing default inventory state',
        text(querySection?.contextNote, 'Dispatch into trades/replay/backtest using quick actions.'),
      ],
    },
    crossNavigation: [
      { label: 'Open Trades Review', href: buildHref('/trades', { mode, runId: selectedRun?.runId }) },
      { label: 'Open Replay Lab', href: buildHref('/replay', { runId: selectedRun?.mode === 'replay' ? selectedRun.runId : undefined }) },
      { label: 'Open Backtest Lab', href: buildHref('/backtest', { runId: selectedRun?.mode === 'backtest' ? selectedRun.runId : undefined }) },
      { label: 'Live Positions', href: buildHref('/live', { section: 'positions' }) },
      { label: 'Safety Incidents', href: buildHref('/safety', { view: 'incidents' }) },
    ],
    emptyState: rows.length ? undefined : {
      title: 'No Runs in Inventory',
      detail: 'Run inventory is empty. Start replay/backtest runs to unlock comparison and dispatch workflows.',
      availability: { status: 'empty' },
    },
  };
}
