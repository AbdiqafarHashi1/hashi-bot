import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateGovernance, getRiskProfile, sizeCryptoPosition, sizeForexPosition } from '../src/index.ts';
import { asEpochMs, asSymbolCode, makeSignal, makeSymbolSpec } from '../../../tests/helpers/domain-fixtures.ts';

test('sizes crypto and forex positions with finite outputs', () => {
  const crypto = sizeCryptoPosition({
    equity: 10_000,
    riskPct: 1,
    signal: makeSignal({ entry: 100, stop: 95 }),
    symbolSpec: makeSymbolSpec({ marketType: 'crypto', qtyPrecision: 3 })
  });

  const forex = sizeForexPosition({
    equity: 10_000,
    riskPct: 1,
    signal: makeSignal({ symbolCode: asSymbolCode('EURUSD'), entry: 1.1, stop: 1.098 }),
    symbolSpec: makeSymbolSpec({
      symbolCode: asSymbolCode('EURUSD'),
      marketType: 'forex',
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      pipSize: 0.0001,
      contractSize: 100_000,
      lotStep: 0.01,
      qtyPrecision: 2,
      pricePrecision: 5,
      sessionType: 'forex_session'
    })
  });

  assert.ok((crypto.qty ?? 0) > 0);
  assert.ok((crypto.normalizedRiskPct ?? 0) > 0);

  assert.ok((forex.lots ?? 0) > 0);
  assert.ok((forex.qty ?? 0) > 0);
  assert.ok((forex.normalizedRiskPct ?? 0) > 0);
});

test('governance allows valid scenario and blocks max-open-position breach', () => {
  const profile = getRiskProfile('PROP_HUNTER');
  const symbolSpec = makeSymbolSpec({ symbolCode: asSymbolCode('BTCUSDT'), sessionType: 'always_open' });
  const signal = makeSignal({ symbolCode: asSymbolCode('BTCUSDT'), score: 90 });

  const allowed = evaluateGovernance(
    profile,
    {
      asOfTs: asEpochMs(1_700_000_000_000),
      equity: 10_000,
      balance: 10_000,
      unrealizedPnl: 0,
      realizedPnl: 0,
      openPositions: 0,
      portfolioHeatPct: 0,
      dailyPnl: 0,
      dailyTrades: 0,
      consecutiveLosses: 0,
      perSymbolExposure: []
    },
    signal,
    symbolSpec,
    {
      currentTs: Number(asEpochMs(1_700_000_000_000)),
      projectedRiskPct: 0.5,
      baselineEquity: 10_000,
      currentDrawdownPct: 0,
      correlatedExposurePct: 0
    }
  );

  const blocked = evaluateGovernance(
    profile,
    {
      asOfTs: asEpochMs(1_700_000_000_000),
      equity: 10_000,
      balance: 10_000,
      unrealizedPnl: 0,
      realizedPnl: 0,
      openPositions: profile.maxOpenPositions,
      portfolioHeatPct: 0,
      dailyPnl: 0,
      dailyTrades: 0,
      consecutiveLosses: 0,
      perSymbolExposure: []
    },
    signal,
    symbolSpec,
    {
      currentTs: Number(asEpochMs(1_700_000_000_000)),
      projectedRiskPct: 0.5,
      baselineEquity: 10_000,
      currentDrawdownPct: 0,
      correlatedExposurePct: 0
    }
  );

  assert.equal(allowed.decision.allowed, true);
  assert.equal(blocked.decision.allowed, false);
  assert.equal(blocked.decision.blockedBy, 'MAX_OPEN_POSITIONS');
});
