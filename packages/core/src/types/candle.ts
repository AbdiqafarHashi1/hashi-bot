import type { Timeframe } from '../enums/timeframe.js';
import type { EpochMs, SymbolCode } from './common.js';

export interface Candle {
  ts: EpochMs;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbolCode: SymbolCode;
  timeframe: Timeframe;
}
