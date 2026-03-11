import type { StrategySignal, SymbolCode } from '@hashi-bot/core';

import type { ScoredSetup, SetupCandidate, StrategyEvaluationResult } from './signal-domain.js';

export interface StrategyRunResult {
  symbolCode: SymbolCode;
  candidates: SetupCandidate[];
  scoredSetups: ScoredSetup[];
  qualifiedSetups: ScoredSetup[];
  rejectedSetups: ScoredSetup[];
  signals: StrategySignal[];
  bestSignal?: StrategySignal;
  evaluation: StrategyEvaluationResult;
}

export interface MultiSymbolStrategyRunResult {
  bySymbol: Record<string, StrategyRunResult>;
  allCandidates: SetupCandidate[];
  allScoredSetups: ScoredSetup[];
  allSignals: StrategySignal[];
  bestSignalsBySymbol: Record<string, StrategySignal | undefined>;
}
