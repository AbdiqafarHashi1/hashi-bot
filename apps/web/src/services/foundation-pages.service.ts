import {
  SUPPORTED_BOT_MODES,
  SUPPORTED_EXECUTION_VENUES,
  SUPPORTED_PROFILE_CODES,
  type BotMode,
  type ExecutionVenue,
  type ProfileCode,
} from '@hashi-bot/core';
import { DEFAULT_REGIME_THRESHOLDS } from '@hashi-bot/strategy';

import { createSection } from '../components/foundation-sections.js';
import type { FoundationPage, PlatformSummary } from '../pages/page-types.js';

import { InstantBacktestService } from './instant-backtest.service.js';
import { Phase2QueryService } from './phase2-query.service.js';
import { ReplayApiService } from './replay-api.service.js';
import { LiveOperationsService } from './live-operations.service.js';

const KNOWN_SETUPS = ['pullback:trend_pullback', 'pullback:pullback_v2', 'breakout:compression_breakout'] as const;

export class FoundationPagesService {
  constructor(
    private readonly queryService: Phase2QueryService,
    private readonly instantBacktestService: InstantBacktestService,
    private readonly replayApiService: ReplayApiService,
    private readonly liveOperationsService: LiveOperationsService
  ) {}

  private getPlatformSummary(): PlatformSummary {
    return {
      supportedModes: [...SUPPORTED_BOT_MODES] as BotMode[],
      executionVenues: [...SUPPORTED_EXECUTION_VENUES] as ExecutionVenue[],
      profiles: [...SUPPORTED_PROFILE_CODES] as ProfileCode[],
    };
  }

  private getLatestBacktestDetail() {
    const runs = this.instantBacktestService.listRuns();
    const latestRunId = runs.runs[0]?.runId;
    if (!latestRunId) {
      return null;
    }

    const detail = this.instantBacktestService.getRun(latestRunId);
    return detail.status === 'ok' ? detail.run : null;
  }

  private getLatestReplayDetail() {
    const replayRuns = this.replayApiService.listRuns();
    const latestRunId = replayRuns.runs[0]?.runId;
    if (!latestRunId) {
      return null;
    }

    const detail = this.replayApiService.getRun(latestRunId);
    return detail.status === 'ok' ? detail.run : null;
  }

  private buildSignalSummary() {
    const signals = this.queryService.getSignals();

    if (signals.status !== 'ok') {
      return {
        status: signals.status,
        knownSetups: KNOWN_SETUPS,
        latestQualifiedSignals: [],
        bestSignal: null,
        ranking: [],
      };
    }

    return {
      status: 'ok',
      knownSetups: KNOWN_SETUPS,
      latestQualifiedSignals: signals.qualifiedSignals.slice(0, 5),
      bestSignal: signals.bestSignals.top ?? null,
      ranking: (signals.ranking ?? []).slice(0, 5),
      symbolsEvaluated: signals.symbolsEvaluated,
      unqualifiedSummary: signals.unqualifiedSummary,
    };
  }

  async getOverviewPage(): Promise<FoundationPage> {
    const config = this.queryService.getConfig();
    const signals = this.buildSignalSummary();
    const latestBacktest = this.getLatestBacktestDetail();
    const latestReplay = this.getLatestReplayDetail();
    const backtestRuns = this.instantBacktestService.listRuns();
    const replayRuns = this.replayApiService.listRuns();

    return {
      path: '/',
      title: 'Hashi Bot Operational Safety Control Center',
      subtitle: 'Replay/backtest plus guarded live operational safety visibility with persisted incidents and recovery state.',
      readiness: 'phase7_ready',
      sections: [
        createSection('availability', 'Capability Availability', 'Current mode availability and latest run counts.', {
          replay: {
            enabled: config.supports.replay,
            runCount: replayRuns.runs.length,
            latestRunId: replayRuns.runs[0]?.runId,
          },
          backtest: {
            enabled: config.supports.backtest,
            runCount: backtestRuns.runs.length,
            latestRunId: backtestRuns.runs[0]?.runId,
          },
        }),
        createSection('latest_signals', 'Latest Qualified Signals Snapshot', 'Most recent qualified signal ranking from strategy evaluation.', signals),
        createSection('latest_replay', 'Latest Replay Summary', 'Replay cursor/state visibility for the latest replay run.', latestReplay ?? { status: 'no_replay_runs' }),
        createSection('latest_backtest', 'Latest Backtest Metrics Summary', 'Headline metrics and trade summary for latest backtest run.', latestBacktest ?? { status: 'no_backtest_runs' }),
      ],
    };
  }

