import type { EpochMs, ExecutionVenue, SymbolCode, TradeSide } from '@hashi-bot/core';
import { DEFAULT_FILL_CONFIG, executeFill, estimateFee, type FillSimulatorConfig } from '@hashi-bot/backtest';

import type { AdapterHealthOptions, ExecutionAdapter, ExecutionSyncOptions } from '../../base/execution-adapter.js';
import type {
  AccountSnapshot,
  CancelRequest,
  CancelResult,
  ExecutionHealthSummary,
  ExecutionIncident,
  ExecutionIncidentCode,
  ExecutionOrderSide,
  ExecutionRequest,
  ExecutionResult,
  LiveEngineStatus,
  SyncSnapshot,
  VenueOrder,
  VenueOrderStatus,
  VenuePosition
} from '../../types/execution-domain.js';

interface MockOrderRecord {
  order: VenueOrder;
  createdAtTs: EpochMs;
}

export interface MockExecutionAdapterConfig {
  venue?: ExecutionVenue;
  accountRef: string;
  initialBalance: number;
  maxIncidentHistory?: number;
  fillConfig?: Partial<FillSimulatorConfig>;
  clock?: () => EpochMs;
  idFactory?: () => string;
}

function sideToTradeSide(side: ExecutionOrderSide): TradeSide {
  return side === 'buy' ? 'long' : 'short';
}

function createTimestampFactory(clock?: () => EpochMs): () => EpochMs {
  if (clock) {
    return clock;
  }

  return () => Date.now() as EpochMs;
}

export class MockExecutionAdapter implements ExecutionAdapter {
  public readonly venue: ExecutionVenue;

  private readonly accountRef: string;
  private readonly now: () => EpochMs;
  private readonly nextId: () => string;
  private readonly fillConfig: FillSimulatorConfig;
  private readonly maxIncidentHistory: number;

  private cashBalance: number;
  private realizedPnl = 0;
  private readonly orders = new Map<string, MockOrderRecord>();
  private readonly positions = new Map<SymbolCode, VenuePosition>();
  private readonly incidents: ExecutionIncident[] = [];
  private readonly markPrices = new Map<SymbolCode, number>();
  private latestSyncTs?: EpochMs;

  public constructor(config: MockExecutionAdapterConfig) {
    this.venue = config.venue ?? 'mock';
    this.accountRef = config.accountRef;
    this.now = createTimestampFactory(config.clock);
    this.nextId = config.idFactory ?? (() => `mock_${this.now()}_${Math.random().toString(36).slice(2, 8)}`);
    this.fillConfig = { ...DEFAULT_FILL_CONFIG, ...config.fillConfig };
    this.maxIncidentHistory = config.maxIncidentHistory ?? 100;
    this.cashBalance = config.initialBalance;
  }

  public setMarkPrice(symbolCode: SymbolCode, markPrice: number): void {
    this.markPrices.set(symbolCode, markPrice);
  }

  public async getAccountSnapshot(accountRef: string): Promise<AccountSnapshot> {
    this.assertAccount(accountRef);
    return this.buildAccountSnapshot();
  }

  public async getOpenOrders(accountRef: string, symbolCode?: SymbolCode): Promise<VenueOrder[]> {
    this.assertAccount(accountRef);
    return [...this.orders.values()]
      .map(({ order }) => order)
      .filter((order) => (symbolCode ? order.symbolCode === symbolCode : true))
      .filter((order) => order.status === 'open' || order.status === 'pending')
      .map((order) => ({ ...order }));
  }

  public async getOpenPositions(accountRef: string, symbolCode?: SymbolCode): Promise<VenuePosition[]> {
    this.assertAccount(accountRef);
    return [...this.positions.values()]
      .filter((position) => (symbolCode ? position.symbolCode === symbolCode : true))
      .filter((position) => position.status === 'open' || position.status === 'closing')
      .map((position) => ({ ...position }));
  }

