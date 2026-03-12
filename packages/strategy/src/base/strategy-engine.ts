import type { EpochMs, StrategySignal } from '@hashi-bot/core';

import {
  DEFAULT_SCORE_THRESHOLDS,
  DEFAULT_SCORE_WEIGHTS,
  scoreSetupCandidates,
  type ScoreEngineConfig
} from '../scoring/score-engine.js';
import {
  detectBreakoutCandidates,
  detectPullbackV2Candidates,
  detectTrendPullbackCandidates,
  type BreakoutThresholds,
  type PullbackV2Thresholds,
  type TrendPullbackThresholds,
} from '../setups/index.js';
import type { ScoredSetup, SignalDecision, StrategyEvaluationResult } from './signal-domain.js';
import type { MultiSymbolStrategyContext, StrategyContext } from './strategy-context.js';
import type { MultiSymbolStrategyRunResult, StrategyRunResult } from './strategy-result.js';

export interface StrategyEngineConfig {
  setupThresholds?: {
    trendPullback?: Partial<TrendPullbackThresholds>;
    pullbackV2?: Partial<PullbackV2Thresholds>;
    breakout?: Partial<BreakoutThresholds>;
  };
  scoring?: Partial<ScoreEngineConfig>;
  defaults?: {
    fallbackTargetRR: number;
    tp1RR: number;
    timeStopBarsBySetupCode: Record<string, number>;
    defaultTimeStopBars: number;
  };
}

export const DEFAULT_STRATEGY_ENGINE_CONFIG: StrategyEngineConfig = {
  defaults: {
    fallbackTargetRR: 2,
    tp1RR: 1,
    timeStopBarsBySetupCode: {
      'pullback:trend_pullback': 18,
      'pullback:pullback_v2': 22,
      'breakout:compression_breakout': 14,
    },
    defaultTimeStopBars: 20,
  },
};

function resolveConfig(config: Partial<StrategyEngineConfig>): StrategyEngineConfig {
  const defaultTimeStopBarsBySetupCode =
    DEFAULT_STRATEGY_ENGINE_CONFIG.defaults?.timeStopBarsBySetupCode ?? {};

  return {
    setupThresholds: {
      trendPullback: { ...(config.setupThresholds?.trendPullback ?? {}) },
      pullbackV2: { ...(config.setupThresholds?.pullbackV2 ?? {}) },
      breakout: { ...(config.setupThresholds?.breakout ?? {}) },
    },
    scoring: {
      ...(config.scoring ?? {}),
      weights: { ...DEFAULT_SCORE_WEIGHTS, ...(config.scoring?.weights ?? {}) },
      thresholds: {
        ...DEFAULT_SCORE_THRESHOLDS,
        ...(config.scoring?.thresholds ?? {}),
        setupMinimumOverrides: {
          ...DEFAULT_SCORE_THRESHOLDS.setupMinimumOverrides,
          ...(config.scoring?.thresholds?.setupMinimumOverrides ?? {}),
        },
      },
    },
    defaults: {
      fallbackTargetRR:
        config.defaults?.fallbackTargetRR ?? DEFAULT_STRATEGY_ENGINE_CONFIG.defaults?.fallbackTargetRR ?? 2,
      tp1RR: config.defaults?.tp1RR ?? DEFAULT_STRATEGY_ENGINE_CONFIG.defaults?.tp1RR ?? 1,
      defaultTimeStopBars:
        config.defaults?.defaultTimeStopBars ?? DEFAULT_STRATEGY_ENGINE_CONFIG.defaults?.defaultTimeStopBars ?? 20,
      timeStopBarsBySetupCode: {
        ...defaultTimeStopBarsBySetupCode,
        ...(config.defaults?.timeStopBarsBySetupCode ?? {}),
      },
    },
  };
}

