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
import { classifyCtraderError } from './ctrader.errors.js';

type CTraderRecord = Record<string, unknown>;

interface CTraderHttpClient {
  request<T = CTraderRecord>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T>;
}

interface CTraderEndpointConfig {
  health: string;
  accountSnapshot: string;
  openOrders: string;
  openPositions: string;
  placeOrder: string;
  cancelOrder: string;
}

export interface CTraderAdapterConfig {
  baseUrl: string;
  accountRef: string;
  accountId: string;
  accessToken: string;
  timeoutMs?: number;
  symbolSpecs: SymbolSpec[];
  symbolMapEntries?: SymbolMapEntry[];
  endpointOverrides?: Partial<CTraderEndpointConfig>;
  clock?: () => EpochMs;
}

export class CTraderExecutionAdapter implements ExecutionAdapter {
  public readonly venue = 'ctrader' as const;

  private readonly config: CTraderAdapterConfig;
  private readonly now: () => EpochMs;
  private readonly symbolSpecsByCode: Map<SymbolCode, SymbolSpec>;
  private readonly symbolMap: Map<SymbolCode, SymbolMapEntry>;
  private readonly incidents: ExecutionIncident[] = [];
  private readonly timeoutMs: number;
  private readonly endpoints: CTraderEndpointConfig;

  private client?: CTraderHttpClient;
  private latestSyncTs?: EpochMs;

  public constructor(config: CTraderAdapterConfig) {
    this.config = config;
    this.now = config.clock ?? (() => Date.now() as EpochMs);
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.symbolSpecsByCode = new Map(config.symbolSpecs.map((spec) => [spec.symbolCode, spec]));

    const entries = config.symbolMapEntries ?? config.symbolSpecs.map((spec) => ({
      symbolCode: spec.symbolCode,
      defaultVenueSymbol: buildDefaultVenueSymbol(spec, 'ctrader')
    }));
    this.symbolMap = createSymbolMap({ entries });

    this.endpoints = {
      health: '/health',
      accountSnapshot: '/accounts/{accountId}/snapshot',
      openOrders: '/accounts/{accountId}/orders/open',
      openPositions: '/accounts/{accountId}/positions/open',
      placeOrder: '/accounts/{accountId}/orders',
      cancelOrder: '/accounts/{accountId}/orders/{orderId}',
      ...(config.endpointOverrides ?? {})
    };
  }

  public async initialize(): Promise<void> {
    await this.getClient();
    await this.ensureHealthyConnection();
  }

  public async getAccountSnapshot(accountRef: string): Promise<AccountSnapshot> {
    this.assertAccount(accountRef);

    try {
      const client = await this.getClient();
      const data = await client.request<CTraderRecord>('GET', this.accountPath(this.endpoints.accountSnapshot));
      const fetchedAtTs = this.now();

      return {
        venue: this.venue,
        accountRef,
        equity: this.asOptionalNumber(data.equity),
        balance: this.asOptionalNumber(data.balance),
        marginUsed: this.asOptionalNumber(data.marginUsed ?? data.usedMargin),
        marginAvailable: this.asOptionalNumber(data.marginAvailable ?? data.freeMargin),
        unrealizedPnl: this.asOptionalNumber(data.unrealizedPnl),
        realizedPnl: this.asOptionalNumber(data.realizedPnl),
        balances: this.mapBalanceRows(data),
        fetchedAtTs,
        raw: this.toJsonValue(data)
      };
    } catch (error) {
      throw this.raiseIncident('sync_failure', 'error', 'Failed to fetch cTrader account snapshot.', error);
    }
  }

  public async getOpenOrders(accountRef: string, symbolCode?: SymbolCode): Promise<VenueOrder[]> {
    this.assertAccount(accountRef);

    try {
      const client = await this.getClient();
      const data = await client.request<CTraderRecord>('GET', this.accountPath(this.endpoints.openOrders));
      const rows = this.asArray(data.orders ?? data.items ?? data.data);
      const mapped = rows.map((row) => this.mapOrder(row));

      if (!symbolCode) {
        return mapped;
      }

      return mapped.filter((order) => order.symbolCode === symbolCode);
    } catch (error) {
      throw this.raiseIncident('sync_failure', 'warning', 'Failed to fetch cTrader open orders.', error);
    }
  }

