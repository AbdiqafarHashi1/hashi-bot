import type { EpochMs, JsonValue, SymbolCode, SymbolSpec } from '@hashi-bot/core';

import type { AdapterHealthOptions, ExecutionAdapter, ExecutionSyncOptions } from '../../base/execution-adapter.js';
import { buildVenueOrderPayload } from '../../mapping/order-map.js';
import { buildDefaultVenueSymbol, createSymbolMap, resolveVenueSymbol, type SymbolMapEntry } from '../../mapping/symbol-map.js';
import type {
  AccountSnapshot,
  CancelRequest,
  CancelResult,
  ExecutionHealthSummary,
  ExecutionIncident,
  ExecutionOrderType,
  ExecutionRequest,
  ExecutionResult,
  LiveEngineStatus,
  SyncSnapshot,
  VenueOrder,
  VenueOrderStatus,
  VenuePosition
} from '../../types/execution-domain.js';
import { classifyCcxtError } from './ccxt.errors.js';

type CcxtOrder = Record<string, unknown>;
type CcxtPosition = Record<string, unknown>;
type CcxtBalance = Record<string, unknown>;

interface CcxtExchangeLike {
  has?: Record<string, boolean | 'emulated'>;
  markets?: Record<string, unknown>;
  loadMarkets: () => Promise<unknown>;
  setSandboxMode?: (enabled: boolean) => void;
  fetchBalance: (params?: Record<string, unknown>) => Promise<CcxtBalance>;
  fetchOpenOrders: (symbol?: string, since?: number, limit?: number, params?: Record<string, unknown>) => Promise<CcxtOrder[]>;
  fetchPositions?: (symbols?: string[], params?: Record<string, unknown>) => Promise<CcxtPosition[]>;
  createOrder: (
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number,
    params?: Record<string, unknown>
  ) => Promise<CcxtOrder>;
  cancelOrder: (id: string, symbol?: string, params?: Record<string, unknown>) => Promise<CcxtOrder>;
  fetchStatus?: () => Promise<{ status?: string; msg?: string }>;
}

export interface CcxtAdapterConfig {
  exchangeId: string;
  accountRef: string;
  apiKey: string;
  secret: string;
  password?: string;
  uid?: string;
  sandbox?: boolean;
  enableRateLimit?: boolean;
  marketType?: 'spot' | 'swap' | 'future' | 'margin';
  symbolSpecs: SymbolSpec[];
  symbolMapEntries?: SymbolMapEntry[];
  extraOptions?: Record<string, unknown>;
  clock?: () => EpochMs;
}

export class CcxtExecutionAdapter implements ExecutionAdapter {
  public readonly venue = 'ccxt' as const;

  private readonly config: CcxtAdapterConfig;
  private readonly now: () => EpochMs;
  private readonly symbolSpecsByCode: Map<SymbolCode, SymbolSpec>;
  private readonly symbolMap: Map<SymbolCode, SymbolMapEntry>;
  private readonly incidents: ExecutionIncident[] = [];

  private client?: CcxtExchangeLike;
  private latestSyncTs?: EpochMs;

  public constructor(config: CcxtAdapterConfig) {
    this.config = config;
    this.now = config.clock ?? (() => Date.now() as EpochMs);
    this.symbolSpecsByCode = new Map(config.symbolSpecs.map((spec) => [spec.symbolCode, spec]));

    const entries = config.symbolMapEntries ?? config.symbolSpecs.map((spec) => ({
      symbolCode: spec.symbolCode,
      defaultVenueSymbol: buildDefaultVenueSymbol(spec, 'ccxt')
    }));
    this.symbolMap = createSymbolMap({ entries });
  }

  public async initialize(): Promise<void> {
    await this.getClient();
  }

