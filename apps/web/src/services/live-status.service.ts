import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { EmergencyCommandType, ExecutionVenue } from '@hashi-bot/core';
import type { DatasetRepository } from '@hashi-bot/data';
import {
  CcxtExecutionAdapter,
  CTraderExecutionAdapter,
  MockExecutionAdapter,
  type ExecutionAdapter,
  type ExecutionIncident,
  type LiveEngineState,
  type LiveEngineStatus,
  type VenueOrder,
  type VenuePosition
} from '@hashi-bot/execution';

export interface LiveStatusServiceConfig {
  accountRef: string;
  executionVenue: ExecutionVenue;
}

export interface LiveStatusResponse {
  status: 'ok' | 'unavailable';
  mode: 'paper' | 'live';
  venue: ExecutionVenue;
  accountRef: string;
  adapterReady: boolean;
  latestSyncTs?: number;
  state: LiveEngineState;
  notes: string[];
}

export interface LiveHealthResponse {
  status: 'ok' | 'unavailable';
  venue: ExecutionVenue;
  accountRef: string;
  health: Awaited<ReturnType<ExecutionAdapter['getHealth']>>;
  notes: string[];
}

export interface LiveOrdersResponse {
  status: 'ok' | 'unavailable';
  venue: ExecutionVenue;
  accountRef: string;
  orders: VenueOrder[];
  latestSyncTs?: number;
  notes: string[];
}

export interface LivePositionsResponse {
  status: 'ok' | 'unavailable';
  venue: ExecutionVenue;
  accountRef: string;
  positions: VenuePosition[];
  latestSyncTs?: number;
  notes: string[];
}

export interface LiveIncidentsResponse {
  status: 'ok' | 'unavailable';
  venue: ExecutionVenue;
  accountRef: string;
  incidents: ExecutionIncident[];
  notes: string[];
}

interface PersistedRuntimeSafetyState {
  savedAtTs?: number;
  accountRef?: string;
  venue?: string;
  healthStatus?: string;
  recoveryState?: string;
  lastControlState?: string;
  incidentSummary?: {
    asOfTs?: number;
    totalOpenIncidents?: number;
    criticalIncidentCount?: number;
    latestIncidentMessage?: string;
  };
  lockout?: {
    asOfTs?: number;
    controlState?: string;
    blockNewOrderPlacement?: boolean;
    blockVenueTrading?: boolean;
    blockLiveMode?: boolean;
    reasons?: string[];
  };
  recoveryNotes?: { notedAtTs?: number; message?: string; recoveryState?: string; decision?: { outcome?: string } }[];
  emergencyHistory?: {
    commandId?: string;
    command?: string;
    accepted?: boolean;
    completed?: boolean;
    message?: string;
    errorCode?: string;
    receivedAtTs?: number;
    completedAtTs?: number;
  }[];
}

export interface LiveSafetyResponse {
  status: 'ok' | 'unavailable';
  venue: ExecutionVenue;
  accountRef: string;
  mode: 'paper' | 'live';
  safety: {
    source: 'runtime_state_file' | 'adapter_health_fallback';
    healthStatus: string;
    controlState?: string;
    recoveryState?: string;
    lockout?: PersistedRuntimeSafetyState['lockout'];
    incidentSummary?: PersistedRuntimeSafetyState['incidentSummary'];
    recoveryNotes: PersistedRuntimeSafetyState['recoveryNotes'];
    emergencyHistory: PersistedRuntimeSafetyState['emergencyHistory'];
    lastUpdatedTs?: number;
  };
  notes: string[];
}

export interface LiveEmergencyResponse {
  status: 'accepted_for_visibility' | 'unavailable';
  venue: ExecutionVenue;
  accountRef: string;
  mode: 'paper' | 'live';
  command: EmergencyCommandType;
  message: string;
  notes: string[];
}

function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function runtimeStatePath(): string {
  return resolve(env().WORKER_LIVE_STATE_PATH ?? '.runtime/worker-live-state.json');
}

