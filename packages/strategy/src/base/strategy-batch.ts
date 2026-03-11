import type { StrategySignal, SymbolCode } from '@hashi-bot/core';

import type { ScoredSetup } from './signal-domain.js';
import {
  evaluateMultiSymbolStrategyContext,
  type StrategyEngineConfig,
} from './strategy-engine.js';
import type { MultiSymbolStrategyRunResult } from './strategy-result.js';
import type { MultiSymbolStrategyContext } from './strategy-context.js';

export interface StrategyBatchEvaluationRequest {
  context: MultiSymbolStrategyContext;
  watchlistSymbolCodes?: SymbolCode[];
  engineConfig?: Partial<StrategyEngineConfig>;
  rankingLimit?: number;
}

export interface RankedSignal {
  symbolCode: SymbolCode;
  signal: StrategySignal;
  score: number;
  qualificationState: ScoredSetup['qualificationState'];
  rank: number;
}

export interface StrategyBatchEvaluationResult {
  batch: MultiSymbolStrategyRunResult;
  rankedSignals: RankedSignal[];
}

function bySignalPriority(a: RankedSignal, b: RankedSignal): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  return `${a.symbolCode}:${a.signal.setupCode}`.localeCompare(`${b.symbolCode}:${b.signal.setupCode}`);
}

export function rankSignalsAcrossBatch(batch: MultiSymbolStrategyRunResult, limit?: number): RankedSignal[] {
  const ranked = Object.values(batch.bySymbol)
    .flatMap((result) =>
      result.signals.map((signal) => {
        const scored = result.qualifiedSetups.find(
          (setup) => setup.candidate.setupCode === signal.setupCode && setup.candidate.side === signal.side
        );

        return {
          symbolCode: result.symbolCode,
          signal,
          score: signal.score,
          qualificationState: scored?.qualificationState ?? 'qualified',
          rank: 0,
        } satisfies RankedSignal;
      })
    )
    .sort(bySignalPriority)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return limit == null ? ranked : ranked.slice(0, Math.max(limit, 0));
}

export function evaluateStrategyBatch(request: StrategyBatchEvaluationRequest): StrategyBatchEvaluationResult {
  const watchlist = request.watchlistSymbolCodes;

  const filteredContextsBySymbol =
    watchlist == null || watchlist.length === 0
      ? request.context.contextsBySymbol
      : Object.fromEntries(
          Object.entries(request.context.contextsBySymbol).filter(([symbol]) =>
            watchlist.some((code) => code === (symbol as SymbolCode))
          )
        );

  const filteredContext: MultiSymbolStrategyContext = {
    contextsBySymbol: filteredContextsBySymbol,
    snapshotsBySymbol: Object.fromEntries(
      Object.entries(request.context.snapshotsBySymbol).filter(([symbol]) => symbol in filteredContextsBySymbol)
    ),
    regimesBySymbol: Object.fromEntries(
      Object.entries(request.context.regimesBySymbol).filter(([symbol]) => symbol in filteredContextsBySymbol)
    ),
  };

  const batch = evaluateMultiSymbolStrategyContext(filteredContext, request.engineConfig);
  const rankedSignals = rankSignalsAcrossBatch(batch, request.rankingLimit);

  return {
    batch,
    rankedSignals,
  };
}
