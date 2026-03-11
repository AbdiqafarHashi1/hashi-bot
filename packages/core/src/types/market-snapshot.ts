import type { EpochMs, SymbolCode } from './common.js';

export interface MarketSnapshot {
  symbolCode: SymbolCode;
  ts: EpochMs;
  bid?: number;
  ask?: number;
  last: number;
  mark?: number;
  index?: number;
  spread?: number;
  volume24h?: number;
}