  public async getOpenPositions(accountRef: string, symbolCode?: SymbolCode): Promise<VenuePosition[]> {
    this.assertAccount(accountRef);

    try {
      const client = await this.getClient();
      const data = await client.request<CTraderRecord>('GET', this.accountPath(this.endpoints.openPositions));
      const rows = this.asArray(data.positions ?? data.items ?? data.data);
      const mapped = rows.map((row) => this.mapPosition(row));

      if (!symbolCode) {
        return mapped;
      }

      return mapped.filter((position) => position.symbolCode === symbolCode);
    } catch (error) {
      throw this.raiseIncident('sync_failure', 'warning', 'Failed to fetch cTrader open positions.', error);
    }
  }

  public async placeOrder(request: ExecutionRequest): Promise<ExecutionResult> {
    this.assertAccount(request.accountRef);
    const receivedAtTs = this.now();

    try {
      const client = await this.getClient();
      const symbolSpec = this.getSymbolSpec(request.symbolCode);
      const venueSymbol = request.venueSymbol || this.resolveSymbol(request.symbolCode);
      const payload = buildVenueOrderPayload({ ...request, venueSymbol }, symbolSpec);

      const body: CTraderRecord = {
        symbol: payload.symbol,
        volume: payload.quantity,
        volumeLots: payload.quantityLots,
        tradeSide: payload.side === 'buy' ? 'BUY' : 'SELL',
        orderType: this.mapOrderType(payload.type),
        limitPrice: payload.price,
        stopPrice: payload.stopPrice,
        stopLoss: payload.stopLossPrice,
        takeProfit: payload.takeProfitPrice,
        timeInForce: payload.timeInForce,
        reduceOnly: payload.reduceOnly,
        clientOrderId: payload.clientOrderId
      };

      const response = await client.request<CTraderRecord>('POST', this.accountPath(this.endpoints.placeOrder), body);
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
      const classified = classifyCtraderError(error);
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
    const receivedAtTs = this.now();

    try {
      const client = await this.getClient();
      const orderId = request.orderId ?? (await this.findOrderIdByClientOrderId(request));
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

      const path = this.accountPath(this.endpoints.cancelOrder).replace('{orderId}', encodeURIComponent(orderId));
      const response = await client.request<CTraderRecord>('DELETE', path);
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
      const classified = classifyCtraderError(error);
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
    const openOrders = await this.getOpenOrders(accountRef, symbolCode);

    const results: CancelResult[] = [];
    for (const order of openOrders) {
      results.push(await this.cancelOrder({
        venue: this.venue,
        accountRef,
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        symbolCode,
        venueSymbol: order.venueSymbol,
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
      raw: this.toJsonValue({
        accountId: this.config.accountId,
        symbolFiltered: Boolean(symbolFilter)
      })
    };
  }

  public async getHealth(accountRef: string, options?: AdapterHealthOptions): Promise<ExecutionHealthSummary> {
    this.assertAccount(accountRef);

    if (options?.withSync) {
      await this.sync(accountRef);
    }

    let status: LiveEngineStatus = 'running';
    let message: string | undefined;

    try {
      await this.ensureHealthyConnection();
    } catch (error) {
      status = 'degraded';
      message = error instanceof Error ? error.message : 'cTrader health check failed.';
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
      latestIncident: latestIncident ?? (message ? this.buildTransientIncident(message) : undefined)
    };
  }

  private async getClient(): Promise<CTraderHttpClient> {
    if (this.client) {
      return this.client;
    }

    if (!this.config.baseUrl || !this.config.accountId || !this.config.accessToken) {
      throw this.raiseIncident('auth_failure', 'critical', 'Missing cTrader adapter config or credentials.');
    }

    const baseUrl = this.config.baseUrl.replace(/\/$/, '');

    this.client = {
      request: async <T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
              Authorization: `Bearer ${this.config.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal
          });

          const text = await response.text();
          const payload = text ? this.tryParseJson(text) : undefined;

          if (!response.ok) {
            throw new Error(`cTrader HTTP ${response.status}: ${this.extractErrorMessage(payload)}`);
          }

          return (payload ?? {}) as T;
        } catch (error) {
          const classified = classifyCtraderError(error);
          throw this.raiseIncident(classified.code, classified.retriable ? 'warning' : 'error', classified.message, error);
        } finally {
          clearTimeout(timeout);
        }
      }
    };

    return this.client;
  }

  private async ensureHealthyConnection(): Promise<void> {
    const client = await this.getClient();

    try {
      await client.request('GET', this.accountPath(this.endpoints.health));
    } catch (_error) {
      await this.getAccountSnapshot(this.config.accountRef);
    }
  }

  private mapBalanceRows(snapshot: CTraderRecord): AccountSnapshot['balances'] {
    const balances = this.asArray(snapshot.balances ?? snapshot.assets ?? []);

    if (balances.length === 0) {
      return undefined;
    }

    return balances.map((row) => ({
      asset: String(row.asset ?? row.currency ?? 'USD'),
      free: this.asNumber(row.free ?? row.available ?? 0),
      used: this.asNumber(row.used ?? row.locked ?? 0),
      total: this.asNumber(row.total ?? row.balance ?? row.equity ?? 0),
      raw: this.toJsonValue(row)
    }));
  }

  private mapOrder(row: CTraderRecord): VenueOrder {
    const venueSymbol = String(row.symbol ?? row.symbolName ?? '');
    const symbolCode = this.resolveSymbolCode(venueSymbol);
    const timestamp = this.asEpoch(row.updatedAt ?? row.transactTime ?? row.timestamp) ?? this.now();

    return {
      venue: this.venue,
      accountRef: this.config.accountRef,
      orderId: String(row.orderId ?? row.id ?? ''),
      clientOrderId: this.asOptionalString(row.clientOrderId),
      symbolCode,
      venueSymbol,
      side: this.mapSide(row.tradeSide ?? row.side),
      orderType: this.mapOrderTypeFromCTrader(String(row.orderType ?? row.type ?? 'limit')),
      status: this.mapOrderStatus(String(row.status ?? row.orderStatus ?? 'open')),
      quantity: this.asNumber(row.volume ?? row.quantity ?? row.amount),
      quantityLots: this.asOptionalNumber(row.volumeLots ?? row.lots),
      filledQuantity: this.asNumber(row.filledVolume ?? row.filled ?? 0),
      remainingQuantity: this.asOptionalNumber(row.remainingVolume ?? row.remaining),
      price: this.asOptionalNumber(row.limitPrice ?? row.price),
      averageFillPrice: this.asOptionalNumber(row.averageFillPrice ?? row.avgFillPrice),
      stopPrice: this.asOptionalNumber(row.stopPrice),
      stopLossPrice: this.asOptionalNumber(row.stopLoss),
      takeProfitPrice: this.asOptionalNumber(row.takeProfit),
      submittedAtTs: this.asEpoch(row.createdAt ?? row.timestamp),
      updatedAtTs: timestamp,
      raw: this.toJsonValue(row)
    };
  }

  private mapPosition(row: CTraderRecord): VenuePosition {
    const venueSymbol = String(row.symbol ?? row.symbolName ?? '');
    const symbolCode = this.resolveSymbolCode(venueSymbol);
    const updatedAtTs = this.asEpoch(row.updatedAt ?? row.timestamp) ?? this.now();

    return {
      venue: this.venue,
      accountRef: this.config.accountRef,
      positionId: this.asOptionalString(row.positionId ?? row.id),
      symbolCode,
      venueSymbol,
      side: this.mapTradeSide(row.tradeSide ?? row.side),
      status: this.asNumber(row.volume ?? row.quantity ?? 0) > 0 ? 'open' : 'closed',
      quantity: this.asNumber(row.volume ?? row.quantity),
      quantityLots: this.asOptionalNumber(row.volumeLots ?? row.lots),
      entryPrice: this.asNumber(row.entryPrice ?? row.price ?? 0),
      markPrice: this.asOptionalNumber(row.markPrice ?? row.currentPrice),
      stopLossPrice: this.asOptionalNumber(row.stopLoss),
      takeProfitPrice: this.asOptionalNumber(row.takeProfit),
      leverage: this.asOptionalNumber(row.leverage),
      marginUsed: this.asOptionalNumber(row.marginUsed ?? row.usedMargin),
      unrealizedPnl: this.asOptionalNumber(row.unrealizedPnl),
      openedAtTs: this.asEpoch(row.openedAt ?? row.timestamp),
      updatedAtTs,
      raw: this.toJsonValue(row)
    };
  }

  private mapOrderType(orderType: ExecutionOrderType): string {
    if (orderType === 'stop_limit') {
      return 'STOP_LIMIT';
    }

    return orderType.toUpperCase();
  }

  private mapOrderTypeFromCTrader(orderType: string): ExecutionOrderType {
    const normalized = orderType.toLowerCase();
    if (normalized.includes('market')) {
      return 'market';
    }
    if (normalized.includes('stop') && normalized.includes('limit')) {
      return 'stop_limit';
    }
    if (normalized.includes('stop')) {
      return 'stop';
    }
    return 'limit';
  }

  private mapOrderStatus(status: string): VenueOrderStatus {
    const normalized = status.toLowerCase();

    if (normalized.includes('filled') || normalized.includes('executed')) {
      return 'filled';
    }
    if (normalized.includes('partial')) {
      return 'partially_filled';
    }
    if (normalized.includes('cancel')) {
      return 'canceled';
    }
    if (normalized.includes('reject')) {
      return 'rejected';
    }
    if (normalized.includes('expire')) {
      return 'expired';
    }
    if (normalized.includes('accept') || normalized.includes('created') || normalized.includes('pending')) {
      return 'pending';
    }

    return 'open';
  }

  private mapSide(value: unknown): 'buy' | 'sell' {
    const normalized = String(value ?? 'BUY').toLowerCase();
    return normalized.includes('sell') ? 'sell' : 'buy';
  }

  private mapTradeSide(value: unknown): 'long' | 'short' {
    const normalized = String(value ?? 'BUY').toLowerCase();
    return normalized.includes('sell') || normalized.includes('short') ? 'short' : 'long';
  }

  private resolveSymbol(symbolCode: SymbolCode): string {
    return resolveVenueSymbol(symbolCode, 'ctrader', this.symbolMap);
  }

  private resolveSymbolCode(venueSymbol: string): SymbolCode {
    const found = [...this.symbolMap.entries()].find(([, entry]) => {
      if (entry.defaultVenueSymbol === venueSymbol) {
        return true;
      }

      return entry.venues?.ctrader === venueSymbol;
    });

    if (found) {
      return found[0];
    }

    throw this.raiseIncident('place_order_failure', 'error', `Unsupported cTrader symbol returned: ${venueSymbol}`);
  }

  private getSymbolSpec(symbolCode: SymbolCode): SymbolSpec {
    const spec = this.symbolSpecsByCode.get(symbolCode);
    if (!spec) {
      throw this.raiseIncident('place_order_failure', 'error', `Missing symbol spec for ${symbolCode}`);
    }

    return spec;
  }

  private accountPath(path: string): string {
    return path.replace('{accountId}', encodeURIComponent(this.config.accountId));
  }

  private asArray(value: unknown): CTraderRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry) => typeof entry === 'object' && entry !== null)
      .map((entry) => entry as CTraderRecord);
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

  private tryParseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { message: text };
    }
  }

  private extractErrorMessage(payload: unknown): string {
    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      return String(record.message ?? record.error ?? JSON.stringify(record));
    }

    return String(payload ?? 'Unknown cTrader HTTP error');
  }

  private async findOrderIdByClientOrderId(request: CancelRequest): Promise<string | undefined> {
    if (!request.clientOrderId) {
      return undefined;
    }

    const openOrders = await this.getOpenOrders(request.accountRef, request.symbolCode);
    const matched = openOrders.find((order) => order.clientOrderId === request.clientOrderId);
    return matched?.orderId;
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
      throw new Error(`cTrader adapter configured for account ${this.config.accountRef}, received ${accountRef}`);
    }
  }
}
