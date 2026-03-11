import type { BotMode } from '@hashi-bot/core';
import { StartupRecoveryService, type StartupRecoveryOutcome } from '@hashi-bot/execution';

import { LiveStateStoreService } from './live-state-store.service.js';
import { LiveVenueSyncService } from './live-venue-sync.service.js';

export interface StartupRecoveryRunInput {
  mode: BotMode;
}

export interface StartupRecoveryRunResult {
  outcome: StartupRecoveryOutcome;
  summary: {
    decision: StartupRecoveryOutcome['decision'];
    reason: string;
    duplicateOrderRiskDetected: boolean;
    reconciliationDriftRatio: number;
    notes: string[];
  };
}

export class WorkerStartupRecoveryService {
  private readonly recoveryService = new StartupRecoveryService();

  constructor(
    private readonly stateStore: LiveStateStoreService,
    private readonly venueSync: LiveVenueSyncService
  ) {}

  async run(input: StartupRecoveryRunInput): Promise<StartupRecoveryRunResult> {
    const persisted = await this.stateStore.load();
    const venue = await this.venueSync.syncNow();
    const outcome = this.recoveryService.evaluate({
      mode: input.mode,
      persisted,
      venue
    });

    await this.stateStore.save({
      runId: persisted?.runId,
      openOrderIds: venue.openOrderIds,
      openPositionIds: venue.openPositionIds,
      pendingIntentKeys: [],
      localBalance: venue.accountBalance,
      lastSyncedAt: venue.fetchedAt,
      updatedAt: venue.fetchedAt
    });

    return {
      outcome,
      summary: {
        decision: outcome.decision,
        reason: outcome.recovery.reason,
        duplicateOrderRiskDetected: outcome.recovery.duplicateOrderRiskDetected,
        reconciliationDriftRatio: outcome.reconciliationDriftRatio,
        notes: outcome.notes
      }
    };
  }
}
