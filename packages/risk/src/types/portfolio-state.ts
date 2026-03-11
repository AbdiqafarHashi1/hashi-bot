import type { SymbolCode } from '@hashi-bot/core';

export interface SymbolExposureState {
  symbolCode: SymbolCode;
  openRiskPct: number;
  openNotional?: number;
  openPositions: number;
}

export interface PortfolioState {
  asOfTs: number;
  equity: number;
  balance: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openPositions: number;
  portfolioHeatPct: number;
  dailyPnl: number;
  dailyTrades: number;
  consecutiveLosses: number;
  perSymbolExposure: SymbolExposureState[];
}
