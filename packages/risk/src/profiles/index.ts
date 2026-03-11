import type { ProfileCode } from '@hashi-bot/core';

import { DEFAULT_RISK_PROFILES } from './default-profiles.js';
import type { RiskProfileDefinition, ScoreRiskBand } from './profile-definition.js';

export * from './default-profiles.js';
export * from './profile-definition.js';

export function getRiskProfile(profileCode: ProfileCode): RiskProfileDefinition {
  return DEFAULT_RISK_PROFILES[profileCode];
}

export function resolveScoreRiskMultiplier(score: number, scoreRiskBands: ScoreRiskBand[]): number {
  const sorted = [...scoreRiskBands].sort((a, b) => b.minScore - a.minScore);

  for (const band of sorted) {
    if (score >= band.minScore) {
      return band.riskMultiplier;
    }
  }

  return 0;
}
