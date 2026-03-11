import type { StrategySignal, SymbolSpec } from '@hashi-bot/core';

export interface SizingInput {
  equity: number;
  riskPct: number;
  signal: StrategySignal;
  symbolSpec: SymbolSpec;
  minNotional?: number;
}

export interface SizingResult {
  riskAmount: number;
  stopDistance: number;
  qty?: number;
  lots?: number;
  notional?: number;
  normalizedRiskPct: number;
}

export function floorToStep(value: number, step: number): number {
  if (step <= 0) {
    return value;
  }

  return Math.floor(value / step) * step;
}

export function floorToPrecision(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.floor(value * factor) / factor;
}

export function clampPositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