function deriveSignalFromScoredSetup(scored: ScoredSetup, config: StrategyEngineConfig): StrategySignal | null {
  const { candidate } = scored;
  const entry = candidate.entryBasis.referencePrice;
  const stop = candidate.stopBasis.referencePrice;

  if (entry == null || stop == null) {
    return null;
  }

  const riskDistance = candidate.side === 'long' ? entry - stop : stop - entry;
  if (riskDistance <= 0) {
    return null;
  }

  const explicitTp2 = candidate.targetBasis.referencePrice;
  const fallbackTp2 =
    candidate.side === 'long'
      ? entry + riskDistance * (config.defaults?.fallbackTargetRR ?? 2)
      : entry - riskDistance * (config.defaults?.fallbackTargetRR ?? 2);
  const tp2 = explicitTp2 ?? fallbackTp2;

  const noteTp1 = candidate.targetBasis.notes?.find((note) => note.startsWith('tp1='));
  const parsedTp1 = noteTp1 == null ? undefined : Number(noteTp1.replace('tp1=', ''));
  const fallbackTp1 =
    candidate.side === 'long'
      ? entry + riskDistance * (config.defaults?.tp1RR ?? 1)
      : entry - riskDistance * (config.defaults?.tp1RR ?? 1);
  const tp1 = Number.isFinite(parsedTp1 ?? NaN) ? (parsedTp1 as number) : fallbackTp1;

  const timeStopBars =
    config.defaults?.timeStopBarsBySetupCode[candidate.setupCode] ?? config.defaults?.defaultTimeStopBars ?? 20;

  return {
    symbolCode: candidate.symbolCode,
    setupCode: candidate.setupCode,
    side: candidate.side,
    score: scored.totalScore,
    entry,
    stop,
    tp1,
    tp2,
    timeStopBars,
    invalidationReason: scored.flags?.join(',') || candidate.flags?.join(',') || undefined,
    createdAtTs: candidate.candidateTs as EpochMs,
  };
}

function buildEvaluation(
  context: StrategyContext,
  scoredSetups: ScoredSetup[],
  signals: StrategySignal[]
): StrategyEvaluationResult {
  const decisions: SignalDecision[] = scoredSetups.map((scored) => {
    const signal = signals.find(
      (item) =>
        item.setupCode === scored.candidate.setupCode &&
        item.side === scored.candidate.side &&
        item.createdAtTs === (scored.candidate.candidateTs as EpochMs)
    );

    return {
      symbolCode: scored.candidate.symbolCode,
      setupCode: scored.candidate.setupCode,
      state: scored.qualificationState,
      shouldEmitSignal: signal != null,
      reason: scored.qualificationReasons.join(' | '),
      scoredSetup: scored,
      signal,
    };
  });

  const bestDecision = decisions
    .filter((decision) => decision.signal != null)
    .sort((a, b) => (b.scoredSetup?.totalScore ?? 0) - (a.scoredSetup?.totalScore ?? 0))[0];

  return {
    symbolCode: context.symbolCode,
    evaluatedAtTs: context.snapshot.ts,
    regimeAlignment: context.regime.isTradable ? 'aligned' : 'unknown',
    decisions,
    bestDecision,
    emittedSignals: signals,
  };
}

export function evaluateStrategyContext(
  context: StrategyContext,
  config: Partial<StrategyEngineConfig> = {}
): StrategyRunResult {
  const resolved = resolveConfig(config);

  const candidates = [
    ...detectTrendPullbackCandidates(context, resolved.setupThresholds?.trendPullback ?? {}),
    ...detectPullbackV2Candidates(context, resolved.setupThresholds?.pullbackV2 ?? {}),
    ...detectBreakoutCandidates(context, resolved.setupThresholds?.breakout ?? {}),
  ];

  const scoredSetups = scoreSetupCandidates(
    candidates.map((candidate) => ({
      candidate,
      snapshot: context.snapshot,
      regime: context.regime,
    })),
    resolved.scoring
  );

  const qualifiedSetups = scoredSetups.filter((setup) => setup.isQualified);
  const rejectedSetups = scoredSetups.filter((setup) => !setup.isQualified);

  const signals = qualifiedSetups
    .map((scored) => deriveSignalFromScoredSetup(scored, resolved))
    .filter((signal): signal is StrategySignal => signal != null)
    .sort((a, b) => b.score - a.score);

  const evaluation = buildEvaluation(context, scoredSetups, signals);

  return {
    symbolCode: context.symbolCode,
    candidates,
    scoredSetups,
    qualifiedSetups,
    rejectedSetups,
    signals,
    bestSignal: signals[0],
    evaluation,
  };
}

export function evaluateMultiSymbolStrategyContext(
  input: MultiSymbolStrategyContext,
  config: Partial<StrategyEngineConfig> = {}
): MultiSymbolStrategyRunResult {
  const bySymbol = Object.fromEntries(
    Object.entries(input.contextsBySymbol).map(([symbol, context]) => [symbol, evaluateStrategyContext(context, config)])
  );

  const allResults = Object.values(bySymbol);

  return {
    bySymbol,
    allCandidates: allResults.flatMap((result) => result.candidates),
    allScoredSetups: allResults.flatMap((result) => result.scoredSetups),
    allSignals: allResults.flatMap((result) => result.signals),
    bestSignalsBySymbol: Object.fromEntries(Object.entries(bySymbol).map(([symbol, result]) => [symbol, result.bestSignal])),
  };
}