  public async getAccountSnapshot(accountRef: string): Promise<AccountSnapshot> {
    this.assertAccount(accountRef);
    const client = await this.getClient();

    try {
      const balance = await client.fetchBalance(this.buildMarketParams());
      const total = this.readRecord(balance.total);
      const free = this.readRecord(balance.free);
      const used = this.readRecord(balance.used);
      const fetchedAtTs = this.now();

      const balanceRows = Object.keys(total).map((asset) => ({
        asset,
        total: Number(total[asset] ?? 0),
        free: Number(free[asset] ?? 0),
        used: Number(used[asset] ?? 0),
        raw: this.toJsonValue({
          free: this.asOptionalNumber(free[asset]),
          used: this.asOptionalNumber(used[asset]),
          total: this.asOptionalNumber(total[asset])
        })
      }));

      const totalBalance = balanceRows.reduce((sum, row) => sum + row.total, 0);

      return {
        venue: this.venue,
        accountRef,
        balance: totalBalance,
        equity: totalBalance,
        balances: balanceRows,
        fetchedAtTs,
        raw: this.toJsonValue(balance)
      };
    } catch (error) {
      throw this.raiseIncident('sync_failure', 'error', 'Failed to fetch CCXT account snapshot.', error);
    }
  }

  public async getOpenOrders(accountRef: string, symbolCode?: SymbolCode): Promise<VenueOrder[]> {
    this.assertAccount(accountRef);
    const client = await this.getClient();

    try {
      const symbol = symbolCode ? this.resolveSymbol(symbolCode) : undefined;
      const orders = await client.fetchOpenOrders(symbol, undefined, undefined, this.buildMarketParams());
      return orders.map((order) => this.mapOrder(order));
    } catch (error) {
      throw this.raiseIncident('sync_failure', 'warning', 'Failed to fetch CCXT open orders.', error);
    }
  }

  public async getOpenPositions(accountRef: string, symbolCode?: SymbolCode): Promise<VenuePosition[]> {
    this.assertAccount(accountRef);
    const client = await this.getClient();

    if (!client.fetchPositions || !client.has?.fetchPositions) {
      return [];
    }

    try {
      const symbols = symbolCode ? [this.resolveSymbol(symbolCode)] : undefined;
      const positions = await client.fetchPositions(symbols, this.buildMarketParams());
      return positions.map((position) => this.mapPosition(position));
    } catch (error) {
      throw this.raiseIncident('sync_failure', 'warning', 'Failed to fetch CCXT positions.', error);
    }
  }

  public async placeOrder(request: ExecutionRequest): Promise<ExecutionResult> {
    this.assertAccount(request.accountRef);
    const client = await this.getClient();
    const receivedAtTs = this.now();

    try {
      const symbolSpec = this.getSymbolSpec(request.symbolCode);
      const venueSymbol = request.venueSymbol || this.resolveSymbol(request.symbolCode);
      const payload = buildVenueOrderPayload({ ...request, venueSymbol }, symbolSpec);

      const params: Record<string, unknown> = {
        ...this.buildMarketParams(),
        ...(payload.clientOrderId ? { clientOrderId: payload.clientOrderId } : {}),
        ...(payload.stopPrice ? { stopPrice: payload.stopPrice, triggerPrice: payload.stopPrice } : {}),
        ...(payload.reduceOnly !== undefined ? { reduceOnly: payload.reduceOnly } : {})
      };

      const response = await client.createOrder(
        payload.symbol,
        this.mapOrderType(payload.type),
        payload.side,
        payload.quantity,
        payload.price,
        params
      );

      const normalizedOrder = this.mapOrder(response);

      return {
        venue: this.venue,
        accountRef: request.accountRef,
        accepted: true,
        request,
        orderId: normalizedOrder.orderId,
        order: normalizedOrder,
        status: normalizedOrder.status,
        receivedAtTs,
        raw: this.toJsonValue(response)
      };
    } catch (error) {
      const classified = classifyCcxtError(error);
      this.raiseIncident(classified.code, classified.retriable ? 'warning' : 'error', classified.message, error);

      return {
        venue: this.venue,
        accountRef: request.accountRef,
        accepted: false,
        request,
        status: 'rejected',
        message: classified.message,
        errorCode: classified.adapterErrorCode,
        receivedAtTs,
        raw: this.toJsonValue(this.normalizeError(error))
      };
    }
  }