  public async placeOrder(request: ExecutionRequest): Promise<ExecutionResult> {
    this.assertAccount(request.accountRef);
    const receivedAtTs = this.now();

    if (request.quantity <= 0) {
      return this.rejectOrder(request, receivedAtTs, 'invalid_quantity', 'Order quantity must be greater than zero.');
    }

    const orderId = this.nextId();
    const status: VenueOrderStatus = request.orderType === 'market' ? 'filled' : 'open';

    const order: VenueOrder = {
      venue: this.venue,
      accountRef: request.accountRef,
      orderId,
      clientOrderId: request.clientOrderId,
      symbolCode: request.symbolCode,
      venueSymbol: request.venueSymbol,
      side: request.side,
      orderType: request.orderType,
      status,
      quantity: request.quantity,
      quantityLots: request.quantityLots,
      filledQuantity: status === 'filled' ? request.quantity : 0,
      remainingQuantity: status === 'filled' ? 0 : request.quantity,
      price: request.price,
      stopPrice: request.stopPrice,
      stopLossPrice: request.stopLossPrice,
      takeProfitPrice: request.takeProfitPrice,
      timeInForce: request.timeInForce,
      reduceOnly: request.reduceOnly,
      submittedAtTs: request.submittedAtTs,
      updatedAtTs: receivedAtTs,
      raw: {
        adapter: 'mock',
        deterministic: true
      }
    };

    this.orders.set(orderId, {
      order,
      createdAtTs: receivedAtTs
    });

    if (status === 'filled') {
      this.applyFill(order, receivedAtTs);
    }

    return {
      venue: this.venue,
      accountRef: request.accountRef,
      accepted: true,
      request,
      orderId,
      order: { ...order },
      status,
      receivedAtTs,
      raw: {
        adapter: 'mock',
        deterministic: true
      }
    };
  }

  public async cancelOrder(request: CancelRequest): Promise<CancelResult> {
    this.assertAccount(request.accountRef);
    const receivedAtTs = this.now();

    const record = this.findOrderForCancel(request);
    if (!record) {
      this.recordIncident('cancel_order_failure', 'warning', 'Cancel requested for unknown order.', {
        orderId: request.orderId ?? null,
        clientOrderId: request.clientOrderId ?? null,
        symbolCode: request.symbolCode,
        venueSymbol: request.venueSymbol
      });
      return {
        venue: this.venue,
        accountRef: request.accountRef,
        canceled: false,
        request,
        status: 'rejected',
        message: 'Order not found.',
        errorCode: 'order_not_found',
        receivedAtTs
      };
    }

    if (record.order.status === 'filled' || record.order.status === 'canceled') {
      return {
        venue: this.venue,
        accountRef: request.accountRef,
        canceled: false,
        request,
        orderId: record.order.orderId,
        status: record.order.status,
        message: `Order is already ${record.order.status}.`,
        errorCode: 'order_not_cancelable',
        receivedAtTs
      };
    }

    record.order.status = 'canceled';
    record.order.remainingQuantity = record.order.quantity - record.order.filledQuantity;
    record.order.updatedAtTs = receivedAtTs;

    return {
      venue: this.venue,
      accountRef: request.accountRef,
      canceled: true,
      request,
      orderId: record.order.orderId,
      status: record.order.status,
      receivedAtTs,
      raw: {
        adapter: 'mock',
        deterministic: true
      }
    };
  }

  public async cancelAllForSymbol(accountRef: string, symbolCode: SymbolCode): Promise<CancelResult[]> {
    this.assertAccount(accountRef);
    const openOrders = await this.getOpenOrders(accountRef, symbolCode);
    const results: CancelResult[] = [];

    for (const order of openOrders) {
      results.push(
        await this.cancelOrder({
          venue: this.venue,
          accountRef,
          orderId: order.orderId,
          clientOrderId: order.clientOrderId,
          symbolCode: order.symbolCode,
          venueSymbol: order.venueSymbol,
          requestedAtTs: this.now()
        })
      );
    }

    return results;
  }

