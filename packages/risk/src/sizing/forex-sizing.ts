import { getPipSize } from '@hashi-bot/market';

import { clampPositive, floorToPrecision, floorToStep, type SizingInput, type SizingResult } from './common.js';

const DEFAULT_CONTRACT_SIZE = 100_000;

export function sizeForexPosition(input: SizingInput): SizingResult {
  const riskAmount = clampPositive((input.equity * input.riskPct) / 100);
  const stopDistance = Math.abs(input.signal.entry - input.signal.stop);

  if (riskAmount === 0 || stopDistance <= 0) {
    return { riskAmount, stopDistance, normalizedRiskPct: 0 };
  }

  const pipSize = getPipSize(input.symbolSpec);
  const stopDistancePips = stopDistance / pipSize;
  const contractSize = input.symbolSpec.contractSize ?? DEFAULT_CONTRACT_SIZE;
  const pipValuePerLot = contractSize * pipSize;

  if (stopDistancePips <= 0 || pipValuePerLot <= 0) {
    return { riskAmount, stopDistance, normalizedRiskPct: 0 };
  }

  const rawLots = riskAmount / (stopDistancePips * pipValuePerLot);
  const lotStep = input.symbolSpec.lotStep ?? 1 / 10 ** input.symbolSpec.qtyPrecision;
  const lots = floorToStep(rawLots, lotStep);

  if (lots <= 0) {
    return { riskAmount, stopDistance, lots: 0, normalizedRiskPct: 0 };
  }

  const qty = floorToPrecision(lots * contractSize, input.symbolSpec.qtyPrecision);
  const notional = qty * input.signal.entry;
  const normalizedRiskAmount = lots * stopDistancePips * pipValuePerLot;
  const normalizedRiskPct = input.equity > 0 ? (normalizedRiskAmount / input.equity) * 100 : 0;

  return {
    riskAmount,
    stopDistance,
    qty,
    lots,
    notional,
    normalizedRiskPct
  };
}