  getReplayPage(): FoundationPage {
    const datasets = this.queryService.getDatasets();
    const runs = this.replayApiService.listRuns();
    const selectedRunId = runs.runs[0]?.runId;
    const selectedRun = selectedRunId ? this.replayApiService.getRun(selectedRunId) : { status: 'not_found' as const };

    return {
      path: '/replay',
      title: 'Replay Inspection and Control',
      subtitle: 'Create/load replay runs, inspect cursor/state, and issue deterministic control actions via API.',
      readiness: 'phase7_ready',
      sections: [
        createSection('create_load', 'Create / Load Replay Run', 'Use POST /api/replay to create runs and GET /api/replay/[id] to load details.', {
          createEndpoint: '/api/replay',
          createMethod: 'POST',
          createPayloadSchema: {
            datasetId: 'string (optional)',
            symbolCodes: 'string[] (optional watchlist)',
            profileCode: ['GROWTH_HUNTER', 'PROP_HUNTER'],
            timeframe: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'],
            replaySpeed: 'number',
          },
          loadEndpointTemplate: '/api/replay/{runId}',
          availableDatasets: datasets,
          availableRuns: runs,
        }),
        createSection('controls', 'Replay Controls', 'Control actions are explicit and non-streaming; each call returns concrete replay state.', {
          controlEndpointTemplate: '/api/replay/{runId}/control',
          method: 'POST',
          supportedActions: [
            { type: 'step', payload: { type: 'step', steps: 1 } },
            { type: 'play', payload: { type: 'play' } },
            { type: 'pause', payload: { type: 'pause' } },
            { type: 'jump_to_index', payload: { type: 'jump_to_index', barIndex: 50 } },
            { type: 'jump_to_timestamp', payload: { type: 'jump_to_timestamp', timestamp: Date.now() } },
            { type: 'set_speed', payload: { type: 'set_speed', speed: 2 } },
            { type: 'reset', payload: { type: 'reset' } },
          ],
        }),
        createSection('current_state', 'Current Replay State', 'Cursor, playback state, latest snapshot/regime/signals, trade summaries, and timeline events.', selectedRun),
      ],
    };
  }

  getBacktestPage(): FoundationPage {
    const configs = this.queryService.getBacktestConfigs();
    const runs = this.instantBacktestService.listRuns();
    const selectedRunId = runs.runs[0]?.runId;
    const selectedRun = selectedRunId ? this.instantBacktestService.getRun(selectedRunId) : { status: 'not_found' as const };

    return {
      path: '/backtest',
      title: 'Instant Backtest Launch and Inspection',
      subtitle: 'Launch structured instant backtests and inspect stored run summaries, metrics, and trade-level outputs.',
      readiness: 'phase7_ready',
      sections: [
        createSection('launch', 'Launch Instant Backtest', 'POST /api/backtests launches a run and returns a real run reference.', {
          endpoint: '/api/backtests',
          method: 'POST',
          payloadSchema: {
            datasetId: 'string (optional if symbols provided)',
            profileCode: ['GROWTH_HUNTER', 'PROP_HUNTER'],
            timeframe: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'],
            symbols: 'string[] (single-pair or watchlist)',
            initialBalance: 'number (optional)',
            slippageBps: 'number (optional)',
            commissionBps: 'number (optional)',
            maxConcurrentPositions: 'number (optional)',
          },
          defaults: configs,
        }),
        createSection('runs', 'Recent Backtest Runs', 'GET /api/backtests returns recent run summaries.', runs),
        createSection('selected_run', 'Selected Run Detail', 'GET /api/backtests/[id] exposes summary, metrics, and trade summaries.', selectedRun),
      ],
    };
  }

