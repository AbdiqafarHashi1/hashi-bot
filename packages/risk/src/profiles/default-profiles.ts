import type { ProfileCode } from '@hashi-bot/core';

import type { RiskProfileDefinition } from './profile-definition.js';

export const DEFAULT_RISK_PROFILES: Record<ProfileCode, RiskProfileDefinition> = {
  GROWTH_HUNTER: {
    profileCode: 'GROWTH_HUNTER',
    label: 'Growth Hunter',
    riskPerTradePct: 1.0,
    maxPortfolioHeatPct: 4.0,
    maxSymbolHeatPct: 2.0,
    maxDailyLossPct: 4.5,
    maxGlobalDrawdownPct: 14,
    maxTradesPerDay: 8,
    maxConsecutiveLosses: 4,
    cooldownMinutes: 15,
    maxOpenPositions: 6,
    maxOpenPositionsPerSymbol: 2,
    maxCorrelatedHeatPct: 3,
    minSignalScore: 62,
    scoreRiskBands: [
      { minScore: 80, riskMultiplier: 1 },
      { minScore: 72, riskMultiplier: 0.9 },
      { minScore: 62, riskMultiplier: 0.75 }
    ]
  },
  PROP_HUNTER: {
    profileCode: 'PROP_HUNTER',
    label: 'Prop Hunter',
    riskPerTradePct: 0.5,
    maxPortfolioHeatPct: 2.0,
    maxSymbolHeatPct: 1.0,
    maxDailyLossPct: 2.0,
    maxGlobalDrawdownPct: 8,
    maxTradesPerDay: 5,
    maxConsecutiveLosses: 3,
    cooldownMinutes: 45,
    maxOpenPositions: 3,
    maxOpenPositionsPerSymbol: 1,
    maxCorrelatedHeatPct: 1.5,
    minSignalScore: 70,
    scoreRiskBands: [
      { minScore: 85, riskMultiplier: 1 },
      { minScore: 78, riskMultiplier: 0.8 },
      { minScore: 70, riskMultiplier: 0.6 }
    ]
  }
};
