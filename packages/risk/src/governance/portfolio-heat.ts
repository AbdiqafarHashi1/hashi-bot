import type { SymbolCode } from '@hashi-bot/core';

import type { PortfolioState } from '../types/portfolio-state.js';

export interface PortfolioHeatProjection {
  currentPortfolioHeatPct: number;
  projectedPortfolioHeatPct: number;
  currentSymbolHeatPct: number;
  projectedSymbolHeatPct: number;
}

export interface CorrelatedExposureProjection {
  currentCorrelatedHeatPct: number;
  projectedCorrelatedHeatPct: number;
}

export function projectPortfolioHeat(
  portfolioState: PortfolioState,
  symbolCode: SymbolCode,
  incrementalRiskPct: number
): PortfolioHeatProjection {
  const symbolExposure = portfolioState.perSymbolExposure.find((item) => item.symbolCode === symbolCode);
  const currentSymbolHeatPct = symbolExposure?.openRiskPct ?? 0;

  return {
    currentPortfolioHeatPct: portfolioState.portfolioHeatPct,
    projectedPortfolioHeatPct: portfolioState.portfolioHeatPct + incrementalRiskPct,
    currentSymbolHeatPct,
    projectedSymbolHeatPct: currentSymbolHeatPct + incrementalRiskPct
  };
}

export function projectCorrelatedHeat(
  currentCorrelatedHeatPct: number | undefined,
  incrementalRiskPct: number
): CorrelatedExposureProjection {
  const current = currentCorrelatedHeatPct ?? 0;

  return {
    currentCorrelatedHeatPct: current,
    projectedCorrelatedHeatPct: current + incrementalRiskPct
  };
}
