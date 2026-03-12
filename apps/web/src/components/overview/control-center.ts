import type { FoundationPage } from '../../pages/page-types.js';
import type { LiveHealthResponse, LiveIncidentsResponse, LiveOrdersResponse, LivePositionsResponse, LiveSafetyResponse, LiveStatusResponse } from '../../services/live-status.service.js';
import type { Phase2QueryService } from '../../services/phase2-query.service.js';
import type { InstantBacktestService } from '../../services/instant-backtest.service.js';
import type { ReplayApiService } from '../../services/replay-api.service.js';
import {
  createCardContainer,
  createDataTableWrapper,
  createFilterBar,
  createKpiCard,
  createMetricRow,
  createPageHeader,
  createSectionHeader,
  createStatusBadge,
  createTimelineFeed,
} from '../ui/index.js';

export interface OverviewControlCenterModel {
  kind: 'overview_control_center';
  criticalStatusStrip: {
    modeBadge: ReturnType<typeof createStatusBadge>;
    healthBadge: ReturnType<typeof createStatusBadge>;
    safetyBadge: ReturnType<typeof createStatusBadge>;
    message: string;
  };
  pageHeader: ReturnType<typeof createPageHeader>;
  primaryCards: Array<ReturnType<typeof createCardContainer>>;
  keyMetrics: Array<ReturnType<typeof createKpiCard>>;
  recentActivity: {
    signalsTable: ReturnType<typeof createDataTableWrapper>;
    runsTimeline: ReturnType<typeof createTimelineFeed>;
    incidentsTimeline: ReturnType<typeof createTimelineFeed>;
  };
  detailSections: Array<{
    header: ReturnType<typeof createSectionHeader>;
    metrics: Array<ReturnType<typeof createMetricRow>>;
  }>;
  ctas: Array<{ label: string; href: string; intent: 'default' | 'primary' | 'danger' }>;
  sourceFootnotes: string[];
}

