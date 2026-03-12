import { SUPPORTED_EXECUTION_VENUES } from '@hashi-bot/core';
import { DEFAULT_REGIME_THRESHOLDS } from '@hashi-bot/strategy';

import type { LiveHealthResponse, LiveSafetyResponse, LiveStatusResponse } from '../../services/live-status.service.js';
import type { Phase2QueryService } from '../../services/phase2-query.service.js';
import {
  createCardContainer,
  createDataTableWrapper,
  createDetailPanel,
  createMetricRow,
  createPageHeader,
  createSectionHeader,
} from '../ui/index.js';

export interface SettingsWorkspaceModel {
  kind: 'settings_workspace';
  pageHeader: ReturnType<typeof createPageHeader>;
  sections: {
    profiles: {
      header: ReturnType<typeof createSectionHeader>;
      profileCards: Array<ReturnType<typeof createCardContainer>>;
      comparisonPanel: ReturnType<typeof createDetailPanel>;
    };
    watchlists: {
      header: ReturnType<typeof createSectionHeader>;
      cryptoWatchlistCard: ReturnType<typeof createCardContainer>;
      forexWatchlistCard: ReturnType<typeof createCardContainer>;
      watchlistPolicyCard: ReturnType<typeof createCardContainer>;
    };
    symbols: {
      header: ReturnType<typeof createSectionHeader>;
      summaryCards: Array<ReturnType<typeof createCardContainer>>;
      symbolRegistryTable: ReturnType<typeof createDataTableWrapper>;
    };
    execution: {
      header: ReturnType<typeof createSectionHeader>;
      venueCard: ReturnType<typeof createCardContainer>;
      configCard: ReturnType<typeof createCardContainer>;
    };
    safety: {
      header: ReturnType<typeof createSectionHeader>;
      notesCard: ReturnType<typeof createCardContainer>;
      guidancePanel: ReturnType<typeof createDetailPanel>;
    };
    strategyRisk: {
      header: ReturnType<typeof createSectionHeader>;
      strategyCard: ReturnType<typeof createCardContainer>;
      riskCard: ReturnType<typeof createCardContainer>;
    };
  };
  notes: string[];
}

