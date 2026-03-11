import type { ProfileCode } from '@hashi-bot/core';

export interface ScoreRiskBand {
  minScore: number;
  riskMultiplier: number;
}

export interface RiskProfileDefinition {
  profileCode: ProfileCode;
  label: string;
  riskPerTradePct: number;
  maxPortfolioHeatPct: number;
  maxSymbolHeatPct: number;
  maxDailyLossPct: number;
  maxGlobalDrawdownPct: number;
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
  cooldownMinutes: number;
  maxOpenPositions: number;
  maxOpenPositionsPerSymbol: number;
  maxCorrelatedHeatPct: number;
  minSignalScore: number;
  scoreRiskBands: ScoreRiskBand[];
}
