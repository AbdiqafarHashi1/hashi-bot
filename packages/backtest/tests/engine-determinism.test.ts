import test from 'node:test';
import assert from 'node:assert/strict';

import { createReplayEngine, runBacktest } from '../src/index.ts';
import { asEpochMs, asSymbolCode, makeCandleSeries, makeSignal, makeSymbolSpec } from '../../../tests/helpers/domain-fixtures.ts';

test('backtest engine is deterministic on known dataset', () => {
  const symbolCode = asSymbolCode('BTCUSDT');
  const candles = makeCandleSeries(symbolCode, [100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  const symbolSpec = makeSymbolSpec({ symbolCode });

  const signalGenerator = ({ evaluationIndex }: { evaluationIndex: number }) => {
    if (evaluationIndex === 2) {
      return [makeSignal({ symbolCode, entry: 102, stop: 100, tp1: 104, tp2: 106, createdAtTs: candles[2]!.ts })];
    }
    return [];
  };

  const first = runBacktest({
    config: {
      runId: 'r1' as never,
      profileCode: 'GROWTH_HUNTER',
      timeframe: '1m',
      symbols: [symbolCode],
      fromTs: candles[0]!.ts,
      toTs: candles.at(-1)!.ts,
      initialBalance: 10_000,
      slippageBps: 0,
      commissionBps: 0,
      maxConcurrentPositions: 1
    },
    dataset: { candlesBySymbol: { [symbolCode]: candles }, symbolSpecsBySymbol: { [symbolCode]: symbolSpec } },
    signalGenerator: signalGenerator as never
  });

  const second = runBacktest({
    config: { ...first.config, runId: 'r2' as never },
    dataset: { candlesBySymbol: { [symbolCode]: candles }, symbolSpecsBySymbol: { [symbolCode]: symbolSpec } },
    signalGenerator: signalGenerator as never
  });

  assert.equal(first.metrics.totalTrades, second.metrics.totalTrades);
  assert.equal(first.metrics.netPnl, second.metrics.netPnl);
});

test('replay step progression is consistent for same action sequence', () => {
  const symbolCode = asSymbolCode('BTCUSDT');
  const candles = makeCandleSeries(symbolCode, [100, 101, 102, 103, 104, 105]);
  const symbolSpec = makeSymbolSpec({ symbolCode });

  const makeEngine = () =>
    createReplayEngine({
      config: {
        runId: 'replay-1' as never,
        datasetId: 'dataset-1' as never,
        profileCode: 'GROWTH_HUNTER',
        timeframe: '1m',
        symbolScope: { mode: 'single', symbols: [symbolCode], primarySymbol: symbolCode },
        replaySpeed: 1
      },
      dataset: { candlesBySymbol: { [symbolCode]: candles }, symbolSpecsBySymbol: { [symbolCode]: symbolSpec } },
      signalGenerator: () => []
    });

  const a = makeEngine();
  const b = makeEngine();

  a.step(2);
  b.step(2);

  const aState = a.getState();
  const bState = b.getState();

  assert.equal(aState.cursor.barIndex, bState.cursor.barIndex);
  assert.equal(aState.recentTimelineEvents.length, bState.recentTimelineEvents.length);
  assert.equal(aState.playbackState, bState.playbackState);
  assert.ok((aState.cursor.timestamp ?? asEpochMs(0)) >= asEpochMs(0));
});
