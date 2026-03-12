import type { Candle, EpochMs, MarketSnapshot, SymbolCode, SymbolSpec, StrategySignal } from '@hashi-bot/core';

export function asEpochMs(value: number): EpochMs {
  return value as EpochMs;
}

export function asSymbolCode(value: string): SymbolCode {
  return value as SymbolCode;
}

export function makeSymbolSpec(overrides: Partial<SymbolSpec> = {}): SymbolSpec {
  return {
    symbolCode: asSymbolCode('BTCUSDT'),
    displayName: 'BTC/USDT',
    marketType: 'crypto',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    tickSize: 0.1,
    pricePrecision: 1,
    qtyPrecision: 3,
    sessionType: 'always_open',
    isActive: true,
    ...overrides
  };
}

export function makeCandleSeries(symbolCode: SymbolCode, closes: number[], startTs = 1_700_000_000_000): Candle[] {
  return closes.map((close, index) => {
    const open = index === 0 ? close : closes[index - 1] ?? close;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;

    return {
      ts: asEpochMs(startTs + index * 60_000),
      open,
      high,
      low,
      close,
      volume: 100 + index,
      symbolCode,
      timeframe: '1m'
    };
  });
}

export function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbolCode: asSymbolCode('BTCUSDT'),
    timeframe: '1m',
    ts: asEpochMs(1_700_000_000_000),
    last: 100,
    latestClose: 100,
    emaFast: 105,
    emaSlow: 100,
    atr: 2,
    atrPct: 1.2,
    adx: 30,
    slopePct: 0.1,
    chopRatio: 40,
    trendBias: 'bullish',
    volatilityState: 'normal',
    ...overrides
  };
}

export function makeSignal(overrides: Partial<StrategySignal> = {}): StrategySignal {
  return {
    symbolCode: asSymbolCode('BTCUSDT'),
    setupCode: 'pullback:test',
    side: 'long',
    score: 80,
    entry: 100,
    stop: 95,
    tp1: 105,
    tp2: 110,
    timeStopBars: 12,
    createdAtTs: asEpochMs(1_700_000_000_000),
    ...overrides
  };
}
