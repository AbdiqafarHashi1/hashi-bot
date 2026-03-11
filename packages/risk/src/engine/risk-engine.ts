import type { ProfileCode, StrategySignal, SymbolCode, SymbolSpec } from '@hashi-bot/core';

import { evaluateGovernance, type GovernanceContext } from '../governance/governance-engine.js';
import { getRiskProfile, resolveScoreRiskMultiplier } from '../profiles/index.js';
import { sizePosition } from '../sizing/index.js';
import type { PortfolioState } from '../types/portfolio-state.js';
import type { PositionPlan } from '../types/position-plan.js';
import type { RiskDecision } from '../types/risk-decision.js';

export interface RiskEvaluationInput {
  profileCode: ProfileCode;
  signal: StrategySignal;
  symbolSpec: SymbolSpec;
  portfolioState: PortfolioState;
  governanceContext: Omit<GovernanceContext, 'projectedRiskPct'>;
  minNotional?: number;
  slippageBps?: number;
  feeBps?: number;
}

function projectPortfolioAfter(portfolioState: PortfolioState, signalSymbol: SymbolCode, incrementalRiskPct: number): PortfolioState {
  const existing = portfolioState.perSymbolExposure.find((item) => item.symbolCode === signalSymbol);
  const nextSymbolExposure = {
    symbolCode: signalSymbol,
    openRiskPct: (existing?.openRiskPct ?? 0) + incrementalRiskPct,
    openNotional: existing?.openNotional,
    openPositions: (existing?.openPositions ?? 0) + 1
  };

  const perSymbolExposure = portfolioState.perSymbolExposure
    .filter((item) => item.symbolCode !== signalSymbol)
    .concat(nextSymbolExposure);

  return {
    ...portfolioState,
    openPositions: portfolioState.openPositions + 1,
    portfolioHeatPct: portfolioState.portfolioHeatPct + incrementalRiskPct,
    perSymbolExposure
  };
}

export function evaluateRiskDecision(input: RiskEvaluationInput): RiskDecision {
  const profile = getRiskProfile(input.profileCode);

  const scoreRiskMultiplier = resolveScoreRiskMultiplier(input.signal.score, profile.scoreRiskBands);
  if (scoreRiskMultiplier <= 0) {
    return {
      status: 'rejected',
      reason: 'signal_below_profile_score_bands',
      governance: {
        profileCode: profile.profileCode,
        allowed: false,
        decisionAtTs: input.governanceContext.currentTs,
        blockedBy: 'MIN_SIGNAL_SCORE',
        reason: 'signal_below_profile_score_bands'
      },
      portfolioBefore: input.portfolioState
    };
  }

  const effectiveRiskPct = profile.riskPerTradePct * scoreRiskMultiplier;

  const governance = evaluateGovernance(profile, input.portfolioState, input.signal, input.symbolSpec, {
    ...input.governanceContext,
    projectedRiskPct: effectiveRiskPct
  });

  if (!governance.decision.allowed) {
    return {
      status: 'rejected',
      reason: governance.decision.reason,
      governance: governance.decision,
      portfolioBefore: input.portfolioState
    };
  }

  const sizing = sizePosition({
    equity: input.portfolioState.equity,
    riskPct: effectiveRiskPct,
    signal: input.signal,
    symbolSpec: input.symbolSpec,
    minNotional: input.minNotional
  });

  if (!sizing.qty && !sizing.lots) {
    return {
      status: 'rejected',
      reason: 'sizing_result_too_small_or_invalid',
      governance: {
        ...governance.decision,
        allowed: false,
        blockedBy: 'CUSTOM',
        reason: 'sizing_result_too_small_or_invalid'
      },
      portfolioBefore: input.portfolioState
    };
  }

  const positionPlan: PositionPlan = {
    profileCode: input.profileCode,
    signalRef: {
      setupCode: input.signal.setupCode,
      createdAtTs: input.signal.createdAtTs
    },
    symbolCode: input.signal.symbolCode,
    side: input.signal.side,
    entry: input.signal.entry,
    stop: input.signal.stop,
    tp1: input.signal.tp1,
    tp2: input.signal.tp2,
    riskPct: sizing.normalizedRiskPct,
    riskAmount: sizing.riskAmount,
    qty: sizing.qty,
    lots: sizing.lots,
    notional: sizing.notional,
    assumptions: {
      slippageBps: input.slippageBps,
      feeBps: input.feeBps
    },
    sourceSignal: input.signal
  };

  return {
    status: 'allowed',
    reason: 'risk_checks_passed',
    positionPlan,
    governance: governance.decision,
    portfolioBefore: input.portfolioState,
    portfolioAfter: projectPortfolioAfter(input.portfolioState, input.signal.symbolCode, sizing.normalizedRiskPct)
  };
}
