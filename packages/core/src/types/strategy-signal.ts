import type { TradeSide } from '../enums/trade-side.js';
import type { EpochMs, SymbolCode } from './common.js';

export interface StrategySignal {
  symbolCode: SymbolCode;
  setupCode: string;
  side: TradeSide;
  score: number;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  timeStopBars: number;
  invalidationReason?: string;
  createdAtTs: EpochMs;
}
