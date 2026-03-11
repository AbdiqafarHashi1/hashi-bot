import type { MarketSnapshot } from '@hashi-bot/core';

import type { RegimeAssessment } from '../base/regime-assessment.js';
import type {
  QualificationState,
  ScoredSetup,
  ScoreCategory,
  SetupCandidate,
  SetupReason,
  SetupScoreBreakdown,
} from '../base/signal-domain.js';

export interface ScoreEngineInput {
  candidate: SetupCandidate;
  snapshot: MarketSnapshot;
  regime: RegimeAssessment;
}

export interface ScoreEngineThresholds {
  minimumQualifiedScore: number;
  minimumWatchlistScore: number;
  setupMinimumOverrides: Partial<Record<SetupCandidate['setupCode'], number>>;
}

export type ScoreWeightMap = Record<ScoreCategory, number>;

export interface ScoreEngineConfig {
  weights: ScoreWeightMap;
  thresholds: ScoreEngineThresholds;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeightMap = {
  trend_quality: 25,
  structure_quality: 25,
  trigger_quality: 20,
  volatility_quality: 15,
  location_quality: 15,
};

export const DEFAULT_SCORE_THRESHOLDS: ScoreEngineThresholds = {
  minimumQualifiedScore: 70,
  minimumWatchlistScore: 55,
  setupMinimumOverrides: {
    'pullback:pullback_v2': 75,
    'breakout:compression_breakout': 72,
  },
};

export const DEFAULT_SCORE_ENGINE_CONFIG: ScoreEngineConfig = {
  weights: DEFAULT_SCORE_WEIGHTS,
  thresholds: DEFAULT_SCORE_THRESHOLDS,
};

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function getAlignmentScore(input: ScoreEngineInput): number {
  const { candidate, regime, snapshot } = input;
  const sideAligned =
    (candidate.side === 'long' && regime.trendBias === 'bullish') ||
    (candidate.side === 'short' && regime.trendBias === 'bearish');
  const regimeAligned =
    (candidate.side === 'long' && regime.regimeState === 'trending_bull') ||
    (candidate.side === 'short' && regime.regimeState === 'trending_bear');

  if (!regime.isTradable) {
    return 0.2;
  }

  if (sideAligned && regimeAligned) {
    return 1;
  }

  if (sideAligned || snapshot.trendBias === 'neutral') {
    return 0.65;
  }

  return 0.35;
}

function getTrendComponent(input: ScoreEngineInput): number {
  const { snapshot } = input;

  const adxScore = snapshot.adx == null ? 0.45 : clamp((snapshot.adx - 15) / 20);
  const slopeAbs = Math.abs(snapshot.slopePct ?? 0);
  const slopeScore = snapshot.slopePct == null ? 0.45 : clamp(slopeAbs / 0.15);
  const emaScore =
    snapshot.emaFast == null || snapshot.emaSlow == null
      ? 0.45
      : clamp(Math.abs(snapshot.emaFast - snapshot.emaSlow) / Math.max(snapshot.latestClose ?? snapshot.last, 1) / 0.008);
  const alignment = getAlignmentScore(input);

  return clamp(adxScore * 0.3 + slopeScore * 0.25 + emaScore * 0.2 + alignment * 0.25);
}

function getStructureComponent(input: ScoreEngineInput): number {
  const depth = input.candidate.structure.pullbackDepthPct;
  const hasSwings =
    input.candidate.structure.swingHigh != null &&
    input.candidate.structure.swingLow != null &&
    input.candidate.structure.swingHigh !== input.candidate.structure.swingLow;
  const hasBreakoutLevel = input.candidate.structure.breakoutLevel != null;

  let depthScore = 0.6;
  if (depth != null) {
    if (depth >= 30 && depth <= 55) depthScore = 1;
    else if (depth >= 20 && depth <= 65) depthScore = 0.75;
    else depthScore = 0.4;
  }

  return clamp(depthScore * 0.5 + (hasSwings ? 1 : 0.5) * 0.3 + (hasBreakoutLevel ? 1 : 0.55) * 0.2);
}

function getTriggerComponent(input: ScoreEngineInput): number {
  const source = input.candidate.entryBasis.source;
  const triggerReason = input.candidate.reasons.some((reason) => `${reason}`.includes('trigger_confirmed'));
  const confidence = input.candidate.entryBasis.confidence ?? 0.7;

  const sourceStrength =
    source.includes('strong_confirmation') || source.includes('break_above') || source.includes('break_below')
      ? 1
      : 0.75;

  return clamp(sourceStrength * 0.45 + (triggerReason ? 1 : 0.55) * 0.35 + clamp(confidence) * 0.2);
}

function getVolatilityComponent(input: ScoreEngineInput): number {
  const { snapshot } = input;
  const atrPct = snapshot.atrPct;
  const state = snapshot.volatilityState;

  const stateScore = state === 'normal' || state === 'expanding' ? 1 : state === 'high' ? 0.65 : 0.45;

  let atrPctScore = 0.65;
  if (atrPct != null) {
    if (atrPct >= 0.2 && atrPct <= 2.5) atrPctScore = 1;
    else if (atrPct > 2.5 && atrPct <= 4) atrPctScore = 0.7;
    else atrPctScore = 0.45;
  }

  return clamp(stateScore * 0.55 + atrPctScore * 0.45);
}

function getLocationComponent(input: ScoreEngineInput): number {
  const entry = input.candidate.entryBasis.referencePrice;
  const stop = input.candidate.stopBasis.referencePrice;
  const target = input.candidate.targetBasis.referencePrice;

  if (entry == null || stop == null || target == null) {
    return 0.35;
  }

  const risk = input.candidate.side === 'long' ? entry - stop : stop - entry;
  const reward = input.candidate.side === 'long' ? target - entry : entry - target;

  if (risk <= 0 || reward <= 0) {
    return 0.1;
  }

  const rr = reward / risk;
  if (rr >= 2.5) return 1;
  if (rr >= 2) return 0.9;
  if (rr >= 1.5) return 0.75;
  if (rr >= 1.2) return 0.6;
  return 0.35;
}

function toBreakdown(input: ScoreEngineInput): SetupScoreBreakdown {
  return {
    trend_quality: round(getTrendComponent(input) * 100),
    structure_quality: round(getStructureComponent(input) * 100),
    trigger_quality: round(getTriggerComponent(input) * 100),
    volatility_quality: round(getVolatilityComponent(input) * 100),
    location_quality: round(getLocationComponent(input) * 100),
  };
}

function weightedTotal(breakdown: SetupScoreBreakdown, weights: ScoreWeightMap): number {
  const totalWeight = Object.values(weights).reduce((acc, item) => acc + item, 0);
  const weighted =
    breakdown.trend_quality * weights.trend_quality +
    breakdown.structure_quality * weights.structure_quality +
    breakdown.trigger_quality * weights.trigger_quality +
    breakdown.volatility_quality * weights.volatility_quality +
    breakdown.location_quality * weights.location_quality;

  return round(weighted / Math.max(totalWeight, 1));
}

function evaluateQualification(
  input: ScoreEngineInput,
  totalScore: number,
  thresholds: ScoreEngineThresholds
): { state: QualificationState; reasons: SetupReason[]; flags: string[] } {
  const minimumQualifiedScore = thresholds.setupMinimumOverrides[input.candidate.setupCode] ?? thresholds.minimumQualifiedScore;
  const reasons: SetupReason[] = [`score=${totalScore.toFixed(2)}`, `qualified_threshold=${minimumQualifiedScore}`];
  const flags: string[] = [];

  if (!input.regime.isTradable) {
    flags.push('regime_not_tradable');
    reasons.push('regime_countertrend');
  }

  if (input.snapshot.flags?.length) {
    flags.push(...input.snapshot.flags);
  }

  if (totalScore >= minimumQualifiedScore) {
    reasons.push('setup_qualified');
    return { state: 'qualified', reasons, flags };
  }

  if (totalScore >= thresholds.minimumWatchlistScore) {
    reasons.push('setup_watchlist');
    return { state: 'watchlist', reasons, flags };
  }

  reasons.push('setup_rejected_low_score');
  return { state: 'rejected', reasons, flags };
}

export function scoreSetupCandidate(
  input: ScoreEngineInput,
  config: Partial<ScoreEngineConfig> = {}
): ScoredSetup {
  const resolved: ScoreEngineConfig = {
    weights: { ...DEFAULT_SCORE_WEIGHTS, ...(config.weights ?? {}) },
    thresholds: {
      ...DEFAULT_SCORE_THRESHOLDS,
      ...(config.thresholds ?? {}),
      setupMinimumOverrides: {
        ...DEFAULT_SCORE_THRESHOLDS.setupMinimumOverrides,
        ...(config.thresholds?.setupMinimumOverrides ?? {}),
      },
    },
  };

  const scoreBreakdown = toBreakdown(input);
  const totalScore = weightedTotal(scoreBreakdown, resolved.weights);
  const qualification = evaluateQualification(input, totalScore, resolved.thresholds);

  return {
    candidate: input.candidate,
    totalScore,
    scoreBreakdown,
    isQualified: qualification.state === 'qualified',
    qualificationState: qualification.state,
    qualificationReasons: qualification.reasons,
    flags: qualification.flags,
  };
}

export function scoreSetupCandidates(
  inputs: readonly ScoreEngineInput[],
  config: Partial<ScoreEngineConfig> = {}
): ScoredSetup[] {
  return inputs.map((input) => scoreSetupCandidate(input, config));
}
