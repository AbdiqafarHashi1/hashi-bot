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
      title: 'Hashi Bot Phase 6 Control Center',
      subtitle: 'Replay, backtest, instant runs, and live execution foundation are now visible through API-backed flows.',
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
        createSection('platform', 'Platform Summary', 'Supported modes, venues, and profile codes.', this.getPlatformSummary())
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

    return {
      path: '/live',
      title: 'Live Execution Foundation',
      subtitle: 'Operational visibility into venue/account state, sync status, health, and incidents.',
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
        createSection('orders', 'Open Orders', 'Venue open orders from latest sync.', orders),
        createSection('positions', 'Open Positions', 'Venue open positions from latest sync.', positions),
        createSection('incidents', 'Recent Incidents', 'Recent execution incidents available from current adapter context.', incidents),
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

  async getSettingsPage(): Promise<FoundationPage> {
    const symbols = this.queryService.getSymbols();
    const config = this.queryService.getConfig();
    const live = await this.liveStatusService.getLiveState();

    return {
      path: '/settings',
      title: 'Settings, Venue Notes, and Safety Reminders',
      subtitle: 'Execution configuration visibility and operational cautions for phase-appropriate live foundation use.',
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
        createSection('safety_reminders', 'Safety Reminders', 'Guardrails while Phase 6 live foundation matures.', {
          reminders: [
            'Treat live mode as foundation-stage orchestration, not fully production-hardened execution.',
            'Validate credentials and venue reachability before enabling non-mock execution.',
            'Do not treat unavailable live API responses as successful execution state.',
            'Replay/backtest remain the deterministic verification path.'
          ]
        }),
        createSection('regime_defaults', 'Regime Threshold Notes', 'Default regime thresholds for transparent strategy context.', DEFAULT_REGIME_THRESHOLDS),
      ],
    };
  }
}