export async function buildOverviewControlCenterModel(input: {
  overviewPage: FoundationPage;
  queryService: Phase2QueryService;
  instantBacktestService: InstantBacktestService;
  replayApiService: ReplayApiService;
  live: LiveStatusResponse;
  health: LiveHealthResponse;
  incidents: LiveIncidentsResponse;
  orders: LiveOrdersResponse;
  positions: LivePositionsResponse;
  safety: LiveSafetyResponse;
}): Promise<OverviewControlCenterModel> {
  const config = input.queryService.getConfig();
  const symbols = input.queryService.getSymbols();
  const signals = input.queryService.getSignals();
  const backtestRuns = input.instantBacktestService.listRuns();
  const replayRuns = input.replayApiService.listRuns();

  const qualifiedSignals = signals.status === 'ok' ? signals.qualifiedSignals : [];
  const topSignals = signals.status === 'ok' ? (signals.ranking ?? []).slice(0, 5) : [];
  const latestRuns = [...replayRuns.runs, ...backtestRuns.runs]
    .sort((a, b) => (b.startedAtTs ?? 0) - (a.startedAtTs ?? 0))
    .slice(0, 6);

  const openOrdersCount = input.orders.orders.length;
  const openPositionsCount = input.positions.positions.length;
  const incidents = input.incidents.incidents.slice(0, 6);

  const liveHealthStatus =
    input.health.health.status === 'degraded' || input.health.health.status === 'incident'
      ? 'degraded'
      : input.health.health.status === 'running' || input.health.health.status === 'syncing'
        ? 'healthy'
        : 'paused';

  const safetyStatus =
    input.safety.safety.controlState === 'kill_switched'
      ? 'kill_switched'
      : input.safety.safety.healthStatus === 'degraded'
        ? 'degraded'
        : 'healthy';

  const modeStatus = input.live.mode === 'live' ? 'live' : 'paper';

  const criticalStatusStrip = {
    modeBadge: createStatusBadge(modeStatus),
    healthBadge: createStatusBadge(liveHealthStatus),
    safetyBadge: createStatusBadge(safetyStatus),
    message:
      modeStatus === 'live'
        ? 'LIVE context active. Review Safety and incident feed before operator actions.'
        : 'Research/Paper context active. Use replay/backtest for deterministic validation.',
  } as const;

  return {
    kind: 'overview_control_center',
    criticalStatusStrip,
    pageHeader: createPageHeader({
      title: 'Operator Control Center Overview',
      description: 'High-confidence summary of mode, health, risk surfaces, and latest strategy output.',
      statuses: [modeStatus, liveHealthStatus, safetyStatus],
      actions: [
        { key: 'goto-live', label: 'Open Live', actionId: 'nav:live', intent: 'danger' },
        { key: 'goto-replay', label: 'Open Replay', actionId: 'nav:replay', intent: 'primary' },
        { key: 'goto-backtest', label: 'Open Backtest', actionId: 'nav:backtest' },
        { key: 'goto-safety', label: 'Open Safety', actionId: 'nav:safety', intent: 'danger' },
        { key: 'goto-signals', label: 'Open Signals', actionId: 'nav:signals' },
      ],
    }),
    primaryCards: [
      createCardContainer(
        [
          `Mode: ${input.live.mode}`,
          `Venue: ${input.live.venue}`,
          `Account: ${input.live.accountRef}`,
          `Adapter ready: ${String(input.live.adapterReady)}`,
        ],
        'Venue + Account',
        input.live.mode === 'live' ? 'danger' : 'elevated'
      ),
      createCardContainer(
        [
          `Open orders: ${openOrdersCount}`,
          `Open positions: ${openPositionsCount}`,
          `Recent incidents: ${incidents.length}`,
          `Latest sync: ${input.live.latestSyncTs ?? 'n/a'}`,
        ],
        'Live Exposure Snapshot',
        'default'
      ),
      createCardContainer(
        [
          `Qualified signals: ${qualifiedSignals.length}`,
          `Best signal score: ${signals.status === 'ok' ? (signals.bestSignals.top?.score ?? 'n/a') : 'n/a'}`,
          `Replay runs: ${replayRuns.runs.length}`,
          `Backtest runs: ${backtestRuns.runs.length}`,
        ],
        'Research Activity',
        'elevated'
      ),
    ],
    keyMetrics: [
      createKpiCard('Open Orders', String(openOrdersCount), undefined, openOrdersCount > 0 ? 'degraded' : 'healthy'),
      createKpiCard('Open Positions', String(openPositionsCount), undefined, openPositionsCount > 0 ? 'live' : 'healthy'),
      createKpiCard('Qualified Signals', String(qualifiedSignals.length), undefined, qualifiedSignals.length > 0 ? 'positive' : 'paused'),
      createKpiCard('Recent Incidents', String(incidents.length), undefined, incidents.length > 0 ? 'degraded' : 'healthy'),
    ],
    recentActivity: {
      signalsTable: createDataTableWrapper('Latest Qualified Signals', [
        { key: 'symbol', label: 'Symbol', width: '120px' },
        { key: 'setup', label: 'Setup', width: '220px' },
        { key: 'score', label: 'Score', width: '120px' },
        { key: 'side', label: 'Side', width: '120px' },
      ]),
      runsTimeline: createTimelineFeed(
        'Recent Runs',
        latestRuns.map((run) => ({
          timestamp: String(run.startedAtTs ?? 0),
          label: `${run.mode.toUpperCase()} • ${run.runId}`,
          description: `status=${run.status}, trades=${run.totalTrades}, pnl=${run.netPnl}`,
          status: run.mode === 'replay' ? 'replay' : 'backtest',
        }))
      ),
      incidentsTimeline: createTimelineFeed(
        'Latest Incidents',
        incidents.map((incident) => ({
          timestamp: String(incident.raisedAtTs),
          label: incident.code,
          description: incident.message,
          status: incident.severity === 'critical' ? 'kill_switched' : 'degraded',
        }))
      ),
    },
    detailSections: [
      {
        header: createSectionHeader('Operational Modes', 'Current mode support and active runtime mode'),
        metrics: [
          createMetricRow('Runtime mode', input.live.mode, modeStatus),
          createMetricRow('Replay supported', String(config.supports.replay), 'replay'),
          createMetricRow('Backtest supported', String(config.supports.backtest), 'backtest'),
          createMetricRow('Paper supported', String(config.supports.paper), 'paper'),
          createMetricRow('Live supported flag', String(config.supports.live), 'live'),
        ],
      },
      {
        header: createSectionHeader('Watchlist + Profiles', 'Symbol registry and profile availability'),
        metrics: [
          createMetricRow('Tracked symbols', String(symbols.symbols.length), symbols.symbols.length > 0 ? 'healthy' : 'paused'),
          createMetricRow('Default watchlist source', 'Symbol registry', 'healthy', 'No synthetic watchlist values introduced.'),
          createMetricRow('Profiles summary source', 'Platform summary section', 'healthy', input.overviewPage.sections.find((section) => section.key === 'platform') ? 'Profiles surfaced from platform summary payload.' : 'Platform summary unavailable.'),
        ],
      },
      {
        header: createSectionHeader('Active Venue + Account', 'Execution context and safety state'),
        metrics: [
          createMetricRow('Venue', input.live.venue, modeStatus),
          createMetricRow('Account Ref', input.live.accountRef),
          createMetricRow('Safety source', input.safety.safety.source),
          createMetricRow('Safety health', input.safety.safety.healthStatus, safetyStatus),
          createMetricRow('Control state', input.safety.safety.controlState ?? 'n/a', safetyStatus),
        ],
      },
    ],
    ctas: [
      { label: 'Go to Live', href: '/live', intent: 'danger' },
      { label: 'Go to Replay', href: '/replay', intent: 'primary' },
      { label: 'Go to Backtest', href: '/backtest', intent: 'default' },
      { label: 'Go to Safety', href: '/safety', intent: 'danger' },
      { label: 'Go to Signals', href: '/signals', intent: 'default' },
    ],
    sourceFootnotes: [
      'Live/health/incidents/orders/positions/safety use existing LiveStatusService adapters and runtime-state file where available.',
      'Signals and run summaries use existing strategy evaluation and run-history services; no synthetic execution outcomes are injected.',
      'Watchlist summary is sourced from symbol registry because dedicated watchlist persistence is not present in current architecture.',
    ],
  };
}
