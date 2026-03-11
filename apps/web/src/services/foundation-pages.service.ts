import {
  SUPPORTED_BOT_MODES,
  SUPPORTED_EXECUTION_VENUES,
  SUPPORTED_PROFILE_CODES,
  type BotMode,
  type ExecutionVenue,
  type ProfileCode,
} from '@hashi-bot/core';

import { createSection } from '../components/foundation-sections.js';
import type { FoundationPage, PlatformSummary } from '../pages/page-types.js';
import { DEFAULT_REGIME_THRESHOLDS } from '@hashi-bot/strategy';

import { Phase2QueryService } from './phase2-query.service.js';

export class FoundationPagesService {
  constructor(private readonly queryService: Phase2QueryService) {}

  private getPlatformSummary(): PlatformSummary {
    return {
      supportedModes: [...SUPPORTED_BOT_MODES] as BotMode[],
      executionVenues: [...SUPPORTED_EXECUTION_VENUES] as ExecutionVenue[],
      profiles: [...SUPPORTED_PROFILE_CODES] as ProfileCode[],
    };
  }

  getOverviewPage(): FoundationPage {
    const symbols = this.queryService.getSymbols();
    const datasets = this.queryService.getDatasets();
    const snapshots = this.queryService.getSnapshots();
    const regimes = this.queryService.getRegimes();
    const platform = this.getPlatformSummary();

    return {
      path: '/',
      title: 'Hashi Bot Phase 2 Overview',
      subtitle: 'Indicator/regime foundation visibility for Phase 3 setup readiness.',
      readiness: 'phase2_ready',
      sections: [
        createSection('symbols', 'Known Symbols', 'Symbol registry available to evaluation paths.', symbols),
        createSection('datasets', 'Datasets', 'Datasets currently available for replay/backtest-style evaluation.', datasets),
        createSection('snapshots', 'Latest Snapshots', 'Latest per-symbol indicator-enriched snapshots.', snapshots),
        createSection('regime', 'Latest Regime Assessments', 'Current regime classification per dataset/symbol.', regimes),
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
      subtitle: 'Replay pipeline has dataset/snapshot/regime inputs wired. Trading loop intentionally deferred.',
      readiness: 'foundation',
      sections: [
        createSection('datasets', 'Replay Datasets', 'Dataset inputs available to replay loop shell.', this.queryService.getDatasets()),
        createSection('snapshots', 'Replay Snapshots', 'Latest snapshots available through shared evaluation service.', this.queryService.getSnapshots()),
        createSection('regime', 'Replay Regime State', 'Regime assessments available for later replay setup decisions.', this.queryService.getRegimes()),
      ],
    };
  }

  getBacktestPage(): FoundationPage {
    return {
      path: '/backtest',
      title: 'Backtest Foundation',
      subtitle: 'Instant backtest architecture has required Phase 2 context inputs; final backtest logic deferred.',
      readiness: 'foundation',
      sections: [
        createSection('datasets', 'Backtest Datasets', 'Data sources available for instant backtest ingestion.', this.queryService.getDatasets()),
        createSection('snapshots', 'Backtest Snapshots', 'Indicator snapshots computed via shared strategy package.', this.queryService.getSnapshots()),
        createSection('regime', 'Backtest Regime Context', 'Rule-based regimes available for setup filtering in Phase 3.', this.queryService.getRegimes()),
      ],
    };
  }

  getLivePage(): FoundationPage {
    const config = this.queryService.getConfig();

    return {
      path: '/live',
      title: 'Live Architecture Preview',
      subtitle: 'Web orchestration and worker runtime are separated; live execution remains out of scope in Phase 2.',
      readiness: 'foundation',
      sections: [
        createSection('separation', 'Web vs Worker Separation', 'Web exposes queries; worker handles evaluation loops.', {
          web: 'API/query orchestration only',
          worker: 'Evaluation shell for snapshot/regime computation',
        }),
        createSection('venues', 'Execution Venues', 'Venue support is declared but execution logic is not implemented yet.', this.getPlatformSummary().executionVenues),
        createSection('decisioning', 'Live Decisioning Inputs', 'Future live decisions will consume these shared outputs.', {
          snapshots: this.queryService.getSnapshots(),
          regime: this.queryService.getRegimes(),
          config,
        }),
      ],
    };
  }

  getSettingsPage(): FoundationPage {
    return {
      path: '/settings',
      title: 'Settings and Defaults',
      subtitle: 'Configuration and profile notes for Phase 2 foundations and Phase 3 extension points.',
      readiness: 'phase2_ready',
      sections: [
        createSection('config', 'Config Notes', 'Current capability configuration surfaced through API.', this.queryService.getConfig()),
        createSection('symbols', 'Symbol Registry Summary', 'Symbol metadata currently available to evaluator and pages.', this.queryService.getSymbols()),
        createSection('regime_defaults', 'Regime Threshold Notes', 'Default regime thresholds from strategy engine for transparency.', DEFAULT_REGIME_THRESHOLDS),
        createSection('profiles', 'Profile Summary', 'Available profile codes for future Phase 3 setup/risk wiring.', this.getPlatformSummary().profiles),
      ],
    };
  }
}
