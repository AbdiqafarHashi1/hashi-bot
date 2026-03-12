import type { ReplayControlAction } from '@hashi-bot/backtest';

import type { ReplayApiService } from '../../services/replay-api.service.js';
import type { Phase2QueryService } from '../../services/phase2-query.service.js';
import {
  createCardContainer,
  createChartWrapper,
  createDataTableWrapper,
  createDetailPanel,
  createEmptyState,
  createMetricRow,
  createPageHeader,
  createSegmentedControl,
  createTimelineFeed,
} from '../ui/index.js';

export interface ReplayWorkstationModel {
  kind: 'replay_workstation';
  pageHeader: ReturnType<typeof createPageHeader>;
  runWorkbench: {
    runSelection: {
      availableRuns: Array<{ runId: string; status: string; startedAtTs?: number; symbols: string[] }>;
      selectedRunId?: string;
      runCreateDefaults: {
        datasetId?: string;
        symbolCodes: string[];
        profileCode?: string;
        timeframe?: string;
        replaySpeed: number;
      };
    };
    controls: {
      controlPanelTitle: string;
      controls: Array<{ label: string; action: ReplayControlAction; enabled: boolean; intent?: 'default' | 'primary' | 'danger' }>;
      speedControl: ReturnType<typeof createSegmentedControl>;
      jumpTargets: { indexHint: number; timestampHint?: number };
    };
    cursorCard: ReturnType<typeof createCardContainer>;
    contextCard: ReturnType<typeof createCardContainer>;
    snapshotCard: ReturnType<typeof createCardContainer>;
  };
  stateInspection: {
    tradesTable: ReturnType<typeof createDataTableWrapper>;
    timeline: ReturnType<typeof createTimelineFeed>;
    decisionPanel: ReturnType<typeof createDetailPanel>;
    chartRegion: ReturnType<typeof createChartWrapper>;
  };
  ctas: Array<{ label: string; href: string; intent: 'default' | 'primary' | 'danger' }>;
  emptyState?: ReturnType<typeof createEmptyState>;
  notes: string[];
}

