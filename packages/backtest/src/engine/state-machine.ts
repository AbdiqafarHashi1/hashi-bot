import type { Candle, EpochMs } from '@hashi-bot/core';
import type { PositionPlan } from '@hashi-bot/risk';

import {
  DEFAULT_FILL_CONFIG,
  executeFill,
  type FillSimulatorConfig,
  resolveIntraBarHit
} from '../fills/fill-simulator.js';
import type { LifecycleTransition, LifecycleTransitionReason, TradeLifecycleState } from '../types/trade-lifecycle.js';
import type { SimulatedOrder, SimulatedTrade } from '../types/simulated-trade.js';

export interface StateMachineConfig {
  fill: FillSimulatorConfig;
  timeStopBars: number;
}

export interface TradeStepContext {
  candle: Candle;
  forceExitReason?: string;
}

export interface TradeStepResult {
  trade: SimulatedTrade;
  transitions: LifecycleTransition[];
  executedOrders: SimulatedOrder[];
}

export const DEFAULT_STATE_MACHINE_CONFIG: StateMachineConfig = {
  fill: DEFAULT_FILL_CONFIG,
  timeStopBars: 0
};

/**
 * Intra-bar assumptions (deterministic, no tick precision):
 * - A level is fillable iff it is within [low, high] for the candle.
 * - When multiple levels are hit in a candle, tie-break uses fill policy:
 *   - conservative: stop is prioritized over targets.
 *   - optimistic: farthest favorable target first.
 * - Entry fills on touch of planned entry level.
 * - Time stop exits at candle close.
 */

function transition(
  from: TradeLifecycleState,
  to: TradeLifecycleState,
  reason: LifecycleTransitionReason,
  ts: number,
  note?: string
): LifecycleTransition {
  return { from, to, reason, ts, note };
}

function signedPnl(side: 'long' | 'short', entry: number, exit: number, qty: number): number {
  const delta = side === 'long' ? exit - entry : entry - exit;
  return delta * qty;
}

function orderId(tradeId: string, index: number): string {
  return `${tradeId}-ord-${index + 1}`;
}

function resolveBaseQty(trade: SimulatedTrade): number {
  if (trade.position.qty && trade.position.qty > 0) {
    return trade.position.qty;
  }

  if (trade.plan.qty && trade.plan.qty > 0) {
    return trade.plan.qty;
  }

  if (trade.plan.notional && trade.plan.entry > 0) {
    return trade.plan.notional / trade.plan.entry;
  }

  return 1;
}

function addOrder(trade: SimulatedTrade, order: Omit<SimulatedOrder, 'orderId'>): SimulatedOrder {
  const created: SimulatedOrder = {
    orderId: orderId(trade.tradeId, trade.orders.length),
    ...order
  };

  trade.orders.push(created);
  return created;
}

export function createPendingTrade(base: {
  tradeId: string;
  runId: string;
  plan: PositionPlan;
}): SimulatedTrade {
  const qty = base.plan.qty;

  return {
    tradeId: base.tradeId,
    runId: base.runId as SimulatedTrade['runId'],
    symbolCode: base.plan.symbolCode,
    side: base.plan.side,
    setupCode: base.plan.signalRef.setupCode,
    lifecycleState: 'pending_entry',
    transitions: [
      transition('idle', 'pending_entry', 'created', base.plan.signalRef.createdAtTs, 'trade created from approved position plan')
    ],
    barsInTrade: 0,
    plan: base.plan,
    position: {
      positionId: `${base.tradeId}-pos`,
      runId: base.runId as SimulatedTrade['runId'],
      symbolCode: base.plan.symbolCode,
      side: base.plan.side,
      state: 'pending_entry',
      stopPrice: base.plan.stop,
      tp1Price: base.plan.tp1,
      tp2Price: base.plan.tp2,
      qty,
      lots: base.plan.lots,
      remainingQty: qty
    },
    orders: [],
    grossPnl: 0,
    netPnl: 0,
    totalFees: 0,
    totalSlippage: 0
  };
}

