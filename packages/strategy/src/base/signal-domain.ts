import type { JsonObject, JsonValue, StrategySignal, SymbolCode, TradeSide } from '@hashi-bot/core';

import type { RegimeState } from './regime-assessment.js';

export type SetupFamily =
  | 'trend_continuation'
  | 'pullback'
  | 'breakout'
  | 'reversal'
  | 'range_reversion'
  | 'custom';

export type SetupCode = `${SetupFamily}:${string}`;

export type SetupReasonCode =
  | 'regime_aligned'
  | 'regime_countertrend'
  | 'trend_strength_confirmed'
  | 'trend_strength_weak'
  | 'structure_confirmed'
  | 'structure_unclear'
  | 'trigger_confirmed'
  | 'trigger_missing'
  | 'volatility_acceptable'
  | 'volatility_extreme'
  | 'location_favorable'
  | 'location_unfavorable'
  | 'risk_to_reward_insufficient'
  | 'invalid_levels';

export type SetupReason = SetupReasonCode | string;

export type RegimeAlignment = 'aligned' | 'counter' | 'neutral' | 'unknown';

export type QualificationState = 'qualified' | 'watchlist' | 'rejected';

export interface SetupLevelBasis {
  source: string;
  referencePrice?: number;
  offset?: number;
  confidence?: number;
  notes?: string[];
}

export interface SetupStructureMetadata {
  regimeState?: RegimeState;
  regimeAlignment?: RegimeAlignment;
  swingHigh?: number;
  swingLow?: number;
  breakoutLevel?: number;
  pullbackDepthPct?: number;
  tags?: string[];
  extra?: JsonObject;
}

export interface SetupCandidate {
  symbolCode: SymbolCode;
  setupCode: SetupCode;
  side: TradeSide;
  candidateTs: number;
  structure: SetupStructureMetadata;
  entryBasis: SetupLevelBasis;
  stopBasis: SetupLevelBasis;
  targetBasis: SetupLevelBasis;
  reasons: SetupReason[];
  notes?: string[];
  flags?: string[];
}

export interface SetupValidationResult {
  candidate: SetupCandidate;
  isStructurallyValid: boolean;
  qualificationState: QualificationState;
  reasons: SetupReason[];
  details?: JsonObject;
}

export type ScoreCategory =
  | 'trend_quality'
  | 'structure_quality'
  | 'trigger_quality'
  | 'volatility_quality'
  | 'location_quality';

export type SetupScoreBreakdown = Record<ScoreCategory, number>;

export interface ScoredSetup {
  candidate: SetupCandidate;
  totalScore: number;
  scoreBreakdown: SetupScoreBreakdown;
  isQualified: boolean;
  qualificationState: QualificationState;
  qualificationReasons: SetupReason[];
  flags?: string[];
}

export interface ExtendedStrategySignal extends StrategySignal {
  setupFamily?: SetupFamily;
  setupCandidateTs?: number;
  scoreBreakdown?: Partial<SetupScoreBreakdown>;
  qualificationState?: QualificationState;
  qualificationReasons?: SetupReason[];
  metadata?: JsonValue;
}

export interface SignalDecision {
  symbolCode: SymbolCode;
  setupCode: SetupCode;
  state: QualificationState;
  shouldEmitSignal: boolean;
  reason: string;
  scoredSetup?: ScoredSetup;
  signal?: ExtendedStrategySignal;
}

export interface StrategyEvaluationResult {
  symbolCode: SymbolCode;
  evaluatedAtTs: number;
  regimeAlignment: RegimeAlignment;
  decisions: SignalDecision[];
  bestDecision?: SignalDecision;
  emittedSignals: ExtendedStrategySignal[];
}
