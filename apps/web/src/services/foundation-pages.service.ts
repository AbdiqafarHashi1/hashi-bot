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
import { LiveStatusService } from './live-status.service.js';
import { Phase2QueryService } from './phase2-query.service.js';
import { ReplayApiService } from './replay-api.service.js';

const KNOWN_SETUPS = ['pullback:trend_pullback', 'pullback:pullback_v2', 'breakout:compression_breakout'] as const;

export class FoundationPagesService {
  constructor(
    private readonly queryService: Phase2QueryService,
    private readonly instantBacktestService: InstantBacktestService,
    private readonly replayApiService: ReplayApiService,
    private readonly liveStatusService: LiveStatusService
  ) {}

  private getPlatformSummary(): PlatformSummary {
    return {
      supportedModes: [...SUPPORTED_BOT_MODES] as BotMode[],
      executionVenues: [...SUPPORTED_EXECUTION_VENUES] as ExecutionVenue[],
      profiles: [...SUPPORTED_PROFILE_CODES] as ProfileCode[],
    };
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
    const backtestRuns = this.instantBacktestService.listRuns();
    const replayRuns = this.replayApiService.listRuns();
    const live = await this.liveStatusService.getLiveState();

    return {
      path: '/',
      title: 'Hashi Bot Phase 7 Operational Safety Center',
      subtitle: 'Replay, backtest, and guarded live operation visibility with explicit operational safety state.',
      readiness: 'phase5_ready',
      sections: [
        createSection('capabilities', 'Capability Availability', 'Current mode support and latest run availability.', {
          replay: { enabled: config.supports.replay, runCount: replayRuns.runs.length },
          backtest: { enabled: config.supports.backtest, runCount: backtestRuns.runs.length },
          instantRuns: { enabled: true },
          liveExecutionFoundation: {
            enabled: true,
            status: live.status,
            venue: live.venue,
            accountRef: live.accountRef,
            adapterReady: live.adapterReady
          }
        }),
        createSection('signals', 'Signal Snapshot', 'Current ranked signal snapshot from strategy evaluation service.', signals),
        createSection('platform', 'Platform Summary', 'Supported modes, venues, and profile codes.', this.getPlatformSummary()),
        createSection('operational_safety', 'Operational Safety Support', 'Phase 7 introduces watchdogs, lockouts, guarded startup recovery, and emergency workflows.', {
          startupRecovery: 'supported',
          watchdogHealth: 'supported',
          killSwitchLockout: 'supported',
          emergencyWorkflows: ['cancel_all_orders', 'flatten_positions', 'disable_live_mode'],
          honestyNote: 'Safety API reflects real runtime persistence when available, otherwise explicit fallback/unavailable status is returned.'
        })
      ],
    };
  }

  getReplayPage(): FoundationPage {
    const runs = this.replayApiService.listRuns();

    return {
      path: '/replay',
      title: 'Replay Control',
      subtitle: 'Replay run controls and state visibility.',
      readiness: 'phase5_ready',
      sections: [
        createSection('runs', 'Replay Runs', 'Known replay runs from in-memory history repository.', runs.runs),
        createSection('notes', 'Replay Notes', 'Replay controls remain deterministic and isolated from live execution.', {
          controlEndpointTemplate: '/api/replay/{runId}/control',
          detailEndpointTemplate: '/api/replay/{runId}'
        })
      ]
    };
  }

  getBacktestPage(): FoundationPage {
    const runs = this.instantBacktestService.listRuns();

    return {
      path: '/backtest',
      title: 'Backtest Runs',
      subtitle: 'Instant backtest run history and config visibility.',
      readiness: 'phase5_ready',
      sections: [
        createSection('runs', 'Backtest Runs', 'Backtest run summaries from repository.', runs.runs),
        createSection('defaults', 'Backtest Defaults', 'Default backtest assumptions for instant runs.', this.queryService.getBacktestConfigs())
      ]
    };
  }