function enterIfTriggered(trade: SimulatedTrade, candle: Candle, config: StateMachineConfig): LifecycleTransition[] {
  if (trade.lifecycleState !== 'pending_entry') {
    return [];
  }

  if (!(trade.plan.entry >= candle.low && trade.plan.entry <= candle.high)) {
    return [];
  }

  const qty = resolveBaseQty(trade);
  const fill = executeFill(trade.side, trade.plan.entry, qty, config.fill, false);

  addOrder(trade, {
    symbolCode: trade.symbolCode,
    side: trade.side,
    type: 'limit',
    status: 'filled',
    requestedPrice: trade.plan.entry,
    executedPrice: fill.executedPrice,
    qty,
    lots: trade.plan.lots,
    notional: qty * fill.executedPrice,
    feePaid: fill.feePaid,
    slippagePaid: fill.slippagePaid,
    submittedAtTs: candle.ts,
    updatedAtTs: candle.ts
  });

  trade.entryFilledAtTs = candle.ts;
  trade.position.entryPrice = fill.executedPrice;
  trade.position.openedAtTs = candle.ts;
  trade.position.qty = qty;
  trade.position.remainingQty = qty;
  trade.lifecycleState = 'open';
  trade.position.state = 'open';
  trade.totalFees = (trade.totalFees ?? 0) + fill.feePaid;
  trade.totalSlippage = (trade.totalSlippage ?? 0) + fill.slippagePaid;

  return [transition('pending_entry', 'open', 'entry_filled', candle.ts, 'entry level touched by candle range')];
}

function closeTrade(
  trade: SimulatedTrade,
  candleTs: EpochMs,
  reason: LifecycleTransitionReason,
  exitPrice: number,
  qtyToExit: number,
  config: StateMachineConfig,
  note?: string
): LifecycleTransition[] {
  if (qtyToExit <= 0) {
    return [];
  }

  const entry = trade.position.entryPrice ?? trade.plan.entry;
  const fill = executeFill(trade.side, exitPrice, qtyToExit, config.fill, true);
  const gross = signedPnl(trade.side, entry, fill.executedPrice, qtyToExit);

  addOrder(trade, {
    symbolCode: trade.symbolCode,
    side: trade.side,
    type: 'market',
    status: 'filled',
    requestedPrice: exitPrice,
    executedPrice: fill.executedPrice,
    qty: qtyToExit,
    lots: trade.plan.lots,
    notional: qtyToExit * fill.executedPrice,
    feePaid: fill.feePaid,
    slippagePaid: fill.slippagePaid,
    submittedAtTs: candleTs,
    updatedAtTs: candleTs
  });

  trade.position.remainingQty = Math.max(0, (trade.position.remainingQty ?? qtyToExit) - qtyToExit);
  trade.grossPnl = (trade.grossPnl ?? 0) + gross;
  trade.totalFees = (trade.totalFees ?? 0) + fill.feePaid;
  trade.totalSlippage = (trade.totalSlippage ?? 0) + fill.slippagePaid;
  trade.netPnl = (trade.grossPnl ?? 0) - (trade.totalFees ?? 0);

  if ((trade.position.remainingQty ?? 0) <= 0) {
    const from = trade.lifecycleState;
    trade.lifecycleState = 'closed';
    trade.position.state = 'closed';
    trade.position.closedAtTs = candleTs;
    trade.exitFilledAtTs = candleTs;
    trade.closeReason = note ?? reason;
    trade.position.realizedPnl = trade.netPnl;
    trade.roiPct = trade.plan.riskAmount > 0 ? ((trade.netPnl ?? 0) / trade.plan.riskAmount) * 100 : undefined;

    return [transition(from, 'closed', reason, candleTs, note)];
  }

  return [];
}

