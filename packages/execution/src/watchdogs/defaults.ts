import type { WatchdogThresholds } from '@hashi-bot/core';

export interface ExecutionWatchdogThresholds extends WatchdogThresholds {
  warningFeedStalenessMs: number;
  warningSyncStalenessMs: number;
  warningHeartbeatAgeMs: number;
  warningConsecutiveFailures: number;
  warningRepeatedRejectedOrders: number;
  warningReconciliationDriftRatio: number;
  maxDriftPersistenceCycles: number;
}

export const DEFAULT_EXECUTION_WATCHDOG_THRESHOLDS: ExecutionWatchdogThresholds = {
  warningFeedStalenessMs: 15_000,
  maxFeedStalenessMs: 30_000,
  warningSyncStalenessMs: 20_000,
  maxSyncStalenessMs: 45_000,
  warningHeartbeatAgeMs: 10_000,
  maxHeartbeatAgeMs: 20_000,
  warningConsecutiveFailures: 2,
  maxConsecutiveFailures: 4,
  warningRepeatedRejectedOrders: 2,
  maxRepeatedRejectedOrders: 4,
  warningReconciliationDriftRatio: 0.01,
  maxReconciliationDriftRatio: 0.02,
  maxDriftPersistenceCycles: 3
};