  public async cancelOrder(request: CancelRequest): Promise<CancelResult> {
    this.assertAccount(request.accountRef);
    const client = await this.getClient();
    const receivedAtTs = this.now();

    try {
      const symbol = request.venueSymbol || this.resolveSymbol(request.symbolCode);
      const orderId = request.orderId ?? (await this.findOrderIdByClientOrderId(symbol, request.clientOrderId));

      if (!orderId) {
        return {
          venue: this.venue,
          accountRef: request.accountRef,
          canceled: false,
          request,
          status: 'rejected',
          message: 'Order not found for cancellation.',
          errorCode: 'order_not_found',
          receivedAtTs
        };
      }

      const response = await client.cancelOrder(orderId, symbol, this.buildMarketParams());
      const mapped = this.mapOrder(response);

      return {
        venue: this.venue,
        accountRef: request.accountRef,
        canceled: true,
        request,
        orderId,
        status: mapped.status,
        receivedAtTs,
        raw: this.toJsonValue(response)
      };
    } catch (error) {
      const classified = classifyCcxtError(error);
      this.raiseIncident('cancel_order_failure', classified.retriable ? 'warning' : 'error', classified.message, error);

      return {
        venue: this.venue,
        accountRef: request.accountRef,
        canceled: false,
        request,
        status: 'rejected',
        message: classified.message,
        errorCode: classified.adapterErrorCode,
        receivedAtTs,
        raw: this.toJsonValue(this.normalizeError(error))
      };
    }
  }

  public async cancelAllForSymbol(accountRef: string, symbolCode: SymbolCode): Promise<CancelResult[]> {
    this.assertAccount(accountRef);
    const venueSymbol = this.resolveSymbol(symbolCode);
    const openOrders = await this.getOpenOrders(accountRef, symbolCode);

    const results: CancelResult[] = [];
    for (const order of openOrders) {
      results.push(await this.cancelOrder({
        venue: this.venue,
        accountRef,
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        symbolCode,
        venueSymbol,
        requestedAtTs: this.now()
      }));
    }

    return results;
  }

  public async sync(accountRef: string, options?: ExecutionSyncOptions): Promise<SyncSnapshot> {
    this.assertAccount(accountRef);
    const account = await this.getAccountSnapshot(accountRef);

    const symbolFilter = options?.symbolCodes ? new Set(options.symbolCodes) : null;
    const openOrders = (await this.getOpenOrders(accountRef)).filter((order) => (symbolFilter ? symbolFilter.has(order.symbolCode) : true));
    const openPositions = (await this.getOpenPositions(accountRef)).filter((position) =>
      (symbolFilter ? symbolFilter.has(position.symbolCode) : true)
    );

    const fetchedAtTs = this.now();
    this.latestSyncTs = fetchedAtTs;

    return {
      venue: this.venue,
      accountRef,
      fetchedAtTs,
      account,
      openOrders,
      openPositions,
      raw: {
        exchangeId: this.config.exchangeId,
        symbolFiltered: Boolean(symbolFilter)
      }
    };
  }

  public async getHealth(accountRef: string, options?: AdapterHealthOptions): Promise<ExecutionHealthSummary> {
    this.assertAccount(accountRef);

    if (options?.withSync) {
      await this.sync(accountRef);
    }

    const client = await this.getClient();
    let status: LiveEngineStatus = 'running';
    let latestMessage: string | undefined;

    if (client.fetchStatus && client.has?.fetchStatus) {
      try {
        const exchangeStatus = await client.fetchStatus();
        if (exchangeStatus.status && exchangeStatus.status !== 'ok') {
          status = 'degraded';
          latestMessage = exchangeStatus.msg;
        }
      } catch (error) {
        status = 'degraded';
        latestMessage = error instanceof Error ? error.message : 'Unable to fetch exchange status.';
      }
    }

    const openIncidents = this.incidents.filter((incident) => incident.resolvedAtTs === undefined);
    const latestIncident = this.incidents[this.incidents.length - 1];
    if (openIncidents.length > 0) {
      status = 'degraded';
    }

    return {
      venue: this.venue,
      accountRef,
      status,
      lastHeartbeatTs: this.now(),
      lastSyncTs: this.latestSyncTs,
      openIncidentCount: openIncidents.length,
      criticalIncidentCount: openIncidents.filter((incident) => incident.severity === 'critical').length,
      latestIncident: latestIncident ?? (latestMessage ? this.buildTransientIncident(latestMessage) : undefined)
    };
  }

