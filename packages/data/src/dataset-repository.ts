import type { Candle, MarketType, SessionType, SymbolCode, SymbolSpec, Timeframe } from '@hashi-bot/core';

export interface DatasetRecord {
  id: string;
  name: string;
  symbolCode: SymbolCode;
  timeframe: Timeframe;
  candles: Candle[];
}

export interface DatasetRepository {
  listDatasets(): DatasetRecord[];
  getDataset(datasetId: string): DatasetRecord | undefined;
  listSymbols(): SymbolSpec[];
  getSymbol(symbolCode: SymbolCode): SymbolSpec | undefined;
}

function buildCandles(
  symbolCode: SymbolCode,
  timeframe: Timeframe,
  startPrice: number,
  step: number,
  count: number,
  startTs: number
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i += 1) {
    const drift = (Math.sin(i / 5) + Math.cos(i / 11)) * step;
    const open = price;
    const close = Math.max(0.00001, open + drift);
    const high = Math.max(open, close) + Math.abs(step) * 0.8;
    const low = Math.min(open, close) - Math.abs(step) * 0.8;
    const volume = Math.abs(100 + Math.sin(i / 3) * 40);

    candles.push({
      symbolCode,
      timeframe,
      ts: (startTs + i * 60_000) as Candle['ts'],
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return candles;
}

const symbols: SymbolSpec[] = [
  {
    symbolCode: 'BTCUSDT' as SymbolCode,
    displayName: 'BTC/USDT',
    marketType: 'crypto' as MarketType,
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    tickSize: 0.01,
    pricePrecision: 2,
    qtyPrecision: 6,
    sessionType: 'always_open' as SessionType,
    isActive: true,
  },
  {
    symbolCode: 'EURUSD' as SymbolCode,
    displayName: 'EUR/USD',
    marketType: 'forex' as MarketType,
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    tickSize: 0.00001,
    pipSize: 0.0001,
    pricePrecision: 5,
    qtyPrecision: 2,
    sessionType: 'forex_session' as SessionType,
    isActive: true,
  },
];

const datasets: DatasetRecord[] = [
  {
    id: 'dataset-btc-1m',
    name: 'BTCUSDT synthetic 1m',
    symbolCode: 'BTCUSDT' as SymbolCode,
    timeframe: '1m' as Timeframe,
    candles: buildCandles('BTCUSDT' as SymbolCode, '1m' as Timeframe, 35000, 70, 220, 1_700_000_000_000),
  },
  {
    id: 'dataset-eurusd-1m',
    name: 'EURUSD synthetic 1m',
    symbolCode: 'EURUSD' as SymbolCode,
    timeframe: '1m' as Timeframe,
    candles: buildCandles('EURUSD' as SymbolCode, '1m' as Timeframe, 1.08, 0.00045, 220, 1_700_000_000_000),
  },
];

export class InMemoryDatasetRepository implements DatasetRepository {
  listDatasets(): DatasetRecord[] {
    return datasets;
  }

  getDataset(datasetId: string): DatasetRecord | undefined {
    return datasets.find((item) => item.id === datasetId);
  }

  listSymbols(): SymbolSpec[] {
    return symbols;
  }

  getSymbol(symbolCode: SymbolCode): SymbolSpec | undefined {
    return symbols.find((item) => item.symbolCode === symbolCode);
  }
}