  public async sync(accountRef: string, options?: ExecutionSyncOptions): Promise<SyncSnapshot> {
    this.assertAccount(accountRef);
    const fetchedAtTs = this.now();
    this.latestSyncTs = fetchedAtTs;

    const symbolSet = options?.symbolCodes ? new Set(options.symbolCodes) : null;
    const openOrders = (await this.getOpenOrders(accountRef)).filter((order) =>
      symbolSet ? symbolSet.has(order.symbolCode) : true
    );
    const openPositions = (await this.getOpenPositions(accountRef)).filter((position) =>
      symbolSet ? symbolSet.has(position.symbolCode) : true
    );

    return {
      venue: this.venue,
      accountRef,
      fetchedAtTs,
      account: this.buildAccountSnapshot(fetchedAtTs),
      openOrders,
      openPositions,
      raw: {
        adapter: 'mock',
        deterministic: true,
        filteredBySymbols: Boolean(symbolSet)
      }
    };
  }

  public async getHealth(accountRef: string, options?: AdapterHealthOptions): Promise<ExecutionHealthSummary> {
    this.assertAccount(accountRef);
    if (options?.withSync) {
      await this.sync(accountRef);
    }

    const openIncidents = this.incidents.filter((incident) => incident.resolvedAtTs === undefined);
    const latestIncident = this.incidents[this.incidents.length - 1];

    return {
      venue: this.venue,
      accountRef,
      status: this.deriveHealthStatus(openIncidents.length),
      lastHeartbeatTs: this.now(),
      lastSyncTs: this.latestSyncTs,
      openIncidentCount: openIncidents.length,
      criticalIncidentCount: openIncidents.filter((incident) => incident.severity === 'critical').length,
      latestIncident
    };
  }

  private buildAccountSnapshot(fetchedAtTs = this.now()): AccountSnapshot {
    const unrealizedPnl = [...this.positions.values()].reduce((sum, position) => {
      const markPrice = this.markPrices.get(position.symbolCode);
      if (markPrice === undefined) {
        return sum;
      }

      if (position.side === 'long') {
        return sum + (markPrice - position.entryPrice) * position.quantity;
      }

      return sum + (position.entryPrice - markPrice) * position.quantity;
    }, 0);

    const equity = this.cashBalance + unrealizedPnl;

    return {
      venue: this.venue,
      accountRef: this.accountRef,
      balance: this.cashBalance,
      equity,
      marginUsed: 0,
      marginAvailable: equity,
      realizedPnl: this.realizedPnl,
      unrealizedPnl,
      fetchedAtTs,
      raw: {
        adapter: 'mock',
        deterministic: true
      }
    };
  }

  private rejectOrder(
    request: ExecutionRequest,
    receivedAtTs: EpochMs,
    errorCode: string,
    message: string
  ): ExecutionResult {
    this.recordIncident('place_order_failure', 'warning', message, {
      errorCode,
      symbolCode: request.symbolCode,
      venueSymbol: request.venueSymbol,
      quantity: request.quantity
    });

    return {
      venue: this.venue,
      accountRef: request.accountRef,
      accepted: false,
      request,
      status: 'rejected',
      message,
      errorCode,
      receivedAtTs
    };
  }