  private async getClient(): Promise<CcxtExchangeLike> {
    if (this.client) {
      return this.client;
    }

    if (!this.config.apiKey || !this.config.secret) {
      throw this.raiseIncident('auth_failure', 'critical', 'Missing CCXT API credentials.');
    }

    try {
      const ccxtModule = (await import('ccxt')) as Record<string, unknown>;
      const ExchangeCtor = ccxtModule[this.config.exchangeId];
      if (typeof ExchangeCtor !== 'function') {
        throw new Error(`Unsupported CCXT exchange: ${this.config.exchangeId}`);
      }

      const client = new (ExchangeCtor as new (args: Record<string, unknown>) => CcxtExchangeLike)({
        apiKey: this.config.apiKey,
        secret: this.config.secret,
        password: this.config.password,
        uid: this.config.uid,
        enableRateLimit: this.config.enableRateLimit ?? true,
        options: {
          defaultType: this.config.marketType,
          ...(this.config.extraOptions ?? {})
        }
      });

      if (this.config.sandbox && client.setSandboxMode) {
        client.setSandboxMode(true);
      }

      await client.loadMarkets();
      this.client = client;
      return client;
    } catch (error) {
      throw this.raiseIncident('adapter_unreachable', 'critical', 'Failed to initialize CCXT client.', error);
    }
  }

  private mapOrder(order: CcxtOrder): VenueOrder {
    const symbol = String(order.symbol ?? '');
    const symbolCode = this.resolveSymbolCode(symbol);
    const status = this.mapOrderStatus(String(order.status ?? 'open'));
    const updatedAtTs = this.asEpoch(order.lastTradeTimestamp) ?? this.asEpoch(order.timestamp) ?? this.now();

    return {
      venue: this.venue,
      accountRef: this.config.accountRef,
      orderId: String(order.id ?? ''),
      clientOrderId: this.asOptionalString(order.clientOrderId),
      symbolCode,
      venueSymbol: symbol,
      side: String(order.side ?? 'buy') === 'sell' ? 'sell' : 'buy',
      orderType: this.mapOrderTypeFromCcxt(String(order.type ?? 'limit')),
      status,
      quantity: this.asNumber(order.amount),
      filledQuantity: this.asNumber(order.filled),
      remainingQuantity: this.asOptionalNumber(order.remaining),
      price: this.asOptionalNumber(order.price),
      averageFillPrice: this.asOptionalNumber(order.average),
      stopPrice: this.asOptionalNumber(order.stopPrice),
      timeInForce: this.mapTimeInForce(this.asOptionalString(order.timeInForce)),
      submittedAtTs: this.asEpoch(order.timestamp),
      updatedAtTs,
      raw: this.toJsonValue(order)
    };
  }

  private mapPosition(position: CcxtPosition): VenuePosition {
    const symbol = String(position.symbol ?? '');
    const symbolCode = this.resolveSymbolCode(symbol);
    const contracts = this.asNumber(position.contracts ?? position.positionAmt ?? position.amount ?? 0);
    const side = String(position.side ?? (contracts < 0 ? 'short' : 'long')).toLowerCase() === 'short' ? 'short' : 'long';
    const quantity = Math.abs(contracts);

    return {
      venue: this.venue,
      accountRef: this.config.accountRef,
      positionId: this.asOptionalString(position.id),
      symbolCode,
      venueSymbol: symbol,
      side,
      status: quantity > 0 ? 'open' : 'closed',
      quantity,
      entryPrice: this.asNumber(position.entryPrice ?? position.avgPrice ?? 0),
      markPrice: this.asOptionalNumber(position.markPrice),
      liquidationPrice: this.asOptionalNumber(position.liquidationPrice),
      leverage: this.asOptionalNumber(position.leverage),
      marginUsed: this.asOptionalNumber(position.initialMargin),
      unrealizedPnl: this.asOptionalNumber(position.unrealizedPnl),
      openedAtTs: this.asEpoch(position.timestamp),
      updatedAtTs: this.asEpoch(position.timestamp) ?? this.now(),
      raw: this.toJsonValue(position)
    };
  }

  private buildMarketParams(): Record<string, unknown> {
    return this.config.marketType ? { type: this.config.marketType } : {};
  }

