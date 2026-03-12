import type { ExecutionVenue } from '@hashi-bot/core';
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

function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
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
    try {
      const health = await this.adapter.getHealth(this.accountRef, { withSync: false });
      return {
        status: 'ok',
        venue: this.venue,
        accountRef: this.accountRef,
        incidents: health.latestIncident ? [health.latestIncident] : [],
        notes: [
          ...this.notes,
          'Incidents are adapter-level recent events; historical persistence is not wired yet in web runtime.'
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
