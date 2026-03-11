import {
  SUPPORTED_BOT_MODES,
  SUPPORTED_EXECUTION_VENUES,
  SUPPORTED_PROFILE_CODES,
  type BotMode,
  type ExecutionVenue,
  type ProfileCode,
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
    const snapshots = this.queryService.getSnapshots();
    const regimes = this.queryService.getRegimes();
    const signalSummary = this.buildSignalSummary();
    const platform = this.getPlatformSummary();

    return {
      path: '/',
      title: 'Hashi Bot Phase 3 Overview',
      subtitle: 'Snapshot + regime + setup/scoring/signal layers are exposed for inspection before Phase 4.',
      readiness: 'phase3_ready',
      sections: [
        createSection('symbols', 'Known Symbols', 'Symbol registry available to evaluation paths.', symbols),
        createSection('datasets', 'Datasets', 'Datasets currently available for replay/backtest-style evaluation.', datasets),
        createSection('snapshots', 'Latest Snapshots', 'Latest per-symbol indicator-enriched snapshots.', snapshots),
        createSection('regime', 'Latest Regime Assessments', 'Current regime classification per dataset/symbol.', regimes),
        createSection('setups', 'Known Setup Modules', 'Setup detectors currently orchestrated by strategy engine.', {
          knownSetups: signalSummary.knownSetups,
          setupCountsFromQualifiedSignals: signalSummary.setupCounts,
        }),
        createSection('signals', 'Latest Qualified Signals', 'Signal outputs from Phase 3 strategy evaluation.', {
          symbolsEvaluated: this.queryService.getSignals().symbolsEvaluated,
          qualifiedSignals: signalSummary.latestQualifiedSignals,
          unqualifiedSummary: signalSummary.unqualifiedSummary,
        }),
        createSection('best_signal', 'Best Signal Summary', 'Top-ranked signal across current batch evaluation.', signalSummary.bestSignal),
        createSection('modes', 'Supported Modes', 'Modes supported by architecture boundaries.', platform.supportedModes),
        createSection('venues', 'Execution Venues', 'Configured execution venue contracts for later phases.', platform.executionVenues),
        createSection('profiles', 'Supported Profiles', 'Strategy/risk profile codes available for orchestration.', platform.profiles),
      ],
    };
  }

  getReplayPage(): FoundationPage {
    return {
      path: '/replay',
      title: 'Replay Foundation',
      subtitle: 'Replay architecture now has datasets + snapshots + regime + signal generation. Trade simulation remains deferred.',
      readiness: 'phase3_ready',
      sections: [
        createSection('datasets', 'Replay Datasets', 'Dataset inputs available to replay loop shell.', this.queryService.getDatasets()),
        createSection('snapshots', 'Replay Snapshots', 'Latest snapshots available through shared evaluation service.', this.queryService.getSnapshots()),
        createSection('regime', 'Replay Regime State', 'Regime assessments available for replay setup decisions.', this.queryService.getRegimes()),
        createSection('signals', 'Replay Signal Layer Access', 'Replay pipeline can now consume generated setup/signal outputs.', this.queryService.getSignals()),
      ],
    };
  }

  getBacktestPage(): FoundationPage {
    return {
      path: '/backtest',
      title: 'Backtest Foundation',
      subtitle: 'Instant backtest architecture now includes signal generation inputs; full execution simulation remains deferred.',
      readiness: 'phase3_ready',
      sections: [
        createSection('datasets', 'Backtest Datasets', 'Data sources available for instant backtest ingestion.', this.queryService.getDatasets()),
        createSection('snapshots', 'Backtest Snapshots', 'Indicator snapshots computed via shared strategy package.', this.queryService.getSnapshots()),
        createSection('regime', 'Backtest Regime Context', 'Rule-based regimes available for setup filtering.', this.queryService.getRegimes()),
        createSection('signals', 'Backtest Signal Generation', 'Backtest layer has access to strategy signal outputs for future execution harnesses.', this.queryService.getSignals()),
      ],
    };
  }

  getLivePage(): FoundationPage {
    const config = this.queryService.getConfig();

    return {
      path: '/live',
      title: 'Live Architecture Preview',
      subtitle: 'Future live decisioning will consume snapshots + regime + signals; order execution remains out of scope.',
      readiness: 'phase3_ready',
      sections: [
        createSection('separation', 'Web vs Worker Separation', 'Web exposes queries; worker handles evaluation loops.', {
          web: 'API/query orchestration only',
          worker: 'Evaluation shell for snapshot/regime/signal computation',
        }),
        createSection('venues', 'Execution Venues', 'Venue support is declared but execution logic is not implemented yet.', this.getPlatformSummary().executionVenues),
        createSection('decisioning', 'Live Decisioning Inputs', 'Future live decisions will consume these shared outputs.', {
          snapshots: this.queryService.getSnapshots(),
          regime: this.queryService.getRegimes(),
          signals: this.queryService.getSignals(),
          config,
        }),
      ],
    };
  }

  getSettingsPage(): FoundationPage {
    return {
      path: '/settings',
      title: 'Settings and Defaults',
      subtitle: 'Lightweight defaults surfaced for setup/scoring transparency ahead of Phase 4 execution and risk layers.',
      readiness: 'phase3_ready',
      sections: [
        createSection('config', 'Config Notes', 'Current capability configuration surfaced through API.', this.queryService.getConfig()),
        createSection('symbols', 'Symbol Registry Summary', 'Symbol metadata currently available to evaluator and pages.', this.queryService.getSymbols()),
        createSection('regime_defaults', 'Regime Threshold Notes', 'Default regime thresholds from strategy engine for transparency.', DEFAULT_REGIME_THRESHOLDS),
        createSection('setup_defaults', 'Setup Threshold Notes', 'Default thresholds currently used by setup detectors.', {
          trendPullback: DEFAULT_TREND_PULLBACK_THRESHOLDS,
          pullbackV2: DEFAULT_PULLBACK_V2_THRESHOLDS,
          breakout: DEFAULT_BREAKOUT_THRESHOLDS,
        }),
        createSection('scoring_defaults', 'Scoring Notes', 'Default scoring weights and qualification thresholds.', {
          scoreWeights: DEFAULT_SCORE_WEIGHTS,
          scoreThresholds: DEFAULT_SCORE_THRESHOLDS,
          strategyEngineDefaults: DEFAULT_STRATEGY_ENGINE_CONFIG.defaults,
        }),
        createSection('profiles', 'Profile Summary', 'Available profile codes for future Phase 4 risk/execution wiring.', this.getPlatformSummary().profiles),
      ],
    };
  }
}