  private applyFill(order: VenueOrder, filledAtTs: EpochMs): void {
    const requestedPrice = order.price ?? this.markPrices.get(order.symbolCode) ?? 1;
    const side = sideToTradeSide(order.side);
    const fill = executeFill(side, requestedPrice, order.quantity, this.fillConfig, false);

    order.averageFillPrice = fill.executedPrice;
    order.updatedAtTs = filledAtTs;

    const position = this.positions.get(order.symbolCode);
    const direction = side === 'long' ? 1 : -1;

    if (!position) {
      this.positions.set(order.symbolCode, {
        venue: this.venue,
        accountRef: this.accountRef,
        positionId: this.nextId(),
        symbolCode: order.symbolCode,
        venueSymbol: order.venueSymbol,
        side,
        status: 'open',
        quantity: order.quantity,
        quantityLots: order.quantityLots,
        entryPrice: fill.executedPrice,
        stopLossPrice: order.stopLossPrice,
        takeProfitPrice: order.takeProfitPrice,
        marginUsed: 0,
        unrealizedPnl: 0,
        openedAtTs: filledAtTs,
        updatedAtTs: filledAtTs,
        raw: {
          sourceOrderId: order.orderId,
          deterministic: true
        }
      });
    } else if (position.side === side) {
      const totalQty = position.quantity + order.quantity;
      const weighted =
        totalQty === 0 ? position.entryPrice : (position.entryPrice * position.quantity + fill.executedPrice * order.quantity) / totalQty;
      position.quantity = totalQty;
      position.entryPrice = weighted;
      position.updatedAtTs = filledAtTs;
      position.quantityLots = (position.quantityLots ?? 0) + (order.quantityLots ?? 0);
    } else {
      const closable = Math.min(position.quantity, order.quantity);
      const pnlPerUnit = position.side === 'long' ? fill.executedPrice - position.entryPrice : position.entryPrice - fill.executedPrice;
      const grossPnl = pnlPerUnit * closable;
      const fees = estimateFee(fill.executedPrice * closable, this.fillConfig.feeBps);
      this.realizedPnl += grossPnl - fees;
      this.cashBalance += grossPnl - fees;

      position.quantity -= closable;
      position.updatedAtTs = filledAtTs;
      if (position.quantity <= 0) {
        position.status = 'closed';
        this.positions.delete(order.symbolCode);
      }

      const remainingQty = order.quantity - closable;
      if (remainingQty > 0) {
        this.positions.set(order.symbolCode, {
          venue: this.venue,
          accountRef: this.accountRef,
          positionId: this.nextId(),
          symbolCode: order.symbolCode,
          venueSymbol: order.venueSymbol,
          side,
          status: 'open',
          quantity: remainingQty,
          quantityLots: order.quantityLots,
          entryPrice: fill.executedPrice,
          stopLossPrice: order.stopLossPrice,
          takeProfitPrice: order.takeProfitPrice,
          marginUsed: 0,
          unrealizedPnl: 0,
          openedAtTs: filledAtTs,
          updatedAtTs: filledAtTs,
          raw: {
            sourceOrderId: order.orderId,
            deterministic: true
          }
        });
      }
    }

    const notional = fill.executedPrice * order.quantity;
    this.cashBalance -= estimateFee(notional, this.fillConfig.feeBps);
  }

  private findOrderForCancel(request: CancelRequest): MockOrderRecord | undefined {
    if (request.orderId) {
      return this.orders.get(request.orderId);
    }

    return [...this.orders.values()].find(({ order }) => order.clientOrderId !== undefined && order.clientOrderId === request.clientOrderId);
  }

  private recordIncident(
    code: ExecutionIncidentCode,
    severity: ExecutionIncident['severity'],
    message: string,
    context?: ExecutionIncident['context']
  ): void {
    const incident: ExecutionIncident = {
      incidentId: this.nextId(),
      venue: this.venue,
      accountRef: this.accountRef,
      code,
      severity,
      message,
      context,
      raisedAtTs: this.now()
    };

    this.incidents.push(incident);
    if (this.incidents.length > this.maxIncidentHistory) {
      this.incidents.shift();
    }
  }

  private deriveHealthStatus(openIncidentCount: number): LiveEngineStatus {
    if (openIncidentCount > 0) {
      return 'degraded';
    }

    return 'running';
  }

  private assertAccount(accountRef: string): void {
    if (accountRef !== this.accountRef) {
      throw new Error(`Mock adapter configured for account ${this.accountRef}, received ${accountRef}`);
    }
  }
}