  async getLivePage(): Promise<FoundationPage> {
    const liveSummary = await this.liveOperationsService.getLiveSummary();
    const liveHealth = await this.liveOperationsService.getLiveHealth();
    const liveSafety = await this.liveOperationsService.getLiveSafety();
    const liveIncidents = await this.liveOperationsService.getLiveIncidents();

    return {
      path: '/live',
      title: 'Live Operational Safety (Phase 7)',
      subtitle: 'Operational safety, recovery, lockouts, and incident visibility for guarded live execution.',
      readiness: 'phase7_ready',
      sections: [
        createSection('health_summary', 'Health Summary', 'Current persisted live health and safety posture from worker operational state.', liveHealth),
        createSection('safety_state', 'Kill-Switch / Lockout / Recovery', 'Lockout boundaries and recovery status used to guard live execution.', liveSafety),
        createSection('watchdog_sync', 'Sync Freshness and Watchdog Context', 'Latest observed state and persisted recovery notes; unavailable means worker has not published live state yet.', {
          status: liveSummary.status,
          observedAt: liveSummary.latestState?.observedAt,
          mode: liveSummary.mode,
          recovery: liveSummary.recovery,
          recoveryNotes: liveSummary.latestState?.recoveryNotes ?? []
        }),
        createSection('incidents', 'Recent Incidents', 'Most recent incidents and emergency action history from persisted operational repository.', liveIncidents),
        createSection('emergency_controls', 'Emergency Control Endpoint Visibility', 'POST /api/live/emergency is exposed for visibility but may reject execution when unavailable in this architecture.', {
          endpoint: '/api/live/emergency',
          method: 'POST',
          supportedTypes: ['cancel_all_orders', 'flatten_positions', 'disable_live_mode'],
          currentBehavior: 'visibility_only_or_rejected_without_worker_operator_channel'
        }),
      ],
    };
  }

  async getSettingsPage(): Promise<FoundationPage> {
    return {
      path: '/settings',
      title: 'Settings, Profiles, and Operational Notes',
      subtitle: 'Configuration visibility for profiles, symbols, and replay/backtest operating defaults.',
      readiness: 'phase7_ready',
      sections: [
        createSection('profiles', 'Profiles', 'Profiles used by risk/governance and run launch payloads.', this.getPlatformSummary().profiles),
        createSection('symbols', 'Symbol Registry', 'Symbol metadata used for risk sizing and session constraints.', this.queryService.getSymbols()),
        createSection('config_notes', 'Config Source Notes', 'Current capability/config values surfaced from API layer.', this.queryService.getConfig()),
        createSection('replay_notes', 'Replay Defaults and Notes', 'Replay control/action endpoints and expected payload conventions.', {
          listEndpoint: '/api/replay',
          createEndpoint: '/api/replay',
          detailEndpointTemplate: '/api/replay/{runId}',
          controlEndpointTemplate: '/api/replay/{runId}/control',
          defaults: {
            replaySpeed: 1,
            maxTimelineEvents: 300,
          },
        }),
        createSection('backtest_notes', 'Backtest Defaults and Notes', 'Instant backtest launch/read endpoints and default assumptions.', {
          listEndpoint: '/api/backtests',
          launchEndpoint: '/api/backtests',
          detailEndpointTemplate: '/api/backtests/{runId}',
          defaults: this.queryService.getBacktestConfigs(),
        }),
        createSection('live_safety_notes', 'Live Safety Rails', 'Safety preconditions checked before live mode is allowed.', {
          requiredFlags: ['LIVE_ENGINE_ENABLED=true', 'EXECUTION_VENUE set explicitly'],
          ccxtRequirements: ['CCXT_API_KEY', 'CCXT_API_SECRET'],
          ctraderRequirements: ['CTRADER_CLIENT_ID', 'CTRADER_CLIENT_SECRET', 'CTRADER_ACCESS_TOKEN', 'CTRADER_ACCOUNT_ID'],
          modeGuardrails: ['live+mock blocked unless explicitly allowed', 'startup recovery can force sync-only/manual-review/lock']
        }),
        createSection('regime_defaults', 'Regime Threshold Notes', 'Default regime thresholds for transparent strategy context.', DEFAULT_REGIME_THRESHOLDS),
      ],
    };
  }
}
