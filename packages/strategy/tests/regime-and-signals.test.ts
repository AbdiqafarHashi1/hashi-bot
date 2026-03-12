import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPhase4SignalsFromCandles, classifyRegime, detectTrendPullbackCandidates } from '../src/index.ts';
import { asSymbolCode, makeCandleSeries, makeSnapshot, makeSymbolSpec } from '../../../tests/helpers/domain-fixtures.ts';

test('regime classification marks trending bull as tradable', () => {
  const snapshot = makeSnapshot({ emaFast: 110, emaSlow: 100, adx: 28, slopePct: 0.2, chopRatio: 42, atrPct: 1.4 });
  const regime = classifyRegime({ snapshot });

  assert.equal(regime.regimeState, 'trending_bull');
  assert.equal(regime.isTradable, true);
  assert.equal(regime.trendBias, 'bullish');
});

test('setup detection and phase4 signal generation are deterministic on controlled candles', () => {
  const symbolSpec = makeSymbolSpec({ symbolCode: asSymbolCode('BTCUSDT') });
  const candles = makeCandleSeries(
    asSymbolCode('BTCUSDT'),
    [100, 101, 102, 103, 104, 105, 106, 105, 104, 103, 104, 105, 107, 109, 111, 112, 113, 114, 115, 116, 117, 118,
      119, 120, 121, 122, 123, 124, 125, 126, 127, 128]
  );

  const snapshot = makeSnapshot({ symbolCode: asSymbolCode('BTCUSDT'), latestClose: 128, emaFast: 126, emaSlow: 120, adx: 30, slopePct: 0.15, atr: 2, atrPct: 1.3, chopRatio: 40 });
  const regime = classifyRegime({ snapshot });
  const setupCandidates = detectTrendPullbackCandidates({ symbolCode: asSymbolCode('BTCUSDT'), symbolSpec, candles, snapshot, regime });
  const firstSignals = buildPhase4SignalsFromCandles({ symbolCode: asSymbolCode('BTCUSDT'), symbolSpec, candles, minBars: 20 });
  const secondSignals = buildPhase4SignalsFromCandles({ symbolCode: asSymbolCode('BTCUSDT'), symbolSpec, candles, minBars: 20 });
  const insufficient = buildPhase4SignalsFromCandles({ symbolCode: asSymbolCode('BTCUSDT'), symbolSpec, candles: candles.slice(0, 5), minBars: 20 });

  assert.ok(Array.isArray(setupCandidates));
  assert.deepEqual(firstSignals, secondSignals);
  assert.equal(insufficient.length, 0);
  if (firstSignals.length > 0) {
    assert.equal(firstSignals[0]?.side, 'long');
    assert.ok((firstSignals[0]?.entry ?? 0) > 0);
  }
});
