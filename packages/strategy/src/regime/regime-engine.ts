import type { MarketSnapshot, TrendBias } from '@hashi-bot/core';

import type { RegimeAssessment, RegimeState } from '../base/regime-assessment.js';

export interface RegimeThresholds {
  trendAdxMin: number;
  trendSlopePctMin: number;
  trendChopMax: number;
  chopRatioMin: number;
  lowVolAtrPctMax: number;
  expansionAtrPctMin: number;
  expansionVsRecentAtrMultiplier: number;
  contextLookback: number;
}

export interface RegimeEngineInput {
  snapshot: MarketSnapshot;
  recentSnapshots?: readonly MarketSnapshot[];
}

export const DEFAULT_REGIME_THRESHOLDS: RegimeThresholds = {
  trendAdxMin: 20,
  trendSlopePctMin: 0.03,
  trendChopMax: 55,
  chopRatioMin: 61.8,
  lowVolAtrPctMax: 0.25,
  expansionAtrPctMin: 1,
  expansionVsRecentAtrMultiplier: 1.2,
  contextLookback: 20,
};

function resolveTrendBias(snapshot: MarketSnapshot): TrendBias {
  if (snapshot.trendBias != null) {
    return snapshot.trendBias;
  }

  if (snapshot.emaFast == null || snapshot.emaSlow == null || snapshot.slopePct == null) {
    return 'neutral';
  }

  if (snapshot.emaFast > snapshot.emaSlow && snapshot.slopePct > 0) {
    return 'bullish';
  }

  if (snapshot.emaFast < snapshot.emaSlow && snapshot.slopePct < 0) {
    return 'bearish';
  }

  return 'neutral';
}

function computeRecentAtrPctAverage(
  recentSnapshots: readonly MarketSnapshot[] | undefined,
  lookback: number
): number | undefined {
  if (!recentSnapshots || recentSnapshots.length === 0) {
    return undefined;
  }

  const recent = recentSnapshots.slice(-lookback);
  let sum = 0;
  let count = 0;

  for (const item of recent) {
    if (item.atrPct == null) {
      continue;
    }
    sum += item.atrPct;
    count += 1;
  }

  if (count === 0) {
    return undefined;
  }

  return sum / count;
}

function buildAssessment(
  snapshot: MarketSnapshot,
  regimeState: RegimeState,
  trendBias: TrendBias,
  isTradable: boolean,
  reasons: string[],
  flags: string[]
): RegimeAssessment {
  return {
    symbolCode: snapshot.symbolCode,
    timeframe: snapshot.timeframe,
    regimeState,
    isTradable,
    trendBias,
    volatilityState: snapshot.volatilityState,
    reasons,
    flags,
    snapshot,
  };
}

