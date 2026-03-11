import {
  SUPPORTED_BOT_MODES,
  SUPPORTED_EXECUTION_VENUES,
  SUPPORTED_PROFILE_CODES,
  type BotMode,
  type ExecutionVenue,
  type ProfileCode
} from '@hashi-bot/core';
import {
  DEFAULT_BREAKOUT_THRESHOLDS,
  DEFAULT_PULLBACK_V2_THRESHOLDS,
  DEFAULT_REGIME_THRESHOLDS,
  DEFAULT_SCORE_THRESHOLDS,
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_STRATEGY_ENGINE_CONFIG,
  DEFAULT_TREND_PULLBACK_THRESHOLDS,
} from '@hashi-bot/strategy';

import { createSection } from '../components/foundation-sections.js';
import type { FoundationPage, PlatformSummary } from '../pages/page-types.js';

import { Phase2QueryService } from './phase2-query.service.js';

const KNOWN_SETUPS = ['pullback:trend_pullback', 'pullback:pullback_v2', 'breakout:compression_breakout'] as const;

export class FoundationPagesService {
  constructor(private readonly queryService: Phase2QueryService) {}

  private getPlatformSummary(): PlatformSummary {
    return {
      supportedModes: [...SUPPORTED_BOT_MODES] as BotMode[],
      executionVenues: [...SUPPORTED_EXECUTION_VENUES] as ExecutionVenue[],
      profiles: [...SUPPORTED_PROFILE_CODES] as ProfileCode[]
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
        setupCounts: {},
        unqualifiedSummary: signals.unqualifiedSummary,
      };
    }

    const setupCounts = signals.qualifiedSignals.reduce<Record<string, number>>((acc, item) => {
      const code = item.signal.setupCode;
      acc[code] = (acc[code] ?? 0) + 1;
      return acc;
    }, {});

    return {
      status: 'ok',
      knownSetups: KNOWN_SETUPS,
      latestQualifiedSignals: signals.qualifiedSignals,
      bestSignal: signals.bestSignals.top ?? null,
      setupCounts,
      unqualifiedSummary: signals.unqualifiedSummary,
    };
  }

  getOverviewPage(): FoundationPage {
    const symbols = this.queryService.getSymbols();
    const datasets = this.queryService.getDatasets();
    const backtests = this.queryService.getBacktestRuns();
    const platform = this.getPlatformSummary();

    return {
      path: '/',
      title: 'Hashi Bot Phase 4 Overview',
      subtitle: 'Signals, risk decisions, simulated execution, and backtest visibility are now wired end-to-end.',
      readiness: 'phase4_ready',
      sections: [
        createSection('signals', 'Signal Generation', 'Strategy snapshot/regime inputs are producing structured signals for simulation.', this.queryService.getRegimes()),
        createSection('risk', 'Risk + Governance Foundation', 'Profile-aware risk sizing and governance checks are active in backtest execution.', {
          profiles: platform.profiles,
          modeSupport: platform.supportedModes
        }),
        createSection('execution', 'Simulated Trade Execution', 'Trade lifecycle state machine and fill assumptions are applied candle-by-candle.', {
          lifecycle: 'pending_entry -> open -> tp1 -> breakeven/runner -> closed',
          fillModel: 'OHLC touch-based deterministic fills with fee/slippage assumptions'
        }),
        createSection('backtests', 'Backtest Visibility', 'Run summaries and metrics are queryable through API routes.', backtests),
        createSection('datasets', 'Datasets', 'Available market datasets feeding backtest/replay inputs.', datasets),
        createSection('symbols', 'Known Symbols', 'Symbol metadata used by sizing/risk simulation.', symbols)
      ]
    };
  }

  getReplayPage(): FoundationPage {
    return {
      path: '/replay',
      title: 'Replay Foundation',
      subtitle: 'Replay will reuse the same strategy context, risk engine, lifecycle state machine, and fill assumptions.',
      readiness: 'phase4_ready',
      sections: [
        createSection('replay_reuse', 'Shared Engine Reuse', 'Replay path is expected to consume the same deterministic modules.', {
          strategy: 'strategy snapshot + regime evaluation',
          risk: 'profile-aware risk/governance decisions',
          lifecycle: 'trade state machine transitions',
          fills: 'OHLC + slippage/fee assumptions'
        }),
        createSection('datasets', 'Replay Datasets', 'Dataset inputs currently available for replay loop scaffolding.', this.queryService.getDatasets()),
        createSection('regime', 'Replay Regime State', 'Regime context currently visible for replay decisioning.', this.queryService.getRegimes())
      ]
    };
  }

  getBacktestPage(): FoundationPage {
    const configs = this.queryService.getBacktestConfigs();
    const runs = this.queryService.getBacktestRuns();
    const latestRunId = runs.runs[0]?.runId;
    const latestRun = latestRunId ? this.queryService.getBacktestRun(latestRunId) : { status: 'not_found' as const };
    const latestTradeLog = latestRun.status === 'ok' && 'run' in latestRun ? latestRun.run.tradeLogSummary : [];

    return {
      path: '/backtest',
      title: 'Backtest Execution',
      subtitle: 'Phase 4 backtest path now exposes datasets, profile options, run summaries, metrics, and trade-level visibility.',
      readiness: 'phase4_ready',
      sections: [
        createSection('configs', 'Available Backtest Configs', 'Datasets + profile defaults currently surfaced by API.', configs),
        createSection('run_summaries', 'Run Summaries', 'Stored backtest run summaries for quick inspection.', runs),
        createSection('metrics', 'Latest Run Metrics', 'Structured metrics summary from latest stored run.', latestRun),
        createSection('trades', 'Trade Log Summary', 'Trade-level visibility from latest run output.', latestTradeLog)
      ]
    };
  }

  getLivePage(): FoundationPage {
    return {
      path: '/live',
      title: 'Live Architecture Boundary',
      subtitle: 'Backtest execution is simulated-only. Real exchange execution remains separated for future phases.',
      readiness: 'phase4_ready',
      sections: [
        createSection('separation', 'Simulated vs Future Real Execution', 'Phase 4 keeps execution simulation and live execution concerns separate.', {
          backtest: 'deterministic OHLC simulation with risk/governance controls',
          liveFuture: 'real exchange adapters and order routing deferred to later phases'
        }),
        createSection('shared_stack', 'Shared Reusable Stack', 'Both replay/live will reuse strategy+risk+lifecycle contracts.', {
          strategy: true,
          risk: true,
          lifecycle: true,
          fillsAssumptions: true
        }),
        createSection('venues', 'Execution Venues', 'Venue contract declarations remain available without live trading implementation.', this.getPlatformSummary().executionVenues)
      ]
    };
  }

  getSettingsPage(): FoundationPage {
    return {
      path: '/settings',
      title: 'Settings and Risk Notes',
      subtitle: 'Phase 4 exposes profile/risk/config notes with lightweight operational visibility.',
      readiness: 'phase4_ready',
      sections: [
        createSection('config', 'Capability Config', 'Current capability switches surfaced through API.', this.queryService.getConfig()),
        createSection('profiles', 'Profile Options', 'Profiles used for risk-governance decisions.', this.getPlatformSummary().profiles),
        createSection('backtest_defaults', 'Backtest Defaults', 'Current defaults used by worker/web backtest execution paths.', this.queryService.getBacktestConfigs()),
        createSection('regime_defaults', 'Regime Threshold Notes', 'Default regime thresholds for transparent strategy context.', DEFAULT_REGIME_THRESHOLDS)
      ]
    };
  }
}
