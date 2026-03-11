import type { Candle, StrategySignal, SymbolCode, SymbolSpec } from '@hashi-bot/core';

import { buildMarketSnapshot } from './snapshot-builder.js';
import { classifyRegime } from '../regime/regime-engine.js';

export interface Phase4SignalAdapterInput {
  symbolCode: SymbolCode;
  symbolSpec: SymbolSpec;
  candles: Candle[];
  minBars?: number;
}

/**
 * Phase-4 adapter that emits StrategySignal-compatible objects from snapshot/regime context.
 * Intended as a deterministic bridge until full setup/scoring engine wiring is finalized.
 */
export function buildPhase4SignalsFromCandles(input: Phase4SignalAdapterInput): StrategySignal[] {
  const minBars = input.minBars ?? 30;
  if (input.candles.length < minBars) {
    return [];
  }

  const snapshot = buildMarketSnapshot({
    candles: input.candles,
    symbolSpec: input.symbolSpec,
    timeframe: input.candles.at(-1)?.timeframe
  });

  const regime = classifyRegime({ snapshot });
  if (!regime.isTradable || !snapshot.latestClose || !snapshot.atr || snapshot.atr <= 0) {
    return [];
  }

  const side = regime.trendBias === 'bullish' ? 'long' : regime.trendBias === 'bearish' ? 'short' : null;
  if (!side) {
    return [];
  }

  const entry = snapshot.latestClose;
  const stopDistance = snapshot.atr * 1.2;

  return [
    {
      symbolCode: input.symbolCode,
      setupCode: `REGIME_${regime.regimeState}`,
      side,
      score: 78,
      entry,
      stop: side === 'long' ? entry - stopDistance : entry + stopDistance,
      tp1: side === 'long' ? entry + snapshot.atr * 1.5 : entry - snapshot.atr * 1.5,
      tp2: side === 'long' ? entry + snapshot.atr * 2.5 : entry - snapshot.atr * 2.5,
      timeStopBars: 24,
      createdAtTs: (input.candles.at(-1)?.ts ?? Date.now()) as StrategySignal['createdAtTs']
    }
  ];
}