function processOpenTrade(trade: SimulatedTrade, candle: Candle, config: StateMachineConfig): LifecycleTransition[] {
  if (trade.lifecycleState === 'closed' || trade.lifecycleState === 'cancelled' || trade.lifecycleState === 'rejected') {
    return [];
  }

  const transitions: LifecycleTransition[] = [];

  const hit = resolveIntraBarHit(
    candle,
    trade.side,
    {
      stop: trade.position.stopPrice,
      tp1: trade.lifecycleState === 'open' ? trade.position.tp1Price : undefined,
      tp2: trade.position.tp2Price
    },
    config.fill.intraBarFillPolicy
  );

  if (trade.lifecycleState === 'open' && hit === 'tp1') {
    const totalQty = trade.position.qty ?? resolveBaseQty(trade);
    const tp1Qty = totalQty * config.fill.tp1ExitFraction;
    const tp1Transitions = closeTrade(trade, candle.ts, 'tp1_partial_filled', trade.position.tp1Price, tp1Qty, config, 'tp1_partial_exit');

    trade.tp1FilledAtTs = candle.ts;
    const from = trade.lifecycleState;
    trade.lifecycleState = 'tp1_hit';
    trade.position.state = 'tp1_hit';
    transitions.push(transition(from, 'tp1_hit', 'tp1_partial_filled', candle.ts, 'tp1 touched, partial exit executed'));

    transitions.push(...tp1Transitions);

    if ((trade.position.remainingQty ?? 0) > 0) {
      const fromTp1 = trade.lifecycleState;
      trade.lifecycleState = 'breakeven_armed';
      trade.position.state = 'breakeven_armed';
      trade.position.stopPrice = trade.position.entryPrice ?? trade.plan.entry;
      transitions.push(transition(fromTp1, 'breakeven_armed', 'breakeven_stop_armed', candle.ts, 'stop moved to breakeven after TP1'));

      const fromBe = trade.lifecycleState;
      trade.lifecycleState = 'runner_active';
      trade.position.state = 'runner_active';
      transitions.push(transition(fromBe, 'runner_active', 'runner_activated', candle.ts, 'runner remainder left for TP2/stop'));
    }
  }

  if ((trade.position.remainingQty ?? 0) > 0) {
    const runnerHit = resolveIntraBarHit(
      candle,
      trade.side,
      {
        stop: trade.position.stopPrice,
        tp2: trade.position.tp2Price
      },
      config.fill.intraBarFillPolicy
    );

    if (runnerHit === 'stop') {
      const rem = trade.position.remainingQty ?? 0;
      transitions.push(...closeTrade(trade, candle.ts, 'stop_filled', trade.position.stopPrice, rem, config, 'stop_hit'));
      return transitions;
    }

    if (runnerHit === 'tp2') {
      const rem = trade.position.remainingQty ?? 0;
      transitions.push(...closeTrade(trade, candle.ts, 'tp2_filled', trade.position.tp2Price, rem, config, 'tp2_hit'));
      return transitions;
    }
  }

  return transitions;
}

export function advanceTradeState(trade: SimulatedTrade, context: TradeStepContext, cfg?: Partial<StateMachineConfig>): TradeStepResult {
  const config: StateMachineConfig = {
    fill: { ...DEFAULT_FILL_CONFIG, ...(cfg?.fill ?? {}) },
    timeStopBars: cfg?.timeStopBars ?? DEFAULT_STATE_MACHINE_CONFIG.timeStopBars
  };

  const transitions: LifecycleTransition[] = [];

  if (trade.lifecycleState === 'pending_entry') {
    transitions.push(...enterIfTriggered(trade, context.candle, config));
  }

  if (trade.lifecycleState !== 'pending_entry' && trade.lifecycleState !== 'closed') {
    trade.barsInTrade += 1;
  }

  if (context.forceExitReason && trade.lifecycleState !== 'closed' && trade.lifecycleState !== 'pending_entry') {
    const rem = trade.position.remainingQty ?? 0;
    transitions.push(
      ...closeTrade(trade, context.candle.ts, 'force_exit', context.candle.close, rem, config, context.forceExitReason)
    );
  }

  if (!context.forceExitReason && trade.lifecycleState !== 'closed' && trade.lifecycleState !== 'pending_entry') {
    transitions.push(...processOpenTrade(trade, context.candle, config));
  }

  if (
    config.timeStopBars > 0 &&
    trade.lifecycleState !== 'closed' &&
    trade.lifecycleState !== 'pending_entry' &&
    trade.barsInTrade >= config.timeStopBars
  ) {
    const rem = trade.position.remainingQty ?? 0;
    transitions.push(...closeTrade(trade, context.candle.ts, 'time_stop', context.candle.close, rem, config, 'time_stop_exit'));
  }

  trade.transitions.push(...transitions);

  return {
    trade,
    transitions,
    executedOrders: trade.orders
  };
}
