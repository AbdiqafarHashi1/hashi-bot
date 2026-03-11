import type { StrategySignal, SymbolSpec } from '@hashi-bot/core';

import type { RiskProfileDefinition } from '../profiles/profile-definition.js';
import type { PortfolioState } from '../types/portfolio-state.js';
import type { GovernanceConstraintCode, GovernanceDecision } from '../types/governance-decision.js';
import { projectCorrelatedHeat, projectPortfolioHeat, type CorrelatedExposureProjection, type PortfolioHeatProjection } from './portfolio-heat.js';
import { isSessionTradable } from './session-guard.js';

export interface GovernanceContext {
  currentTs: number;
  projectedRiskPct: number;
  baselineEquity: number;
  currentDrawdownPct: number;
  correlatedExposurePct?: number;
  lastTradeClosedAtTsBySymbol?: Partial<Record<string, number>>;
}

export interface GovernanceCheckResult {
  decision: GovernanceDecision;
  portfolioHeat: PortfolioHeatProjection;
  correlatedHeat: CorrelatedExposureProjection;
}

interface GovernanceViolation {
  code: GovernanceConstraintCode;
  message: string;
}

export function evaluateGovernance(
  profile: RiskProfileDefinition,
  portfolioState: PortfolioState,
  signal: StrategySignal,
  symbolSpec: SymbolSpec,
  context: GovernanceContext
): GovernanceCheckResult {
  const violations: GovernanceViolation[] = [];
  const portfolioHeat = projectPortfolioHeat(portfolioState, signal.symbolCode, context.projectedRiskPct);
  const correlatedHeat = projectCorrelatedHeat(context.correlatedExposurePct, context.projectedRiskPct);

  if (!symbolSpec.isActive) {
    violations.push({ code: 'SYMBOL_RESTRICTION', message: `${symbolSpec.symbolCode} is not active` });
  }

  if (!isSessionTradable(symbolSpec.sessionType, context.currentTs)) {
    violations.push({ code: 'SESSION_RESTRICTION', message: `${symbolSpec.sessionType} session is not tradable at this time` });
  }

  if (signal.score < profile.minSignalScore) {
    violations.push({ code: 'MIN_SIGNAL_SCORE', message: `signal score ${signal.score} is below minimum ${profile.minSignalScore}` });
  }

  if (portfolioState.openPositions >= profile.maxOpenPositions) {
    violations.push({
      code: 'MAX_OPEN_POSITIONS',
      message: `open positions ${portfolioState.openPositions} reached profile limit ${profile.maxOpenPositions}`
    });
  }

  const symbolOpenPositions = portfolioState.perSymbolExposure.find((item) => item.symbolCode === signal.symbolCode)?.openPositions ?? 0;
  if (symbolOpenPositions >= profile.maxOpenPositionsPerSymbol) {
    violations.push({
      code: 'MAX_OPEN_POSITIONS_PER_SYMBOL',
      message: `symbol open positions ${symbolOpenPositions} reached symbol limit ${profile.maxOpenPositionsPerSymbol}`
    });
  }

  if (portfolioState.dailyTrades >= profile.maxTradesPerDay) {
    violations.push({
      code: 'MAX_DAILY_TRADES',
      message: `daily trades ${portfolioState.dailyTrades} reached profile limit ${profile.maxTradesPerDay}`
    });
  }

  const dailyLossPct = context.baselineEquity > 0 ? Math.max(0, (-portfolioState.dailyPnl / context.baselineEquity) * 100) : 0;
  if (dailyLossPct >= profile.maxDailyLossPct) {
    violations.push({
      code: 'MAX_DAILY_LOSS',
      message: `daily loss ${dailyLossPct.toFixed(2)}% reached profile limit ${profile.maxDailyLossPct}%`
    });
  }

  if (context.currentDrawdownPct >= profile.maxGlobalDrawdownPct) {
    violations.push({
      code: 'MAX_GLOBAL_DRAWDOWN',
      message: `global drawdown ${context.currentDrawdownPct.toFixed(2)}% reached profile limit ${profile.maxGlobalDrawdownPct}%`
    });
  }

  if (portfolioState.consecutiveLosses >= profile.maxConsecutiveLosses) {
    violations.push({
      code: 'MAX_CONSECUTIVE_LOSSES',
      message: `consecutive losses ${portfolioState.consecutiveLosses} reached profile limit ${profile.maxConsecutiveLosses}`
    });
  }

  if (portfolioHeat.projectedPortfolioHeatPct > profile.maxPortfolioHeatPct) {
    violations.push({
      code: 'CORRELATION_LIMIT',
      message: `projected portfolio heat ${portfolioHeat.projectedPortfolioHeatPct.toFixed(2)}% exceeds ${profile.maxPortfolioHeatPct}%`
    });
  }

  if (portfolioHeat.projectedSymbolHeatPct > profile.maxSymbolHeatPct) {
    violations.push({
      code: 'SYMBOL_RESTRICTION',
      message: `projected symbol heat ${portfolioHeat.projectedSymbolHeatPct.toFixed(2)}% exceeds ${profile.maxSymbolHeatPct}%`
    });
  }

  if (correlatedHeat.projectedCorrelatedHeatPct > profile.maxCorrelatedHeatPct) {
    violations.push({
      code: 'CORRELATION_LIMIT',
      message: `projected correlated heat ${correlatedHeat.projectedCorrelatedHeatPct.toFixed(2)}% exceeds ${profile.maxCorrelatedHeatPct}%`
    });
  }

  const lastClosedAt = context.lastTradeClosedAtTsBySymbol?.[signal.symbolCode];
  if (lastClosedAt !== undefined) {
    const cooldownMs = profile.cooldownMinutes * 60_000;
    if (context.currentTs - lastClosedAt < cooldownMs) {
      violations.push({ code: 'COOLDOWN_ACTIVE', message: `cooldown active for ${signal.symbolCode}` });
    }
  }

  const allowed = violations.length === 0;

  const decision: GovernanceDecision = {
    profileCode: profile.profileCode,
    allowed,
    decisionAtTs: context.currentTs,
    blockedBy: violations[0]?.code,
    reason: allowed ? 'governance_checks_passed' : 'governance_checks_failed',
    notes: violations.map((item) => `${item.code}: ${item.message}`)
  };

  return {
    decision,
    portfolioHeat,
    correlatedHeat
  };
}