export function classifyRegime(
  input: RegimeEngineInput,
  thresholds: Partial<RegimeThresholds> = {}
): RegimeAssessment {
  const resolved = { ...DEFAULT_REGIME_THRESHOLDS, ...thresholds };
  const { snapshot, recentSnapshots } = input;
  const reasons: string[] = [];
  const flags: string[] = [];

  const trendBias = resolveTrendBias(snapshot);

  const emaFast = snapshot.emaFast;
  const emaSlow = snapshot.emaSlow;
  const adx = snapshot.adx;
  const slopePct = snapshot.slopePct;
  const chopRatio = snapshot.chopRatio;
  const atrPct = snapshot.atrPct;

  if (emaFast == null || emaSlow == null || adx == null || slopePct == null || chopRatio == null || atrPct == null) {
    if (emaFast == null) flags.push('missing_ema_fast');
    if (emaSlow == null) flags.push('missing_ema_slow');
    if (adx == null) flags.push('missing_adx');
    if (slopePct == null) flags.push('missing_slope_pct');
    if (chopRatio == null) flags.push('missing_chop_ratio');
    if (atrPct == null) flags.push('missing_atr_pct');

    reasons.push('insufficient_snapshot_fields_for_regime_classification');

    return buildAssessment(snapshot, 'neutral', trendBias, false, reasons, flags);
  }

  const isBullTrend = emaFast > emaSlow && slopePct >= resolved.trendSlopePctMin;
  const isBearTrend = emaFast < emaSlow && slopePct <= -resolved.trendSlopePctMin;
  const isTrendStrength = adx >= resolved.trendAdxMin;
  const isChop = chopRatio >= resolved.chopRatioMin;
  const isLowVol = atrPct <= resolved.lowVolAtrPctMax;

  const recentAtrAvg = computeRecentAtrPctAverage(recentSnapshots, resolved.contextLookback);
  const isExpansionVsRecent =
    recentAtrAvg != null && recentAtrAvg > 0
      ? atrPct >= recentAtrAvg * resolved.expansionVsRecentAtrMultiplier
      : false;
  const isExpansionAbsolute = atrPct >= resolved.expansionAtrPctMin;
  const isExpansion = isExpansionAbsolute || isExpansionVsRecent;

  if (isLowVol) {
    reasons.push(`atrPct(${atrPct.toFixed(3)}) <= lowVolAtrPctMax(${resolved.lowVolAtrPctMax})`);
    return buildAssessment(snapshot, 'low_vol', trendBias, false, reasons, flags);
  }

  if (isChop && !isTrendStrength) {
    reasons.push(`chopRatio(${chopRatio.toFixed(2)}) >= chopRatioMin(${resolved.chopRatioMin})`);
    reasons.push(`adx(${adx.toFixed(2)}) < trendAdxMin(${resolved.trendAdxMin})`);
    return buildAssessment(snapshot, 'chop', 'neutral', false, reasons, flags);
  }

  if (isBullTrend && isTrendStrength && chopRatio <= resolved.trendChopMax) {
    reasons.push('emaFast > emaSlow with positive slope threshold');
    reasons.push(`adx(${adx.toFixed(2)}) >= trendAdxMin(${resolved.trendAdxMin})`);
    reasons.push(`chopRatio(${chopRatio.toFixed(2)}) <= trendChopMax(${resolved.trendChopMax})`);
    return buildAssessment(snapshot, 'trending_bull', 'bullish', true, reasons, flags);
  }

  if (isBearTrend && isTrendStrength && chopRatio <= resolved.trendChopMax) {
    reasons.push('emaFast < emaSlow with negative slope threshold');
    reasons.push(`adx(${adx.toFixed(2)}) >= trendAdxMin(${resolved.trendAdxMin})`);
    reasons.push(`chopRatio(${chopRatio.toFixed(2)}) <= trendChopMax(${resolved.trendChopMax})`);
    return buildAssessment(snapshot, 'trending_bear', 'bearish', true, reasons, flags);
  }

  if (isExpansion) {
    reasons.push(
      isExpansionAbsolute
        ? `atrPct(${atrPct.toFixed(3)}) >= expansionAtrPctMin(${resolved.expansionAtrPctMin})`
        : 'atrPct expanded vs recent context average'
    );
    if (isExpansionVsRecent && recentAtrAvg != null) {
      reasons.push(
        `atrPct(${atrPct.toFixed(3)}) >= recentAvg(${recentAtrAvg.toFixed(3)}) * ${resolved.expansionVsRecentAtrMultiplier}`
      );
    }

    return buildAssessment(snapshot, 'expanding', trendBias, true, reasons, flags);
  }

  reasons.push('no strong trend/chop/low-vol/expansion condition matched');
  return buildAssessment(snapshot, 'neutral', trendBias, false, reasons, flags);
}

export function classifyRegimeBatch(
  inputs: readonly RegimeEngineInput[],
  thresholds: Partial<RegimeThresholds> = {}
): RegimeAssessment[] {
  return inputs.map((input) => classifyRegime(input, thresholds));
}