function buildExecutionAdapter(datasetRepository: DatasetRepository, config: LiveStatusServiceConfig): { adapter: ExecutionAdapter; notes: string[] } {
  const vars = env();
  const symbols = datasetRepository.listSymbols();
  const notes: string[] = [];

  if (config.executionVenue === 'ccxt') {
    notes.push('CCXT venue uses exchange credentials from environment; missing credentials return unavailable status.');
    return {
      adapter: new CcxtExecutionAdapter({
        exchangeId: vars.CCXT_EXCHANGE_ID ?? 'binance',
        accountRef: config.accountRef,
        apiKey: vars.CCXT_API_KEY ?? '',
        secret: vars.CCXT_API_SECRET ?? '',
        password: vars.CCXT_API_PASSWORD,
        sandbox: vars.CCXT_SANDBOX === 'true',
        marketType: (vars.CCXT_MARKET_TYPE as 'spot' | 'swap' | 'future' | 'margin' | undefined) ?? 'spot',
        symbolSpecs: symbols
      }),
      notes
    };
  }

  if (config.executionVenue === 'ctrader') {
    notes.push('cTrader venue uses HTTP gateway credentials from environment; missing tokens return unavailable status.');
    return {
      adapter: new CTraderExecutionAdapter({
        baseUrl: vars.CTRADER_BASE_URL ?? 'http://localhost:8080',
        accountRef: config.accountRef,
        accountId: vars.CTRADER_ACCOUNT_ID ?? 'demo-account-id',
        accessToken: vars.CTRADER_ACCESS_TOKEN ?? '',
        symbolSpecs: symbols
      }),
      notes
    };
  }

  notes.push('Mock venue is deterministic and intended for paper/live-loop dry-run visibility.');
  return {
    adapter: new MockExecutionAdapter({
      accountRef: config.accountRef,
      initialBalance: Number(vars.PAPER_INITIAL_BALANCE ?? 10_000)
    }),
    notes
  };
}

export class LiveStatusService {
  private readonly accountRef: string;
  private readonly mode: 'paper' | 'live';
  private readonly venue: ExecutionVenue;
  private readonly notes: string[];
  private readonly adapter: ExecutionAdapter;

  public constructor(datasetRepository: DatasetRepository) {
    const vars = env();
    this.accountRef = vars.LIVE_ACCOUNT_REF ?? 'paper-account';
    this.mode = (vars.WORKER_MODE === 'live' ? 'live' : 'paper') as 'paper' | 'live';
    this.venue = (vars.EXECUTION_VENUE ?? 'mock') as ExecutionVenue;

    const built = buildExecutionAdapter(datasetRepository, {
      accountRef: this.accountRef,
      executionVenue: this.venue
    });

    this.adapter = built.adapter;
    this.notes = built.notes;
  }

  public async getLiveState(): Promise<LiveStatusResponse> {
    try {
      const sync = await this.adapter.sync(this.accountRef);
      const health = await this.adapter.getHealth(this.accountRef);

      return {
        status: 'ok',
        mode: this.mode,
        venue: this.venue,
        accountRef: this.accountRef,
        adapterReady: true,
        latestSyncTs: sync.fetchedAtTs,
        state: {
          mode: this.mode,
          venue: this.venue,
          accountRef: this.accountRef,
          status: health.status,
          account: sync.account,
          watchedSymbols: sync.openOrders.map((order) => order.symbolCode),
          latestSyncTs: sync.fetchedAtTs,
          openOrders: sync.openOrders,
          openPositions: sync.openPositions,
          latestIncidents: health.latestIncident ? [health.latestIncident] : [],
          health
        },
        notes: this.notes
      };
    } catch (error) {
      return {
        status: 'unavailable',
        mode: this.mode,
        venue: this.venue,
        accountRef: this.accountRef,
        adapterReady: false,
        state: this.emptyState('incident'),
        notes: [...this.notes, this.errorMessage(error)]
      };
    }
  }

  public async getHealth(): Promise<LiveHealthResponse> {
    try {
      const health = await this.adapter.getHealth(this.accountRef, { withSync: true });
      return {
        status: 'ok',
        venue: this.venue,
        accountRef: this.accountRef,
        health,
        notes: this.notes
      };
    } catch (error) {
      return {
        status: 'unavailable',
        venue: this.venue,
        accountRef: this.accountRef,
        health: this.emptyHealth('incident'),
        notes: [...this.notes, this.errorMessage(error)]
      };
    }
  }

  public async getOrders(): Promise<LiveOrdersResponse> {
    try {
      const sync = await this.adapter.sync(this.accountRef);
      return {
        status: 'ok',
        venue: this.venue,
        accountRef: this.accountRef,
        orders: sync.openOrders,
        latestSyncTs: sync.fetchedAtTs,
        notes: this.notes
      };
    } catch (error) {
      return {
        status: 'unavailable',
        venue: this.venue,
        accountRef: this.accountRef,
        orders: [],
        notes: [...this.notes, this.errorMessage(error)]
      };
    }
  }

