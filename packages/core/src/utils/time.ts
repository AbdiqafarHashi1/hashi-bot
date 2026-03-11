import type { EpochMs, IsoTimestamp } from '../types/common.js';

export const nowEpochMs = (): EpochMs => Date.now() as EpochMs;

export const toIsoTimestamp = (epochMs: EpochMs): IsoTimestamp => {
  return new Date(epochMs).toISOString() as IsoTimestamp;
};

export const toEpochMs = (isoTimestamp: string): EpochMs => {
  return new Date(isoTimestamp).getTime() as EpochMs;
};