  async getLivePage(): Promise<FoundationPage> {
    const live = await this.liveStatusService.getLiveState();
    const health = await this.liveStatusService.getHealth();
    const orders = await this.liveStatusService.getOrders();
    const positions = await this.liveStatusService.getPositions();
    const incidents = await this.liveStatusService.getIncidents();
    const safety = await this.liveStatusService.getSafety();

    return {
      path: '/live',
      title: 'Live Operational Safety',
      subtitle: 'Operational visibility into health, watchdog/lockout state, recovery status, incidents, and emergency controls.',
      readiness: 'phase5_ready',
      sections: [
        createSection('venue_summary', 'Venue + Account Summary', 'Selected execution venue and account visibility.', {
          status: live.status,
          mode: live.mode,
          venue: live.venue,
          accountRef: live.accountRef,
          adapterReady: live.adapterReady,
          latestSyncTs: live.latestSyncTs
        }),
        createSection('health', 'Execution Health', 'Current adapter health and incident counters.', health),
        createSection('safety', 'Safety + Lockout State', 'Watchdog/lockout/recovery visibility from runtime state when available.', safety),
        createSection('orders', 'Open Orders', 'Venue open orders from latest sync.', orders),
        createSection('positions', 'Open Positions', 'Venue open positions from latest sync.', positions),
        createSection('incidents', 'Recent Incidents', 'Recent execution incidents available from current adapter context.', incidents),
        createSection('emergency_controls', 'Emergency Control Visibility', 'Emergency endpoint visibility and architecture honesty notes.', {
          endpoint: 'POST /api/live/emergency',
          currentBehavior: 'visibility-only (non-executing in web runtime)',
          rationale: 'Avoid fake control-plane behavior in web process; worker control path remains authoritative.'
        }),
        createSection('path_notes', 'Venue Path Notes', 'Mock/CCXT/cTrader behavior notes and data honesty reminders.', {
          notes: [
            ...live.notes,
            'Mock path provides deterministic paper-mode visibility.',
            'CCXT and cTrader paths require credentials/connectivity to return real venue state.',
            'No synthetic success metrics are reported when venue data is unavailable.'
          ]
        })
      ],
    };
  }


  getSignalsPage(): FoundationPage {
    const signals = this.queryService.getSignals();

    return {
      path: '/signals',
      title: 'Signals Intelligence',
      subtitle: 'Qualified setup output, ranking, and qualification pressure by symbol.',
      readiness: 'phase5_ready',
      sections: [
        createSection('qualified', 'Qualified Signals', 'Latest qualified strategy signals and score ordering.', {
          status: signals.status,
          topSignals: signals.status === 'ok' ? (signals.ranking ?? []).slice(0, 20) : [],
          bestSignal: signals.status === 'ok' ? signals.bestSignals.top ?? null : null,
        }),
        createSection('coverage', 'Coverage + Rejections', 'Symbol evaluation coverage and rejection burden.', {
          symbolsEvaluated: signals.symbolsEvaluated,
          unqualifiedSummary: signals.unqualifiedSummary,
        }),
      ],
    };
  }

  getTradesPage(): FoundationPage {
    const backtestRuns = this.instantBacktestService.listRuns();
    const replayRuns = this.replayApiService.listRuns();

    const backtestTrades = backtestRuns.runs.flatMap((run) => {
      const detail = this.instantBacktestService.getRun(run.runId);
      if (detail.status !== 'ok') {
        return [];
      }

      return (detail.run.tradeSummaries ?? []).map((trade) => ({
        source: 'backtest',
        runId: run.runId,
        symbolCode: trade.symbolCode,
        tradeId: trade.tradeId,
        side: trade.side,
        state: trade.lifecycleState,
        openedAtTs: trade.openedAtTs,
        closedAtTs: trade.closedAtTs,
        netPnl: trade.netPnl,
        closeReason: trade.closeReason,
      }));
    });

    return {
      path: '/trades',
      title: 'Trade Outcomes',
      subtitle: 'Trade lifecycle visibility across deterministic research workflows.',
      readiness: 'phase5_ready',
      sections: [
        createSection('backtest_trades', 'Backtest Trade Log', 'Closed trade outcomes from instant backtest runs.', {
          count: backtestTrades.length,
          trades: backtestTrades.slice(0, 100),
        }),
        createSection('replay_summary', 'Replay Trade Summary', 'Replay run-level trade counts and PnL snapshots.', {
          runs: replayRuns.runs.map((run) => ({
            runId: run.runId,
            status: run.status,
            tradeCount: run.totalTrades,
            realizedPnl: run.netPnl,
          })),
        }),
      ],
    };
  }

