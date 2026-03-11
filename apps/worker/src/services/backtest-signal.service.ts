import type { Candle, StrategySignal, SymbolCode, SymbolSpec } from '@hashi-bot/core';
import { buildPhase4SignalsFromCandles } from '@hashi-bot/strategy';

export interface BuildSignalsInput {
  symbolCode: SymbolCode;
  symbolSpec: SymbolSpec;
  candles: Candle[];
}

/**
 * Worker-facing signal adapter for Phase 4 backtests.
 * Delegates signal construction to the shared strategy Phase-4 adapter to keep replay/backtest/live foundations aligned.
 */
export class BacktestSignalService {
  buildSignals(input: BuildSignalsInput): StrategySignal[] {
    return buildPhase4SignalsFromCandles({
      symbolCode: input.symbolCode,
      symbolSpec: input.symbolSpec,
      candles: input.candles
    });
  }
}
