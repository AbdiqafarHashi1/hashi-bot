import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateAdxSeries, calculateAtrSeries, calculateEmaSeries } from '../src/index.ts';
import { asSymbolCode, makeCandleSeries } from '../../../tests/helpers/domain-fixtures.ts';

test('EMA/ATR/ADX produce deterministic results on controlled candles', () => {
  const closes = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120];
  const candles = makeCandleSeries(asSymbolCode('BTCUSDT'), closes);

  const ema = calculateEmaSeries(closes, 3);
  const atr = calculateAtrSeries(candles, 3);
  const adx = calculateAdxSeries(candles, 3);

  assert.equal(ema.length, closes.length);
  assert.equal(ema[1], null);
  assert.ok((ema.at(-1) ?? 0) > (ema[2] ?? 0));

  assert.equal(atr.length, candles.length);
  assert.equal(atr[1], null);
  assert.ok((atr.at(-1) ?? 0) > 0);

  assert.equal(adx.adx.length, candles.length);
  assert.ok((adx.plusDi.at(-1) ?? 0) > (adx.minusDi.at(-1) ?? 0));
  assert.ok((adx.adx.at(-1) ?? 0) >= 0);
});
