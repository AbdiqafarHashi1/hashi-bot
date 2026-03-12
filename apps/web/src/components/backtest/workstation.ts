import type { InstantBacktestRequest } from '@hashi-bot/backtest';

import type { InstantBacktestService } from '../../services/instant-backtest.service.js';
import type { Phase2QueryService } from '../../services/phase2-query.service.js';
import {
  createCardContainer,
  createChartWrapper,
  createDataTableWrapper,
  createDetailPanel,
  createEmptyState,
  createFilterBar,
  createKpiCard,
  createMetricRow,
  createPageHeader,
  createTimelineFeed,
} from '../ui/index.js';

export interface BacktestWorkstationModel {
  kind: 'backtest_workstation';
  pageHeader: ReturnType<typeof createPageHeader>;
  launchFlow: {
    launchFormDefaults: InstantBacktestRequest;
    datasetSelector: ReturnType<typeof createFilterBar>;
    profileSelector: ReturnType<typeof createFilterBar>;
    watchlistSelector: ReturnType<typeof createFilterBar>;
    launchAction: { label: string; endpoint: string; method: 'POST' };
  };
  runArea: {
    recentRunsCard: ReturnType<typeof createCardContainer>;
    selectedRunSummaryCard: ReturnType<typeof createCardContainer>;
    comparisonContextCard: ReturnType<typeof createCardContainer>;
  };
  metrics: {
    headlineCards: Array<ReturnType<typeof createKpiCard>>;
    equityCurve: ReturnType<typeof createChartWrapper>;
    drawdownCurve: ReturnType<typeof createChartWrapper>;
    perSymbolSummary: ReturnType<typeof createDataTableWrapper>;
    perSetupSummary: ReturnType<typeof createDataTableWrapper>;
    tradeSummaryTable: ReturnType<typeof createDataTableWrapper>;
    runTimeline: ReturnType<typeof createTimelineFeed>;
    selectedRunInspection: ReturnType<typeof createDetailPanel>;
  };
  emptyState?: ReturnType<typeof createEmptyState>;
  notes: string[];
}