export function buildReplayWorkstationModel(input: {
  replayApiService: ReplayApiService;
  queryService: Phase2QueryService;
  runId?: string;
}): ReplayWorkstationModel {
  const runs = input.replayApiService.listRuns().runs;
  const selectedRunId = input.runId ?? runs.at(0)?.runId;
  const selectedRun = selectedRunId ? input.replayApiService.getRun(selectedRunId) : undefined;

  const datasets = input.queryService.getDatasets();
  const symbols = input.queryService.getSymbols();
  const config = input.queryService.getConfig();

  const replayState = selectedRun?.status === 'ok' ? selectedRun.run.replayState : undefined;
  const playbackState = replayState?.playbackState ?? 'idle';

  const controlDisabled = !replayState;
  const controls = [
    { label: 'Step +1', action: { type: 'step', steps: 1 } as ReplayControlAction, enabled: !controlDisabled && playbackState !== 'completed' },
    { label: 'Play', action: { type: 'play' } as ReplayControlAction, enabled: !controlDisabled && playbackState !== 'playing', intent: 'primary' as const },
    { label: 'Pause', action: { type: 'pause' } as ReplayControlAction, enabled: !controlDisabled && playbackState === 'playing' },
    { label: 'Reset', action: { type: 'reset' } as ReplayControlAction, enabled: !controlDisabled },
    {
      label: 'Jump to current index',
      action: { type: 'jump_to_index', barIndex: replayState?.cursor.barIndex ?? 0 } as ReplayControlAction,
      enabled: !controlDisabled,
    },
  ];

  const speedOptions = [0.5, 1, 2, 5].map((speed) => ({ value: String(speed), label: `${speed}x` }));
  const speedSelected = String(replayState?.playbackSpeed ?? 1);

  const latestSignal = replayState?.latestSignals.at(0);
  const latestRegime = replayState?.latestRegimeAssessments.at(0);
  const latestSnapshot = replayState?.latestSnapshots.at(0);

  const trades = selectedRun?.status === 'ok' ? (selectedRun.run.tradeSummaries ?? []) : [];
  const timelineEvents = replayState?.recentTimelineEvents ?? [];

  const model: ReplayWorkstationModel = {
    kind: 'replay_workstation',
    pageHeader: createPageHeader({
      title: 'Replay Inspection Workstation',
      description: 'Interactive replay controls, state inspection, and decision-context review for historical learning.',
      statuses: [playbackState === 'playing' ? 'replay' : 'paused'],
      actions: [
        { key: 'to-overview', label: 'Overview', actionId: 'nav:overview' },
        { key: 'to-backtest', label: 'Backtest', actionId: 'nav:backtest' },
        { key: 'to-signals', label: 'Signals', actionId: 'nav:signals', intent: 'primary' },
      ],
    }),
    runWorkbench: {
      runSelection: {
        availableRuns: runs.map((run) => ({ runId: run.runId, status: run.status, startedAtTs: run.startedAtTs, symbols: run.symbols })),
        selectedRunId,
        runCreateDefaults: {
          datasetId: datasets.datasets[0]?.id,
          symbolCodes: symbols.symbols.slice(0, 8).map((symbol) => symbol.symbolCode),
          profileCode: 'GROWTH_HUNTER',
          timeframe: datasets.datasets[0]?.timeframe,
          replaySpeed: 1,
        },
      },
      controls: {
        controlPanelTitle: 'Replay Controls',
        controls,
        speedControl: createSegmentedControl('replay_speed', speedOptions, speedSelected),
        jumpTargets: { indexHint: replayState?.cursor.barIndex ?? 0, timestampHint: replayState?.cursor.timestamp },
      },
      cursorCard: createCardContainer(
        [
          `Bar index: ${replayState?.cursor.barIndex ?? 'n/a'}`,
          `Timestamp: ${replayState?.cursor.timestamp ?? 'n/a'}`,
          `Cursor symbol: ${replayState?.cursor.symbolCode ?? 'n/a'}`,
          `Playback state: ${playbackState}`,
        ],
        'Current Cursor',
        playbackState === 'playing' ? 'elevated' : 'default'
      ),
      contextCard: createCardContainer(
        [
          `Scope mode: ${replayState?.symbolScope.mode ?? 'n/a'}`,
          `Primary symbol: ${replayState?.symbolScope.primarySymbol ?? 'n/a'}`,
          `Watchlist size: ${replayState?.symbolScope.symbols.length ?? 0}`,
          `Supported replay mode flag: ${String(config.supports.replay)}`,
        ],
        'Symbol / Watchlist Context',
        'default'
      ),
      snapshotCard: createCardContainer(
        [
          `Latest snapshot symbol: ${latestSnapshot?.symbolCode ?? 'n/a'}`,
          `Latest regime: ${latestRegime?.regimeState ?? 'n/a'}`,
          `Tradable: ${latestRegime ? String(latestRegime.isTradable) : 'n/a'}`,
          `Latest signal: ${latestSignal?.setupCode ?? 'n/a'} (${latestSignal?.side ?? 'n/a'})`,
        ],
        'Snapshot / Regime / Signal',
        'elevated'
      ),
    },
    stateInspection: {
      tradesTable: createDataTableWrapper('Current + Closed Trades', [
        { key: 'tradeId', label: 'Trade ID', width: '180px' },
        { key: 'symbol', label: 'Symbol', width: '120px' },
        { key: 'side', label: 'Side', width: '100px' },
        { key: 'state', label: 'State', width: '140px' },
        { key: 'netPnl', label: 'Net PnL', width: '120px' },
      ], undefined, { density: 'compact', stickyHeader: true, stripedRows: true, horizontalScroll: 'auto' }),
      timeline: createTimelineFeed(
        'Recent Replay Events',
        timelineEvents.slice(0, 40).map((event) => ({
          timestamp: String(event.ts),
          label: `${event.type} @${event.barIndex}`,
          description: event.message ?? 'No event message.',
          status: event.type === 'trade_closed' ? 'negative' : event.type === 'signal_emitted' ? 'positive' : 'replay',
        }))
      ),
      decisionPanel: createDetailPanel('Decision Reasoning Inspector', [
        {
          title: 'Latest signal reasoning',
          rows: [
            createMetricRow('Setup', latestSignal?.setupCode ?? 'n/a'),
            createMetricRow('Side', latestSignal?.side ?? 'n/a', latestSignal?.side === 'long' ? 'long' : latestSignal?.side === 'short' ? 'short' : undefined),
            createMetricRow('Score', String(latestSignal?.score ?? 'n/a')),
            createMetricRow('Regime state', latestRegime?.regimeState ?? 'n/a', latestRegime?.isTradable ? 'healthy' : 'degraded'),
          ],
        },
        {
          title: 'Trade outcome summary',
          rows: [
            createMetricRow('Open trades', String(replayState?.openTrades.length ?? 0), (replayState?.openTrades.length ?? 0) > 0 ? 'live' : 'paused'),
            createMetricRow('Closed trades', String(replayState?.closedTradesSummary.totalClosed ?? 0)),
            createMetricRow('Win rate', `${replayState?.closedTradesSummary.winRatePct ?? 0}%`),
            createMetricRow('Net PnL', String(replayState?.closedTradesSummary.netPnl ?? 0), (replayState?.closedTradesSummary.netPnl ?? 0) >= 0 ? 'positive' : 'negative'),
          ],
        },
      ]),
      chartRegion: createChartWrapper(
        'Replay Chart Region (Expandable)',
        'Reserved layout slot for forthcoming multi-panel candle/signal/trade overlays.',
        'Price / Indicator'
      ),
    },
    ctas: [
      { label: 'Create Replay Run', href: '/api/replay', intent: 'primary' },
      { label: 'Open Signals View', href: '/signals', intent: 'default' },
      { label: 'Open Safety View', href: '/safety', intent: 'danger' },
    ],
    emptyState: runs.length === 0 ? createEmptyState('No Replay Runs Yet', 'Create a replay run to begin interactive inspection.') : undefined,
    notes: [
      'Replay state is sourced from persisted run details and in-memory active sessions; no fake streaming is implied.',
      'Controls map directly to replay engine control actions (step/play/pause/reset/jump/set_speed).',
      `Current selected run trade rows available: ${trades.length}.`,
      `Run creation defaults are derived from dataset/symbol repositories (${datasets.datasets.length} datasets, ${symbols.symbols.length} symbols).`,
    ],
  };

  return model;
}
