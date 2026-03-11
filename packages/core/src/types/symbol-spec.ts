import type { MarketType } from '../enums/market-type.js';
import type { SessionType } from '../enums/session-type.js';
import type { SymbolCode } from './common.js';

export interface SymbolSpec {
  symbolCode: SymbolCode;
  displayName: string;
  marketType: MarketType;
  baseCurrency: string;
  quoteCurrency: string;
  tickSize: number;
  pricePrecision: number;
  qtyPrecision: number;
  pipSize?: number;
  contractSize?: number;
  lotStep?: number;
  sessionType: SessionType;
  isActive: boolean;
}
