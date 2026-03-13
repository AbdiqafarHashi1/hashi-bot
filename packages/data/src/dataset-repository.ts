import type { Candle, MarketType, SessionType, SymbolCode, SymbolSpec, Timeframe } from '@hashi-bot/core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
    symbolCode: 'ETHUSDT' as SymbolCode,
    displayName: 'ETH/USDT',
    marketType: 'crypto' as MarketType,
    baseCurrency: 'ETH',
    quoteCurrency: 'USDT',
    tickSize: 0.01,
    pricePrecision: 2,
    qtyPrecision: 5,
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

function getHeaderIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.findIndex((header) => header === alias);
    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function parseTimestamp(raw: string): number {
  const value = raw.trim();
  if (!value) {
    throw new Error('timestamp value is empty');
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
  }

  const asDate = Date.parse(value);
  if (!Number.isFinite(asDate)) {
    throw new Error(`timestamp value is not parseable: ${value}`);
  }

  return asDate;
}

function parseCsvDataset(filePath: string, datasetId: string, symbolCode: SymbolCode, timeframe: Timeframe): DatasetRecord {
  const absolutePath = path.resolve(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Dataset CSV file not found at ${absolutePath}`);
  }

  const rawCsv = readFileSync(absolutePath, 'utf8').trim();
  if (!rawCsv) {
    throw new Error(`Dataset CSV file is empty at ${absolutePath}`);
  }

  const lines = rawCsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(`Dataset CSV must include header + at least one row. Found ${lines.length} lines.`);
  }

  const headerLine = lines[0];
  if (!headerLine) {
    throw new Error('Dataset CSV header row is missing.');
  }

  const headers = headerLine.split(',').map((item) => item.trim().toLowerCase());

  const tsIndex = getHeaderIndex(headers, ['ts', 'timestamp', 'time', 'open_time', 'datetime', 'date']);
  const openIndex = getHeaderIndex(headers, ['open', 'o']);
  const highIndex = getHeaderIndex(headers, ['high', 'h']);
  const lowIndex = getHeaderIndex(headers, ['low', 'l']);
  const closeIndex = getHeaderIndex(headers, ['close', 'c']);
  const volumeIndex = getHeaderIndex(headers, ['volume', 'v', 'vol']);

  if ([tsIndex, openIndex, highIndex, lowIndex, closeIndex].some((index) => index < 0)) {
    throw new Error(
      `Dataset CSV headers must include timestamp/open/high/low/close columns. Found headers: ${headers.join(', ')}`
    );
  }

  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    const cells = line.split(',').map((item) => item.trim());
    if (!cells.length || cells.every((cell) => !cell)) {
      continue;
    }

    const open = Number(cells[openIndex]);
    const high = Number(cells[highIndex]);
    const low = Number(cells[lowIndex]);
    const close = Number(cells[closeIndex]);
    const volume = volumeIndex >= 0 ? Number(cells[volumeIndex]) : 0;
    const tsValue = cells[tsIndex];
    if (tsValue === undefined) {
      throw new Error(`Dataset CSV row ${i + 1} is missing timestamp value.`);
    }

    const ts = parseTimestamp(tsValue);

    if (![open, high, low, close, volume].every(Number.isFinite)) {
      throw new Error(`Dataset CSV row ${i + 1} contains invalid OHLCV numeric values.`);
    }

    candles.push({
      symbolCode,
      timeframe,
      ts: ts as Candle['ts'],
      open,
      high,
      low,
      close,
      volume,
    });
  }

  if (candles.length < 2) {
    throw new Error(`Dataset CSV must include at least two rows of candles. Found ${candles.length}.`);
  }

  candles.sort((a, b) => a.ts - b.ts);

  return {
    id: datasetId,
    name: `${symbolCode} ${timeframe} CSV`,
    symbolCode,
    timeframe,
    candles,
  };
}

function buildSymbolSpec(symbolCode: SymbolCode): SymbolSpec {
  const compactCode = symbolCode.replace(/[-_/]/g, '');
  const hasUsdtQuote = compactCode.endsWith('USDT') && compactCode.length > 4;
  const baseCurrency = hasUsdtQuote ? compactCode.slice(0, -4) : compactCode.slice(0, 3) || 'BASE';
  const quoteCurrency = hasUsdtQuote ? 'USDT' : compactCode.slice(3) || 'USD';

  return {
    symbolCode,
    displayName: `${baseCurrency}/${quoteCurrency}`,
    marketType: 'crypto' as MarketType,
    baseCurrency,
    quoteCurrency,
    tickSize: 0.01,
    pricePrecision: 2,
    qtyPrecision: 6,
    sessionType: 'always_open' as SessionType,
    isActive: true,
  };
}

export class InMemoryDatasetRepository implements DatasetRepository {
  private readonly datasets: DatasetRecord[];

  private readonly symbols: SymbolSpec[];

  constructor() {
    this.datasets = [...datasets];
    this.symbols = [...symbols];

    const datasetCsvPath = process.env.DATASET_CSV_PATH;
    if (!datasetCsvPath) {
      return;
    }

    const datasetId = (process.env.DATASET_ID ?? 'dataset-custom-csv').trim();
    const symbolCode = (process.env.DATASET_SYMBOL_CODE ?? 'ETHUSDT').trim().toUpperCase() as SymbolCode;
    const timeframe = (process.env.DATASET_TIMEFRAME ?? '15m').trim() as Timeframe;

    const csvDataset = parseCsvDataset(datasetCsvPath, datasetId, symbolCode, timeframe);
    this.datasets.unshift(csvDataset);

    if (!this.symbols.find((item) => item.symbolCode === symbolCode)) {
      this.symbols.push(buildSymbolSpec(symbolCode));
    }
  }

  listDatasets(): DatasetRecord[] {
    return this.datasets;
  }

  getDataset(datasetId: string): DatasetRecord | undefined {
    return this.datasets.find((item) => item.id === datasetId);
  }

  listSymbols(): SymbolSpec[] {
    return this.symbols;
  }

  getSymbol(symbolCode: SymbolCode): SymbolSpec | undefined {
    return this.symbols.find((item) => item.symbolCode === symbolCode);
  }
}
