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
        emptyStateMessage: 'No qualified signals are currently available. Verify snapshots/config inputs before treating this as strategy inactivity.'
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
      emptyStateMessage: signals.qualifiedSignals.length === 0
        ? 'All current candidates were filtered out by strategy conditions (see unqualifiedSummary).' 
        : undefined
    };
  }

  async getOverviewPage(): Promise<FoundationPage> {
    const config = this.queryService.getConfig();
    const signals = this.buildSignalSummary();
    const backtestRuns = this.instantBacktestService.listRuns({ limit: 50 });
    const replayRuns = this.replayApiService.listRuns({ limit: 50 });
    const live = await this.liveStatusService.getLiveState();

    return {
      path: '/',
      title: 'Hashi Bot Operations Console',
      subtitle: 'Operator-first visibility for replay, backtest, and guarded paper/live workflows.',
      readiness: 'phase5_ready',
      sections: [
        createSection('capabilities', 'Mode & Run Readiness', 'Current mode support, run availability, and active execution context.', {
          replay: { enabled: config.supports.replay, runCount: replayRuns.runs.length },
          backtest: { enabled: config.supports.backtest, runCount: backtestRuns.runs.length },
          instantRuns: { enabled: true },
          liveExecution: {
            status: live.status,
            mode: live.mode,
            venue: live.venue,
            accountRef: live.accountRef,
            adapterReady: live.adapterReady
          },
          modeReminder: 'Use replay/backtest for deterministic validation. Treat live/paper endpoints as runtime visibility, not simulated guarantees.'
        }),
        createSection('signals', 'Signals (Top Candidates)', 'Top ranked signal candidates with qualification context and filtering visibility.', signals),
        createSection('runs', 'Runs & Trades Navigation', 'Fast links for run/trade investigation workflows.', {
          runs: {
            replay: replayRuns.runs.length,
            backtest: backtestRuns.runs.length
          },
          operatorPaths: {
            replayRuns: '/replay',
            backtestRuns: '/backtest',
            signals: '/api/signals',
            safety: '/live'
          },
          emptyStateGuidance: 'If run counts are zero, execute smoke flows before enabling broader operational checks.'
        }),
        createSection('platform', 'Platform Summary', 'Supported modes, venues, and profile codes.', this.getPlatformSummary()),
        createSection('operational_safety', 'Safety Coverage', 'Watchdogs, lockouts, startup recovery, and emergency-control transparency.', {
          startupRecovery: 'supported',
          watchdogHealth: 'supported',
          killSwitchLockout: 'supported',
          emergencyWorkflows: ['cancel_all_orders', 'flatten_positions', 'disable_live_mode'],
          honestyNote: 'Safety payloads remain explicit about runtime-file vs fallback sources; no synthetic success state is reported.'
        })
      ],
    };
  }

  getReplayPage(): FoundationPage {
    const runs = this.replayApiService.listRuns({ limit: 100 });

    return {
      path: '/replay',
      title: 'Replay Runs & Controls',
      subtitle: 'Deterministic replay controls with clear run-state visibility and safe isolation from live execution.',
      readiness: 'phase5_ready',
      sections: [
        createSection('runs', 'Replay Runs', 'Replay run list with current status and metadata.', {
          status: runs.status,
          items: runs.runs,
          count: runs.runs.length,
          emptyStateMessage: runs.runs.length === 0 ? 'No replay runs found. Start with `pnpm smoke:replay` or POST /api/replay.' : undefined
        }),
        createSection('controls', 'Replay Control Endpoints', 'Route templates for route-level replay control workflows.', {
          controlEndpointTemplate: '/api/replay/{runId}/control',
          detailEndpointTemplate: '/api/replay/{runId}',
          controlActions: ['step', 'play', 'pause', 'jump_to_index', 'jump_to_timestamp', 'set_speed', 'reset']
        }),
        createSection('operator_notes', 'Replay Operator Notes', 'Guidance for confidence and edge-case handling.', {
          notes: [
            'Replay is the preferred workflow for timeline-level trade lifecycle debugging.',
            'If run status is unavailable, validate dataset presence and replay launch payload first.',
            'Replay remains isolated from live order placement by design.'
          ]
        })
      ]
    };
  }

  getBacktestPage(): FoundationPage {
    const runs = this.instantBacktestService.listRuns({ limit: 100 });

    return {
      path: '/backtest',
      title: 'Backtest Runs & Trade Outcomes',
      subtitle: 'Backtest run history with trade-centric review context and default assumptions.',
      readiness: 'phase5_ready',
      sections: [
        createSection('runs', 'Backtest Runs', 'Backtest run summaries from repository.', {
          status: runs.status,
          items: runs.runs,
          count: runs.runs.length,
          emptyStateMessage: runs.runs.length === 0 ? 'No backtest runs found. Start with `pnpm smoke:backtest` or POST /api/backtests.' : undefined
        }),
        createSection('trades', 'Trades Review Hints', 'How to read trade outcomes and avoid common misreads.', {
          notes: [
            'Use netPnL and win-rate together; avoid judging strategy health from one run.',
            'Review setupCode and lifecycle transitions to explain outlier trades.',
            'For deterministic bar-by-bar investigation, move to replay for the same symbol/timeframe.'
          ]
        }),
        createSection('defaults', 'Backtest Defaults', 'Default backtest assumptions for instant runs.', this.queryService.getBacktestConfigs())
      ]
    };
  }

  async getLivePage(): Promise<FoundationPage> {
    const [live, health, orders, positions, incidents, safety] = await Promise.all([
      this.liveStatusService.getLiveState(),
      this.liveStatusService.getHealth(),
      this.liveStatusService.getOrders(),
      this.liveStatusService.getPositions(),
      this.liveStatusService.getIncidents(),
      this.liveStatusService.getSafety()
    ]);

    return {
      path: '/live',
      title: 'Live / Paper Safety Console',
      subtitle: 'Runtime health, safety state, incidents, and emergency-control visibility for operator decisions.',
      readiness: 'phase5_ready',
      sections: [
        createSection('venue_summary', 'Mode + Venue Summary', 'Current mode distinction and execution context.', {
          status: live.status,
          mode: live.mode,
          venue: live.venue,
          accountRef: live.accountRef,
          adapterReady: live.adapterReady,
          latestSyncTs: live.latestSyncTs,
          modeWarning: live.mode === 'live' ? 'Live mode is active. Treat lockout/incident states as immediate operational blockers.' : 'Paper mode active. Use this mode before any live rollout changes.'
        }),
        createSection('health', 'Execution Health', 'Adapter health status and incident counters.', health),
        createSection('safety', 'Safety State (Watchdog + Lockout)', 'Safety source, lockout controls, and recovery status.', safety),
        createSection('orders', 'Open Orders', 'Open order table source and sync timestamp.', {
          ...orders,
          emptyStateMessage: orders.status === 'ok' && orders.orders.length === 0 ? 'No open orders at last sync.' : undefined
        }),
        createSection('positions', 'Open Positions', 'Open positions and latest sync information.', {
          ...positions,
          emptyStateMessage: positions.status === 'ok' && positions.positions.length === 0 ? 'No open positions at last sync.' : undefined
        }),
        createSection('incidents', 'Incident Feed', 'Recent adapter-level incidents and safety references.', incidents),
        createSection('emergency_controls', 'Emergency Controls (Visibility-Only)', 'Dangerous actions are intentionally non-executing from web runtime.', {
          endpoint: 'POST /api/live/emergency',
          currentBehavior: 'visibility-only (non-executing in web runtime)',
          rationale: 'Avoid fake control-plane behavior in web process; worker control path remains authoritative.',
          operatorAction: 'Use worker recovery workflow for actual cancel/flatten/disable-live execution.'
        }),
        createSection('path_notes', 'Venue Path Notes', 'Mock/CCXT/cTrader behavior notes and data-honesty reminders.', {
          notes: [
            ...live.notes,
            'Mock path is deterministic and suitable for paper-mode verification only.',
            'CCXT and cTrader require valid credentials/connectivity for real venue state.',
            'Unavailable responses represent real uncertainty; they are not silently converted into success states.'
          ]
        })
      ],
    };
  }

  getRunsPage(): FoundationPage {
    const replayRuns = this.replayApiService.listRuns({ limit: 100 });
    const backtestRuns = this.instantBacktestService.listRuns({ limit: 100 });

    return {
      path: '/runs',
      title: 'Runs Review Console',
      subtitle: 'Cross-mode run visibility for replay and instant backtest workflows.',
      readiness: 'phase5_ready',
      sections: [
        createSection('replay_runs', 'Replay Runs', 'Replay run summaries and statuses.', replayRuns),
        createSection('backtest_runs', 'Backtest Runs', 'Backtest run summaries and statuses.', backtestRuns),
        createSection('run_api_paths', 'Run API Paths', 'Operator routes for run retrieval and control.', {
          replayList: '/api/replay',
          replayDetailTemplate: '/api/replay/{runId}',
          replayControlTemplate: '/api/replay/{runId}/control',
          backtestList: '/api/backtests',
          backtestDetailTemplate: '/api/backtests/{runId}'
        })
      ]
    };
  }

  getTradesPage(): FoundationPage {
    const replayRuns = this.replayApiService.listRuns({ limit: 100 });
    const backtestRuns = this.instantBacktestService.listRuns({ limit: 100 });
    const replayCandidates = replayRuns.runs.slice(0, 10);
    const backtestCandidates = backtestRuns.runs.slice(0, 10);

    return {
      path: '/trades',
      title: 'Trades Review',
      subtitle: 'Trade outcome review surface from replay/backtest run records.',
      readiness: 'phase5_ready',
      sections: [
        createSection('trade_sources', 'Trade Data Sources', 'Current run sources that expose trade summaries.', {
          replayRunsAvailable: replayRuns.runs.length,
          backtestRunsAvailable: backtestRuns.runs.length,
          replayDetailEndpointTemplate: '/api/replay/{runId}',
          backtestDetailEndpointTemplate: '/api/backtests/{runId}',
          note: 'Trade-level detail is available on run detail endpoints. Dedicated trade query APIs are a thin-glue follow-up.'
        }),
        createSection('replay_run_candidates', 'Replay Run Candidates', 'Replay runs to inspect for timeline/trade lifecycle review.', replayCandidates),
        createSection('backtest_run_candidates', 'Backtest Run Candidates', 'Backtest runs to inspect for deterministic trade outcomes.', backtestCandidates)
      ]
    };
  }

  async getSafetyPage(): Promise<FoundationPage> {
    const [live, health, incidents, safety] = await Promise.all([
      this.liveStatusService.getLiveState(),
      this.liveStatusService.getHealth(),
      this.liveStatusService.getIncidents(),
      this.liveStatusService.getSafety()
    ]);

    return {
      path: '/safety',
      title: 'Safety & Incident Command View',
      subtitle: 'Operational guardrails, lockouts, incident feeds, and emergency visibility.',
      readiness: 'phase5_ready',
      sections: [
        createSection('safety_mode', 'Mode + Venue State', 'Mode, venue, and adapter state context.', {
          status: live.status,
          mode: live.mode,
          venue: live.venue,
          accountRef: live.accountRef,
          adapterReady: live.adapterReady,
          latestSyncTs: live.latestSyncTs
        }),
        createSection('safety_health', 'Health Summary', 'Adapter health and incident counters.', health),
        createSection('safety_state', 'Safety State', 'Persisted runtime safety lockout/recovery state.', safety),
        createSection('incident_feed', 'Incident Feed', 'Latest incident feed and operational notes.', incidents),
        createSection('emergency_visibility', 'Emergency Controls (Visibility-Only)', 'Web endpoint remains visibility-only for safety.', {
          endpoint: 'POST /api/live/emergency',
          behavior: 'visibility_only_non_executing',
          supportedCommands: ['acknowledge_incident', 'cancel_all_orders', 'flatten_positions', 'disable_live_mode']
        })
      ]
    };
  }

  async getSettingsPage(): Promise<FoundationPage> {
    const symbols = this.queryService.getSymbols();
    const config = this.queryService.getConfig();
    const live = await this.liveStatusService.getLiveState();

    return {
      path: '/settings',
      title: 'Settings & Operational Guardrails',
      subtitle: 'Configuration visibility, mode distinctions, and safety reminders for release operation.',
      readiness: 'phase5_ready',
      sections: [
        createSection('profiles', 'Profiles', 'Profiles used by risk/governance and run launch payloads.', this.getPlatformSummary().profiles),
        createSection('symbols', 'Symbol Registry', 'Symbol metadata used for risk sizing and venue mapping.', symbols),
        createSection('config_notes', 'Config Source Notes', 'Current capability/config values surfaced from API layer.', config),
        createSection('mode_distinctions', 'Mode Distinctions', 'Prevent accidental wrong-mode operation.', {
          reminders: [
            'Replay/backtest are deterministic validation workflows.',
            'Paper mode should be the first runtime gate after config or code changes.',
            'Live mode requires explicit enablement and valid non-mock venue credentials.'
          ]
        }),
        createSection('execution_summary', 'Execution Venue Summary', 'Current live foundation venue/account selection and sync visibility.', {
          mode: live.mode,
          venue: live.venue,
          accountRef: live.accountRef,
          latestSyncTs: live.latestSyncTs,
          adapterReady: live.adapterReady,
          notes: live.notes
        }),
        createSection('safety_reminders', 'Safety Reminders', 'Guardrails for live safety workflow and kill-switch handling.', {
          reminders: [
            'Enable live only with explicit LIVE_ENABLED=true and validated venue credentials.',
            'Treat lockout, kill-switch, or recovery-required states as hard stops until reviewed.',
            'Do not treat unavailable live API responses as successful execution state.',
            'Replay/backtest remain the deterministic verification path.',
            'Review /api/live/safety before enabling sustained live cycles; do not ignore lockout or recovery-required states.'
          ]
        }),
        createSection('release_checklist', 'Release Readiness Checklist', 'Lightweight operator checklist before merge/deploy/live enablement.', {
          baseline: [
            'pnpm verify:env',
            'pnpm typecheck && pnpm build',
            'pnpm verify:migrations && pnpm verify:dataset',
            'pnpm smoke:backtest && pnpm smoke:replay && pnpm smoke:live:mock'
          ],
          goLive: [
            'pnpm verify:env:worker:live',
            'Confirm non-mock EXECUTION_VENUE and tested credentials',
            'Set LIVE_ENABLED=true explicitly in live worker config',
            'Confirm /api/live/safety has no lockout/recovery-required state'
          ],
          runbook: 'docs/runbooks/release-checklist.md'
        }),
        createSection('regime_defaults', 'Regime Threshold Notes', 'Default regime thresholds for transparent strategy context.', DEFAULT_REGIME_THRESHOLDS),
      ],
    };
  }
}