  getRunsPage(): FoundationPage {
    const backtestRuns = this.instantBacktestService.listRuns();
    const replayRuns = this.replayApiService.listRuns();

    return {
      path: '/runs',
      title: 'Run History',
      subtitle: 'Unified run inspection across replay and instant backtest workflows.',
      readiness: 'phase5_ready',
      sections: [
        createSection('replay_runs', 'Replay Runs', 'Replay run status, symbol, and progress timeline.', replayRuns.runs),
        createSection('backtest_runs', 'Backtest Runs', 'Backtest run metrics and quality status.', backtestRuns.runs),
      ],
    };
  }

  async getSafetyPage(): Promise<FoundationPage> {
    const safety = await this.liveStatusService.getSafety();
    const health = await this.liveStatusService.getHealth();
    const incidents = await this.liveStatusService.getIncidents();

    return {
      path: '/safety',
      title: 'Operational Safety Center',
      subtitle: 'Watchdog state, lockout visibility, and emergency-readiness context.',
      readiness: 'phase5_ready',
      sections: [
        createSection('safety_state', 'Safety + Lockout State', 'Live runtime safety shape with explicit unavailable/unknown values.', safety),
        createSection('health_state', 'Execution Health', 'Heartbeat, sync lag, and execution health telemetry.', health),
        createSection('incident_feed', 'Incident Feed', 'Recent incidents for operator triage and postmortem review.', incidents),
      ],
    };
  }

  async getSettingsPage(): Promise<FoundationPage> {
    const symbols = this.queryService.getSymbols();
    const config = this.queryService.getConfig();
    const live = await this.liveStatusService.getLiveState();

    return {
      path: '/settings',
      title: 'Settings, Venue Notes, and Safety Reminders',
      subtitle: 'Execution configuration visibility and operator safety reminders for guarded live operation.',
      readiness: 'phase5_ready',
      sections: [
        createSection('profiles', 'Profiles', 'Profiles used by risk/governance and run launch payloads.', this.getPlatformSummary().profiles),
        createSection('symbols', 'Symbol Registry', 'Symbol metadata used for risk sizing and venue mapping.', symbols),
        createSection('config_notes', 'Config Source Notes', 'Current capability/config values surfaced from API layer.', config),
        createSection('execution_summary', 'Execution Venue Summary', 'Current live foundation venue/account selection and sync visibility.', {
          mode: live.mode,
          venue: live.venue,
          accountRef: live.accountRef,
          latestSyncTs: live.latestSyncTs,
          adapterReady: live.adapterReady,
          notes: live.notes
        }),
        createSection('safety_reminders', 'Safety Reminders', 'Guardrails for Phase 7 live safety workflow.', {
          reminders: [
            'Live mode should only be enabled with explicit LIVE_ENABLED=true and valid venue credentials.',
            'Validate credentials and venue reachability before enabling non-mock execution.',
            'Do not treat unavailable live API responses as successful execution state.',
            'Replay/backtest remain the deterministic verification path.',
            'Review /api/live/safety before enabling sustained live cycles; do not ignore lockout or recovery-required states.'
          ]
        }),
        createSection('regime_defaults', 'Regime Threshold Notes', 'Default regime thresholds for transparent strategy context.', DEFAULT_REGIME_THRESHOLDS),
      ],
    };
  }
}