  private resolveSymbol(symbolCode: SymbolCode): string {
    return resolveVenueSymbol(symbolCode, 'ccxt', this.symbolMap);
  }

  private resolveSymbolCode(venueSymbol: string): SymbolCode {
    const found = [...this.symbolMap.entries()].find(([, entry]) => {
      if (entry.defaultVenueSymbol === venueSymbol) {
        return true;
      }

      return entry.venues?.ccxt === venueSymbol;
    });

    if (found) {
      return found[0];
    }

    throw this.raiseIncident('place_order_failure', 'error', `Unsupported CCXT symbol returned: ${venueSymbol}`);
  }

  private getSymbolSpec(symbolCode: SymbolCode): SymbolSpec {
    const spec = this.symbolSpecsByCode.get(symbolCode);
    if (!spec) {
      throw this.raiseIncident('place_order_failure', 'error', `Missing symbol spec for ${symbolCode}`);
    }
    return spec;
  }

  private mapOrderType(orderType: ExecutionOrderType): string {
    if (orderType === 'stop_limit') {
      return 'limit';
    }

    return orderType;
  }

  private mapOrderTypeFromCcxt(orderType: string): ExecutionOrderType {
    if (orderType === 'market') {
      return 'market';
    }

    if (orderType === 'stop') {
      return 'stop';
    }

    if (orderType === 'stop_limit') {
      return 'stop_limit';
    }

    return 'limit';
  }

  private mapOrderStatus(status: string): VenueOrderStatus {
    switch (status) {
      case 'open':
        return 'open';
      case 'closed':
        return 'filled';
      case 'canceled':
      case 'cancelled':
        return 'canceled';
      case 'expired':
        return 'expired';
      case 'rejected':
        return 'rejected';
      default:
        return 'pending';
    }
  }

  private mapTimeInForce(timeInForce?: string): 'gtc' | 'ioc' | 'fok' | undefined {
    if (!timeInForce) {
      return undefined;
    }

    const normalized = timeInForce.toLowerCase();
    if (normalized === 'gtc' || normalized === 'ioc' || normalized === 'fok') {
      return normalized;
    }

    return undefined;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private asNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return String(value);
  }

  private asEpoch(value: unknown): EpochMs | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    return parsed as EpochMs;
  }

  private async findOrderIdByClientOrderId(symbol: string, clientOrderId?: string): Promise<string | undefined> {
    if (!clientOrderId) {
      return undefined;
    }

    const client = await this.getClient();
    const openOrders = await client.fetchOpenOrders(symbol, undefined, undefined, this.buildMarketParams());
    const order = openOrders.find((entry) => String(entry.clientOrderId ?? '') === clientOrderId);
    return order ? String(order.id ?? '') : undefined;
  }


  private toJsonValue(value: unknown): JsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    try {
      return JSON.parse(JSON.stringify(value)) as JsonValue;
    } catch (_error) {
      return { message: String(value) };
    }
  }

  private normalizeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    return {
      message: String(error)
    };
  }

  private raiseIncident(
    code: ExecutionIncident['code'],
    severity: ExecutionIncident['severity'],
    message: string,
    context?: unknown
  ): Error {
    const incident: ExecutionIncident = {
      incidentId: `${this.venue}_${this.now()}_${Math.random().toString(36).slice(2, 8)}`,
      venue: this.venue,
      accountRef: this.config.accountRef,
      code,
      severity,
      message,
      context: context ? this.toJsonValue(this.normalizeError(context)) : undefined,
      raisedAtTs: this.now()
    };
    this.incidents.push(incident);

    return new Error(message);
  }

  private buildTransientIncident(message: string): ExecutionIncident {
    return {
      incidentId: `${this.venue}_${this.now()}_status`,
      venue: this.venue,
      accountRef: this.config.accountRef,
      code: 'adapter_unreachable',
      severity: 'warning',
      message,
      raisedAtTs: this.now()
    };
  }

  private assertAccount(accountRef: string): void {
    if (accountRef !== this.config.accountRef) {
      throw new Error(`CCXT adapter configured for account ${this.config.accountRef}, received ${accountRef}`);
    }
  }
}
