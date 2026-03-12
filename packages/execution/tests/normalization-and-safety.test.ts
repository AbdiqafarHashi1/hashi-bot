import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVenueOrderPayload, createSymbolMap, OperationalKillSwitchController, resolveVenueSymbol, RestartRecoveryService } from '../src/index.ts';
import { asEpochMs, asSymbolCode, makeSignal, makeSymbolSpec } from '../../../tests/helpers/domain-fixtures.ts';

test('execution mapping normalizes symbols and order payload precision', () => {
  const symbolCode = asSymbolCode('BTCUSDT');
  const symbolSpec = makeSymbolSpec({ symbolCode, pricePrecision: 2, qtyPrecision: 3 });
  const symbolMap = createSymbolMap({
    entries: [{ symbolCode, defaultVenueSymbol: 'BTCUSDT', venues: { ccxt: 'BTC/USDT' } }]
  });

  const venueSymbol = resolveVenueSymbol(symbolCode, 'ccxt', symbolMap);
  const payload = buildVenueOrderPayload(
    {
      venue: 'ccxt',
      accountRef: 'acc',
      symbolCode,
      venueSymbol,
      side: 'buy',
      orderType: 'limit',
      quantity: 1.23456,
      price: 100.129,
      submittedAtTs: asEpochMs(1_700_000_000_000)
    },
    symbolSpec
  );

  assert.equal(venueSymbol, 'BTC/USDT');
  assert.equal(payload.quantity, 1.234);
  assert.equal(payload.price, 100.13);
});

test('kill switch controller and restart recovery react to critical scenarios', () => {
  const controller = new OperationalKillSwitchController();
  const decision = controller.evaluate({
    nowTs: asEpochMs(1_700_000_000_000),
    venue: 'ccxt',
    watchdog: {
      overallStatus: 'critical',
      feed: { status: 'critical', stale: true, ageMs: 120_000, thresholdMs: 30_000 },
      sync: { status: 'ok', stale: false, thresholdMs: 30_000 },
      heartbeat: { status: 'ok', stale: false, thresholdMs: 30_000 },
      executionFailures: { status: 'ok', breached: false, currentCount: 0, threshold: 3 },
      rejectedOrders: { status: 'ok', breached: false, currentCount: 0, threshold: 3 },
      reconciliation: { status: 'ok', persistent: false, driftCount: 0, threshold: 2 },
      feedStale: true,
      syncStale: false,
      consecutiveFailures: 0,
      rejectedOrderStreak: 0,
      reconciliationDrift: false,
      reconciliationDriftCount: 0,
      updatedAtTs: asEpochMs(1_700_000_000_000)
    },
    healthEvaluation: {
      healthStatus: 'healthy',
      recommendedAction: 'continue',
      unsafeToContinue: false,
      reasons: []
    },
    incidents: [],
    emergencyCommands: []
  });

  const recovery = new RestartRecoveryService().evaluate({
    nowTs: asEpochMs(1_700_000_000_000),
    staleAfterMs: 60_000,
    venueSnapshot: {
      venue: 'ccxt',
      accountRef: 'acc',
      fetchedAtTs: asEpochMs(1_700_000_000_000),
      account: {
        venue: 'ccxt',
        accountRef: 'acc',
        fetchedAtTs: asEpochMs(1_700_000_000_000),
        balance: 10_000,
        equity: 10_000
      },
      openOrders: [
        {
          venue: 'ccxt',
          accountRef: 'acc',
          orderId: 'remote-order',
          symbolCode: asSymbolCode('BTCUSDT'),
          venueSymbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          status: 'open',
          quantity: 1,
          remainingQuantity: 1,
          createdAtTs: asEpochMs(1_700_000_000_000),
          updatedAtTs: asEpochMs(1_700_000_000_000)
        }
      ],
      openPositions: []
    },
    persistedState: {
      savedAtTs: asEpochMs(1_700_000_000_000),
      accountRef: 'acc',
      expectedOpenOrders: [],
      expectedOpenPositions: []
    }
  });

  assert.equal(decision.controlState, 'kill_switched');
  assert.equal(decision.killSwitchState, 'active');

  assert.equal(recovery.duplicateOrderRisk, true);
  assert.equal(recovery.decision.outcome, 'manual_review_required');
});