export function buildSettingsWorkspaceModel(input: {
  queryService: Phase2QueryService;
  live: LiveStatusResponse;
  health: LiveHealthResponse;
  safety: LiveSafetyResponse;
}): SettingsWorkspaceModel {
  const symbols = input.queryService.getSymbols().symbols;
  const config = input.queryService.getConfig();
  const backtestConfig = input.queryService.getBacktestConfigs();

  const activeSymbols = symbols.filter((symbol) => symbol.isActive);
  const cryptoSymbols = activeSymbols.filter((symbol) => symbol.marketType === 'crypto');
  const forexSymbols = activeSymbols.filter((symbol) => symbol.marketType === 'forex');

  const growth = {
    label: 'Growth Hunter',
    riskPerTradePct: 1.0,
    minSignalScore: 62,
    maxOpenPositions: 6,
    maxDailyLossPct: 4.5,
    cooldownMinutes: 15,
    maxTradesPerDay: 8,
    maxPortfolioHeatPct: 4.0,
    maxGlobalDrawdownPct: 14,
    maxCorrelatedHeatPct: 3,
  };
  const prop = {
    label: 'Prop Hunter',
    riskPerTradePct: 0.5,
    minSignalScore: 70,
    maxOpenPositions: 3,
    maxDailyLossPct: 2.0,
    cooldownMinutes: 45,
    maxTradesPerDay: 5,
    maxPortfolioHeatPct: 2.0,
    maxGlobalDrawdownPct: 8,
    maxCorrelatedHeatPct: 1.5,
  };

  const supportsEditableProfiles = false;
  const supportsEditableWatchlists = false;

  return {
    kind: 'settings_workspace',
    pageHeader: createPageHeader({
      title: 'Settings and Configuration Center',
      description:
        'Operator-focused visibility for profiles, watchlists, symbols, execution context, and safety/risk constraints.',
      statuses: [input.live.mode === 'live' ? 'live' : 'paper', input.health.health.status === 'degraded' ? 'degraded' : 'healthy'],
      actions: [
        { key: 'to-live', label: 'Open Live', actionId: 'nav:live', intent: 'danger' },
        { key: 'to-safety', label: 'Open Safety', actionId: 'nav:safety', intent: 'danger' },
        { key: 'to-overview', label: 'Open Overview', actionId: 'nav:overview' },
      ],
    }),
    sections: {
      profiles: {
        header: createSectionHeader(
          'Profiles',
          'GROWTH_HUNTER and PROP_HUNTER operating envelopes',
          'Profiles are currently visible and selectable in run-launch flows; profile editing is not exposed in the web app yet.'
        ),
        profileCards: [
          createCardContainer(
            [
              `Label: ${growth.label}`,
              `Risk / trade: ${growth.riskPerTradePct}%`,
              `Min signal score: ${growth.minSignalScore}`,
              `Max open positions: ${growth.maxOpenPositions}`,
              `Daily loss guardrail: ${growth.maxDailyLossPct}%`,
              `Cooldown: ${growth.cooldownMinutes}m`,
            ],
            'GROWTH_HUNTER',
            'elevated'
          ),
          createCardContainer(
            [
              `Label: ${prop.label}`,
              `Risk / trade: ${prop.riskPerTradePct}%`,
              `Min signal score: ${prop.minSignalScore}`,
              `Max open positions: ${prop.maxOpenPositions}`,
              `Daily loss guardrail: ${prop.maxDailyLossPct}%`,
              `Cooldown: ${prop.cooldownMinutes}m`,
            ],
            'PROP_HUNTER',
            'default'
          ),
        ],
        comparisonPanel: createDetailPanel('Profile Difference Matrix', [
          {
            title: 'Aggression and selectivity',
            rows: [
              createMetricRow('Risk per trade', `${growth.riskPerTradePct}% vs ${prop.riskPerTradePct}%`, 'degraded'),
              createMetricRow('Minimum signal score', `${growth.minSignalScore} vs ${prop.minSignalScore}`, 'degraded'),
              createMetricRow('Max trades/day', `${growth.maxTradesPerDay} vs ${prop.maxTradesPerDay}`, 'degraded'),
            ],
          },
          {
            title: 'Exposure and drawdown controls',
            rows: [
              createMetricRow('Max portfolio heat', `${growth.maxPortfolioHeatPct}% vs ${prop.maxPortfolioHeatPct}%`),
              createMetricRow('Max global drawdown', `${growth.maxGlobalDrawdownPct}% vs ${prop.maxGlobalDrawdownPct}%`),
              createMetricRow('Max correlated heat', `${growth.maxCorrelatedHeatPct}% vs ${prop.maxCorrelatedHeatPct}%`),
            ],
          },
        ]),
      },
      watchlists: {
        header: createSectionHeader(
          'Watchlists',
          'Structured market watchlists by venue domain',
          'Current watchlists are derived from the symbol registry; dedicated watchlist persistence/editing is planned for a later phase.'
        ),
        cryptoWatchlistCard: createCardContainer(
          [
            `Count: ${cryptoSymbols.length}`,
            `Symbols: ${cryptoSymbols.map((symbol) => symbol.symbolCode).join(', ') || 'none'}`,
            `Sessions: ${Array.from(new Set(cryptoSymbols.map((symbol) => symbol.sessionType))).join(', ') || 'n/a'}`,
            'Structure: crypto watchlist is always-open oriented and grouped by symbol registry marketType=crypto.',
          ],
          'Crypto Watchlist',
          'elevated'
        ),
        forexWatchlistCard: createCardContainer(
          [
            `Count: ${forexSymbols.length}`,
            `Symbols: ${forexSymbols.map((symbol) => symbol.symbolCode).join(', ') || 'none'}`,
            `Sessions: ${Array.from(new Set(forexSymbols.map((symbol) => symbol.sessionType))).join(', ') || 'n/a'}`,
            'Structure: forex watchlist follows session-aware pairs from marketType=forex.',
          ],
          'Forex Watchlist',
          'default'
        ),
        watchlistPolicyCard: createCardContainer(
          [
            `Editable now: ${supportsEditableWatchlists ? 'yes' : 'no'}`,
            'Selection now: choose symbols during replay/backtest launch using this registry-derived watchlist.',
            'Future phase: persistent named watchlists with direct edit controls.',
          ],
          'Watchlist Policy and Editability',
          supportsEditableWatchlists ? 'elevated' : 'default'
        ),
      },
      symbols: {
        header: createSectionHeader(
          'Symbols',
          'Registry summary and operator-meaningful metadata',
          'Shows what instruments are active and tradable by market type and precision constraints.'
        ),
        summaryCards: [
          createCardContainer(
            [
              `Total symbols: ${symbols.length}`,
              `Active: ${activeSymbols.length}`,
              `Inactive: ${symbols.length - activeSymbols.length}`,
              `Market types: ${Array.from(new Set(symbols.map((symbol) => symbol.marketType))).join(', ')}`,
            ],
            'Registry Health',
            'elevated'
          ),
          createCardContainer(
            [
              `Crypto symbols: ${symbols.filter((symbol) => symbol.marketType === 'crypto').length}`,
              `Forex symbols: ${symbols.filter((symbol) => symbol.marketType === 'forex').length}`,
              `Always-open sessions: ${symbols.filter((symbol) => symbol.sessionType === 'always_open').length}`,
              `Forex sessions: ${symbols.filter((symbol) => symbol.sessionType === 'forex_session').length}`,
            ],
            'Market Coverage',
            'default'
          ),
        ],
        symbolRegistryTable: createDataTableWrapper('Symbol Registry', [
          { key: 'symbolCode', label: 'Symbol', width: '120px' },
          { key: 'marketType', label: 'Market', width: '100px' },
          { key: 'sessionType', label: 'Session', width: '140px' },
          { key: 'baseCurrency', label: 'Base', width: '100px' },
          { key: 'quoteCurrency', label: 'Quote', width: '100px' },
          { key: 'tickSize', label: 'Tick', width: '100px' },
          { key: 'pricePrecision', label: 'Price P', width: '100px' },
          { key: 'qtyPrecision', label: 'Qty P', width: '90px' },
          { key: 'isActive', label: 'Active', width: '90px' },
        ], undefined, { density: 'compact', stickyHeader: true, stripedRows: true, horizontalScroll: 'auto' }),
      },
      execution: {
        header: createSectionHeader(
          'Execution and Venues',
          'Current runtime venue selection and supported venue options',
          'Execution configuration is read-only in this view; venue credentials and enablement remain environment/worker controlled.'
        ),
        venueCard: createCardContainer(
          [
            `Runtime mode: ${input.live.mode}`,
            `Current venue: ${input.live.venue}`,
            `Account reference: ${input.live.accountRef}`,
            `Adapter ready: ${String(input.live.adapterReady)}`,
            `Supported venues: ${SUPPORTED_EXECUTION_VENUES.join(', ')}`,
          ],
          'Venue and Account Context',
          input.live.mode === 'live' ? 'danger' : 'elevated'
        ),
        configCard: createCardContainer(
          [
            `Latest sync: ${input.live.latestSyncTs ?? 'n/a'}`,
            `Health status: ${input.health.health.status}`,
            `Supports live flag: ${String(config.supports.live)}`,
            `Supports paper flag: ${String(config.supports.paper)}`,
          ],
          'Execution Configuration Notes',
          'default'
        ),
      },
      safety: {
        header: createSectionHeader(
          'Safety Notes',
          'Operational restrictions and recovery reminders',
          'For active incidents and triage, use the dedicated Safety workspace.'
        ),
        notesCard: createCardContainer(
          [
            `Control state: ${input.safety.safety.controlState ?? input.safety.safety.lockout?.controlState ?? 'unknown'}`,
            `Recovery state: ${input.safety.safety.recoveryState ?? 'n/a'}`,
            `Block venue trading: ${String(input.safety.safety.lockout?.blockVenueTrading ?? false)}`,
            `Block live mode: ${String(input.safety.safety.lockout?.blockLiveMode ?? false)}`,
            `Safety source: ${input.safety.safety.source}`,
          ],
          'Safety State Snapshot',
          input.safety.safety.controlState === 'kill_switched' ? 'danger' : 'default'
        ),
        guidancePanel: createDetailPanel('Safety Guidance', [
          {
            title: 'Immediate checks',
            rows: [
              createMetricRow('Open incidents', String(input.health.health.openIncidentCount), input.health.health.openIncidentCount > 0 ? 'degraded' : 'healthy'),
              createMetricRow('Critical incidents', String(input.health.health.criticalIncidentCount), input.health.health.criticalIncidentCount > 0 ? 'kill_switched' : 'healthy'),
              createMetricRow('Recovery notes entries', String(input.safety.safety.recoveryNotes?.length ?? 0)),
            ],
          },
          {
            title: 'Operator reminders',
            rows: [
              createMetricRow('Use /safety for incident triage', 'recommended', 'healthy'),
              createMetricRow('Treat unavailable venue data as unavailable', 'required', 'degraded'),
              createMetricRow('Emergency controls in web runtime', 'visibility-only', 'paused'),
            ],
          },
        ]),
      },
      strategyRisk: {
        header: createSectionHeader(
          'Strategy and Risk Summaries',
          'High-signal defaults used by run configuration and guardrails',
          'This section surfaces practical defaults; it does not expose full strategy parameter editing yet.'
        ),
        strategyCard: createCardContainer(
          [
            `Supports snapshots: ${String(config.features.snapshots)}`,
            `Supports regime: ${String(config.features.regime)}`,
            `Supports risk decisioning: ${String(config.features.riskDecisioning)}`,
            `Supports lifecycle simulation: ${String(config.features.lifecycleSimulation)}`,
            `Regime thresholds: trend ADX >= ${DEFAULT_REGIME_THRESHOLDS.trendAdxMin}, trend chop <= ${DEFAULT_REGIME_THRESHOLDS.trendChopMax}, low-vol ATR% <= ${DEFAULT_REGIME_THRESHOLDS.lowVolAtrPctMax}`,
          ],
          'Strategy Context',
          'elevated'
        ),
        riskCard: createCardContainer(
          [
            `Backtest default balance: ${backtestConfig.defaults.initialBalance}`,
            `Default slippage (bps): ${backtestConfig.defaults.slippageBps}`,
            `Default commission (bps): ${backtestConfig.defaults.commissionBps}`,
            `Default max concurrent positions: ${backtestConfig.defaults.maxConcurrentPositions}`,
            'Editable now: no (selection only)',
          ],
          'Risk and Run Defaults',
          'default'
        ),
      },
    },
    notes: [
      'Settings surfaces structured operational context instead of raw JSON dumps.',
      'Profiles and watchlists are currently visibility + selection surfaces; direct editing is deferred to future phases.',
      'All values are derived from existing query/live/safety services and shared package defaults.',
    ],
  };
}