export function buildBacktestWorkstationModel(input: {
  instantBacktestService: InstantBacktestService;
  queryService: Phase2QueryService;
  runId?: string;
}): BacktestWorkstationModel {
  const configs = input.queryService.getBacktestConfigs();
  const runs = input.instantBacktestService.listRuns().runs;
  const selectedRunId = input.runId ?? runs.at(0)?.runId;

  const selectedRunCore = selectedRunId ? input.instantBacktestService.getRun(selectedRunId) : undefined;
  const selectedRunExtended = selectedRunId ? input.queryService.getBacktestRun(selectedRunId) : undefined;

  const selectedSummary = selectedRunCore?.status === 'ok' ? selectedRunCore.run.summary : undefined;
  const selectedMetrics = selectedRunExtended?.status === 'ok' ? selectedRunExtended.run.metrics : undefined;
  const selectedEquity = selectedRunExtended?.status === 'ok' ? selectedRunExtended.run.equity : [];
  const selectedTrades = selectedRunExtended?.status === 'ok' ? selectedRunExtended.run.tradeLogSummary : [];

  const launchDefaults: InstantBacktestRequest = {
    datasetId: (configs.datasets[0]?.id ?? 'dataset-unavailable') as InstantBacktestRequest['datasetId'],
    profileCode: configs.profiles[0] ?? 'GROWTH_HUNTER',
    timeframe: configs.datasets[0]?.timeframe ?? '1m',
    symbols: configs.datasets.map((dataset) => dataset.symbolCode).slice(0, 8),
    initialBalance: configs.defaults.initialBalance,
    slippageBps: configs.defaults.slippageBps,
    commissionBps: configs.defaults.commissionBps,
    maxConcurrentPositions: configs.defaults.maxConcurrentPositions,
  };

  const perSetupDerived = Object.values(
    selectedTrades.reduce(
      (acc, trade) => {
        const row = acc[trade.setupCode] ?? {
          setupCode: trade.setupCode,
          trades: 0,
          netPnl: 0,
          wins: 0,
          losses: 0,
        };
        row.trades += 1;
        row.netPnl += trade.netPnl ?? 0;
        if ((trade.netPnl ?? 0) >= 0) {
          row.wins += 1;
        } else {
          row.losses += 1;
        }
        acc[trade.setupCode] = row;
        return acc;
      },
      {} as Record<string, { setupCode: string; trades: number; netPnl: number; wins: number; losses: number }>
    )
  );

  return {
    kind: 'backtest_workstation',
    pageHeader: createPageHeader({
      title: 'Backtest Experiment Workstation',
      description: 'Launch instant experiments, compare outcomes, and inspect run-level metrics with practical research rigor.',
      statuses: ['backtest'],
      actions: [
        { key: 'to-overview', label: 'Overview', actionId: 'nav:overview' },
        { key: 'to-replay', label: 'Replay', actionId: 'nav:replay', intent: 'primary' },
        { key: 'to-signals', label: 'Signals', actionId: 'nav:signals' },
      ],
    }),
    launchFlow: {
      launchFormDefaults: launchDefaults,
      datasetSelector: createFilterBar([
        {
          key: 'dataset',
          label: 'Dataset',
          values: configs.datasets.map((dataset) => `${dataset.id} (${dataset.symbolCode}, ${dataset.timeframe})`),
          selected: configs.datasets[0]?.id,
        },
      ]),
      profileSelector: createFilterBar([
        {
          key: 'profile',
          label: 'Profile',
          values: configs.profiles,
          selected: configs.profiles[0],
        },
      ]),
      watchlistSelector: createFilterBar([
        {
          key: 'symbols',
          label: 'Watchlist Symbols',
          values: configs.datasets.map((dataset) => dataset.symbolCode),
          selected: configs.datasets[0]?.symbolCode,
        },
      ]),
      launchAction: { label: 'Launch Instant Backtest', endpoint: '/api/backtests', method: 'POST' },
    },
    runArea: {
      recentRunsCard: createCardContainer(
        runs.slice(0, 12).map((run) => `${run.runId} | ${run.status} | trades=${run.totalTrades ?? 0} | net=${run.netPnl ?? 0}`),
        'Recent Backtest Runs',
        'default'
      ),
      selectedRunSummaryCard: createCardContainer(
        [
          `Selected run: ${selectedSummary?.runId ?? 'none'}`,
          `Profile/timeframe: ${selectedSummary ? `${selectedSummary.profileCode} / ${selectedSummary.timeframe}` : 'n/a'}`,
          `Symbols: ${selectedSummary?.symbols.join(', ') ?? 'n/a'}`,
          `Status: ${selectedSummary?.status ?? 'n/a'}`,
          `Started: ${selectedSummary?.startedAtTs ?? 'n/a'}`,
          `Completed: ${selectedSummary?.completedAtTs ?? 'n/a'}`,
        ],
        'Selected Run Summary',
        'elevated'
      ),
      comparisonContextCard: createCardContainer(
        [
          `Comparison candidates: ${runs.length}`,
          `Current metric basis: run summary + backtest repository detail`,
          `Equity points available: ${selectedEquity.length}`,
          `Trade rows available: ${selectedTrades.length}`,
        ],
        'Comparison Context',
        'elevated'
      ),
    },
    metrics: {
      headlineCards: [
        createKpiCard('Net PnL', String(selectedMetrics?.netPnl ?? 0), undefined, (selectedMetrics?.netPnl ?? 0) >= 0 ? 'positive' : 'negative'),
        createKpiCard('Return %', `${selectedMetrics?.returnPct ?? 0}%`, undefined, (selectedMetrics?.returnPct ?? 0) >= 0 ? 'positive' : 'negative'),
        createKpiCard('Win Rate', `${selectedMetrics?.winRatePct ?? 0}%`, undefined, (selectedMetrics?.winRatePct ?? 0) >= 50 ? 'positive' : 'negative'),
        createKpiCard('Max Drawdown %', `${selectedMetrics?.maxDrawdownPct ?? 0}%`, undefined, (selectedMetrics?.maxDrawdownPct ?? 0) < 20 ? 'healthy' : 'degraded'),
      ],
      equityCurve: createChartWrapper(
        'Equity Curve',
        `Points: ${selectedEquity.length}. Uses BacktestRunResult.equity snapshots from repository details.`,
        'Equity',
        { height: 'lg', showLegend: true, loadingBars: 10 }
      ),
      drawdownCurve: createChartWrapper(
        'Drawdown Curve',
        `Drawdown values are read from equity snapshots (drawdownPct).`,
        'Drawdown %',
        { height: 'md', showLegend: false, loadingBars: 8 }
      ),
      perSymbolSummary: createDataTableWrapper('Per-Symbol Summary', [
        { key: 'symbolCode', label: 'Symbol', width: '120px' },
        { key: 'trades', label: 'Trades', width: '100px' },
        { key: 'winRatePct', label: 'Win Rate %', width: '120px' },
        { key: 'netPnl', label: 'Net PnL', width: '120px' },
      ], undefined, { density: 'compact', stickyHeader: true, stripedRows: true, horizontalScroll: 'auto' }),
      perSetupSummary: createDataTableWrapper('Per-Setup Summary', [
        { key: 'setupCode', label: 'Setup', width: '240px' },
        { key: 'trades', label: 'Trades', width: '100px' },
        { key: 'wins', label: 'Wins', width: '100px' },
        { key: 'losses', label: 'Losses', width: '100px' },
        { key: 'netPnl', label: 'Net PnL', width: '120px' },
      ], undefined, { density: 'compact', stickyHeader: true, stripedRows: true, horizontalScroll: 'auto' }),
      tradeSummaryTable: createDataTableWrapper('Trade Summary', [
        { key: 'tradeId', label: 'Trade ID', width: '180px' },
        { key: 'symbolCode', label: 'Symbol', width: '120px' },
        { key: 'side', label: 'Side', width: '100px' },
        { key: 'setupCode', label: 'Setup', width: '220px' },
        { key: 'netPnl', label: 'Net PnL', width: '120px' },
      ], undefined, { density: 'compact', stickyHeader: true, stripedRows: true, horizontalScroll: 'auto' }),
      runTimeline: createTimelineFeed(
        'Recent Run Timeline',
        runs.slice(0, 20).map((run) => ({
          timestamp: String(run.completedAtTs ?? run.startedAtTs ?? 0),
          label: `${run.runId} • ${run.profileCode}`,
          description: `status=${run.status}, trades=${run.totalTrades ?? 0}, net=${run.netPnl ?? 0}`,
          status: (run.netPnl ?? 0) >= 0 ? 'positive' : 'negative',
        }))
      ),
      selectedRunInspection: createDetailPanel('Selected Run Inspection', [
        {
          title: 'Run metrics',
          rows: [
            createMetricRow('Total trades', String(selectedMetrics?.totalTrades ?? 0)),
            createMetricRow('Wins/Losses', `${selectedMetrics?.wins ?? 0}/${selectedMetrics?.losses ?? 0}`),
            createMetricRow('Profit factor', String(selectedMetrics?.profitFactor ?? 'n/a')),
            createMetricRow('Expectancy', String(selectedMetrics?.expectancy ?? 'n/a')),
            createMetricRow('Average R', String(selectedMetrics?.averageRMultiple ?? 'n/a')),
          ],
        },
        {
          title: 'Comparison slices',
          rows: [
            createMetricRow('Per-symbol rows', String(selectedMetrics?.perSymbol.length ?? 0)),
            createMetricRow('Per-setup rows (repo)', String(selectedMetrics?.perSetup.length ?? 0)),
            createMetricRow('Per-setup rows (derived)', String(perSetupDerived.length)),
            createMetricRow('Trade rows', String(selectedTrades.length)),
          ],
        },
      ]),
    },
    emptyState:
      runs.length === 0
        ? createEmptyState(
            'No Backtest Runs Yet',
            'Launch an instant backtest to populate metrics, equity curve, drawdown, and trade summaries.'
          )
        : undefined,
    notes: [
      'Launch flow uses existing /api/backtests endpoint and InstantBacktestRequest fields only.',
      'Equity and drawdown views are sourced from backtest repository detail when available for the selected run.',
      'Per-symbol/per-setup sections use existing metrics where present; setup fallback derives strictly from trade summary rows.',
      'No vanity metrics are introduced; all displayed values originate from existing run/config/symbol datasets.',
    ],
  };
}
