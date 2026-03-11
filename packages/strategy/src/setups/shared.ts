import type { Candle, MarketSnapshot, SymbolSpec, TradeSide } from '@hashi-bot/core';

import type { RegimeAssessment } from '../base/regime-assessment.js';
import type { SetupCandidate, SetupLevelBasis, SetupReason } from '../base/signal-domain.js';

export interface SetupDetectionInput {
  candles: readonly Candle[];
  symbolSpec: SymbolSpec;
  snapshot: MarketSnapshot;
  regime: RegimeAssessment;
}

export interface TrendLeg {
  impulseMove: number;
  impulseHigh: number;
  impulseLow: number;
  retraceHigh: number;
  retraceLow: number;
  retraceDepthPct: number;
}

export function sliceRecentCandles(candles: readonly Candle[], lookback: number): Candle[] {
  if (candles.length <= lookback) {
    return [...candles];
  }

  return candles.slice(candles.length - lookback);
}

export function maxHigh(candles: readonly Candle[]): number {
  return candles.reduce((max, candle) => Math.max(max, candle.high), Number.NEGATIVE_INFINITY);
}

export function minLow(candles: readonly Candle[]): number {
  return candles.reduce((min, candle) => Math.min(min, candle.low), Number.POSITIVE_INFINITY);
}

export function roundToTick(value: number, symbolSpec: SymbolSpec): number {
  const tick = symbolSpec.tickSize;
  if (tick <= 0) {
    return value;
  }

  const rounded = Math.round(value / tick) * tick;
  const factor = 10 ** symbolSpec.pricePrecision;
  return Math.round(rounded * factor) / factor;
}

export function buildSetupCandidate(
  side: TradeSide,
  setupCode: SetupCandidate['setupCode'],
  input: SetupDetectionInput,
  levels: {
    entry: SetupLevelBasis;
    stop: SetupLevelBasis;
    target: SetupLevelBasis;
  },
  reasons: SetupReason[],
  flags: string[],
  structure: SetupCandidate['structure']
): SetupCandidate {
  const latest = input.candles[input.candles.length - 1];

  return {
    symbolCode: input.symbolSpec.symbolCode,
    setupCode,
    side,
    candidateTs: latest?.ts ?? input.snapshot.ts,
    structure,
    entryBasis: levels.entry,
    stopBasis: levels.stop,
    targetBasis: levels.target,
    reasons,
    flags,
    notes: [
      `regime=${input.regime.regimeState}`,
      `trendBias=${input.regime.trendBias}`,
      `instrument=${input.symbolSpec.marketType}`,
    ],
  };
}