  public async getPositions(): Promise<LivePositionsResponse> {
    try {
      const sync = await this.adapter.sync(this.accountRef);
      return {
        status: 'ok',
        venue: this.venue,
        accountRef: this.accountRef,
        positions: sync.openPositions,
        latestSyncTs: sync.fetchedAtTs,
        notes: this.notes
      };
    } catch (error) {
      return {
        status: 'unavailable',
        venue: this.venue,
        accountRef: this.accountRef,
        positions: [],
        notes: [...this.notes, this.errorMessage(error)]
      };
    }
  }

  public async getIncidents(): Promise<LiveIncidentsResponse> {
    const runtimeState = await this.readRuntimeState();

    try {
      const health = await this.adapter.getHealth(this.accountRef, { withSync: false });
      return {
        status: 'ok',
        venue: this.venue,
        accountRef: this.accountRef,
        incidents: health.latestIncident ? [health.latestIncident] : [],
        notes: [
          ...this.notes,
          runtimeState ? 'Runtime incident summary is available in /api/live/safety.' : 'Runtime safety state file not found.',
          'Incidents endpoint returns adapter-level latest incident visibility only.'
        ]
      };
    } catch (error) {
      return {
        status: 'unavailable',
        venue: this.venue,
        accountRef: this.accountRef,
        incidents: [],
        notes: [...this.notes, this.errorMessage(error)]
      };
    }
  }

  public async getSafety(): Promise<LiveSafetyResponse> {
    const runtimeState = await this.readRuntimeState();

    if (runtimeState) {
      return {
        status: 'ok',
        venue: this.venue,
        accountRef: this.accountRef,
        mode: this.mode,
        safety: {
          source: 'runtime_state_file',
          healthStatus: runtimeState.healthStatus ?? 'unknown',
          controlState: runtimeState.lastControlState,
          recoveryState: runtimeState.recoveryState,
          lockout: runtimeState.lockout,
          incidentSummary: runtimeState.incidentSummary,
          recoveryNotes: runtimeState.recoveryNotes ?? [],
          emergencyHistory: runtimeState.emergencyHistory ?? [],
          lastUpdatedTs: runtimeState.savedAtTs
        },
        notes: [
          ...this.notes,
          'Safety payload is sourced from worker runtime persistence and may lag current venue state between loop cycles.'
        ]
      };
    }

    const health = await this.getHealth();
    return {
      status: health.status,
      venue: this.venue,
      accountRef: this.accountRef,
      mode: this.mode,
      safety: {
        source: 'adapter_health_fallback',
        healthStatus: health.health.status,
        recoveryNotes: [],
        emergencyHistory: [],
        lastUpdatedTs: health.health.lastHeartbeatTs
      },
      notes: [
        ...health.notes,
        'Runtime safety file unavailable; returning adapter health fallback only.'
      ]
    };
  }

  public async executeEmergency(command: EmergencyCommandType): Promise<LiveEmergencyResponse> {
    return {
      status: 'accepted_for_visibility',
      venue: this.venue,
      accountRef: this.accountRef,
      mode: this.mode,
      command,
      message: 'Web runtime does not directly control worker execution. Command visibility is API-level only in this architecture.',
      notes: [
        ...this.notes,
        'This endpoint is intentionally non-executing in current architecture to avoid fake or unsafe control-plane behavior.',
        'Use worker startup/recovery and operational control flow for real emergency execution.'
      ]
    };
  }

  private async readRuntimeState(): Promise<PersistedRuntimeSafetyState | undefined> {
    try {
      const raw = await readFile(runtimeStatePath(), 'utf8');
      return JSON.parse(raw) as PersistedRuntimeSafetyState;
    } catch {
      return undefined;
    }
  }

  private emptyState(status: LiveEngineStatus): LiveEngineState {
    return {
      mode: this.mode,
      venue: this.venue,
      accountRef: this.accountRef,
      status,
      watchedSymbols: [],
      openOrders: [],
      openPositions: [],
      latestIncidents: [],
      health: this.emptyHealth(status)
    };
  }

  private emptyHealth(status: LiveEngineStatus): LiveEngineState['health'] {
    return {
      venue: this.venue,
      accountRef: this.accountRef,
      status,
      openIncidentCount: 0,
      criticalIncidentCount: 0
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
