import type { EpochMs, IsoTimestamp, WatchdogStatus } from '@hashi-bot/core';

export type WatchdogIndicatorState = 'ok' | 'warning' | 'breach' | 'unknown';

export interface WatchdogSignalStatus {
  code: WatchdogStatus['incidents'][number]['code'];
  state: WatchdogIndicatorState;
  observedValue?: number;
  threshold: number;
  breach: boolean;
  notes?: string;
}

export interface OperationalWatchdogInput {
  evaluatedAt: IsoTimestamp;
  nowMs: EpochMs;
  lastFeedUpdateMs?: EpochMs;
  lastSyncMs?: EpochMs;
  lastHeartbeatMs?: EpochMs;
  consecutiveExecutionFailures: number;
  repeatedRejectedOrders: number;
  reconciliationDriftRatio?: number;
  driftPersistenceCycles: number;
}

export interface EvaluatedWatchdogReport {
  status: WatchdogStatus;
  signals: WatchdogSignalStatus[];
}
