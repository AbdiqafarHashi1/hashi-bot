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
  const sections = asArray(page.sections);
  for (const section of sections) {
    const item = asRecord(section);
    if (item?.key === key) {
      return asRecord(item.data);
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
