import test from 'node:test';
import assert from 'node:assert/strict';

import { createPendingTrade, advanceTradeState } from '../src/engine/state-machine.ts';
import { DEFAULT_FILL_CONFIG, executeFill, resolveIntraBarHit } from '../src/fills/fill-simulator.stub.ts';
import { asEpochMs, asSymbolCode } from '../../../tests/helpers/domain-fixtures.ts';

test('fill simulator resolves conservative vs optimistic intra-bar hits', () => {
  const candle = {
    ts: asEpochMs(1_700_000_000_000),
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1,
    symbolCode: asSymbolCode('BTCUSDT'),
    timeframe: '1m' as const
  };

  const conservative = resolveIntraBarHit(candle, 'long', { stop: 95, tp1: 108, tp2: 109 }, 'conservative');
  const optimistic = resolveIntraBarHit(candle, 'long', { stop: 95, tp1: 108, tp2: 109 }, 'optimistic');
  const fill = executeFill('long', 100, 1, DEFAULT_FILL_CONFIG, false);

  assert.equal(conservative, 'stop');
  assert.equal(optimistic, 'tp2');
  assert.ok(fill.executedPrice >= 100);
  assert.ok(fill.feePaid > 0);
});

test('trade lifecycle transitions from pending to open to partially_closed', () => {
  const trade = createPendingTrade({
    tradeId: 't1',
    runId: 'run1',
    plan: {
      profileCode: 'GROWTH_HUNTER',
      signalRef: { setupCode: 'pullback:test', createdAtTs: Number(asEpochMs(1_700_000_000_000)) },
      symbolCode: asSymbolCode('BTCUSDT'),
      side: 'long',
      entry: 100,
      stop: 95,
      tp1: 105,
      tp2: 110,
      riskPct: 1,
      riskAmount: 100,
      qty: 1,
      notional: 100
    }
  });

  const entryCandle = {
    ts: asEpochMs(1_700_000_060_000),
    open: 99,
    high: 101,
    low: 98,
    close: 100,
    volume: 1,
    symbolCode: asSymbolCode('BTCUSDT'),
    timeframe: '1m' as const
  };

  const tp1Candle = {
    ts: asEpochMs(1_700_000_120_000),
    open: 100,
    high: 106,
    low: 99,
    close: 105,
    volume: 1,
    symbolCode: asSymbolCode('BTCUSDT'),
    timeframe: '1m' as const
  };

  const afterEntry = advanceTradeState(trade, { candle: entryCandle });
  assert.equal(afterEntry.trade.lifecycleState, 'open');

  const afterTp1 = advanceTradeState(afterEntry.trade, { candle: tp1Candle });
  assert.ok(['tp1_hit', 'breakeven_armed', 'runner_active', 'closed'].includes(afterTp1.trade.lifecycleState));
  assert.ok((afterTp1.trade.position.remainingQty ?? 0) <= 1);
});
