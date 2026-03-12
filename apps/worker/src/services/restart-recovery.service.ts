import type { EpochMs } from '@hashi-bot/core';
import { RestartRecoveryService, type ExecutionAdapter, type RestartRecoveryReport } from '@hashi-bot/execution';

import type { FileLiveStateStore } from '../lib/live-state-store.js';

export interface WorkerRestartRecoveryInput {
  accountRef: string;
  staleAfterMs?: number;
}

export interface WorkerRestartRecoveryResult extends RestartRecoveryReport {
  persistedStateFound: boolean;
}

export class WorkerRestartRecoveryService {
  private readonly recoveryService = new RestartRecoveryService();

  public constructor(
    private readonly adapter: ExecutionAdapter,
    private readonly liveStateStore: FileLiveStateStore
  ) {}

  public async run(input: WorkerRestartRecoveryInput): Promise<WorkerRestartRecoveryResult> {
    const persisted = await this.liveStateStore.load();
    const sync = await this.adapter.sync(input.accountRef);

    const report = this.recoveryService.evaluate({
      nowTs: Date.now() as EpochMs,
      venueSnapshot: sync,
      persistedState: persisted
        ? {
          savedAtTs: persisted.savedAtTs,
          accountRef: persisted.accountRef,
          expectedOpenOrders: persisted.expectedOpenOrders,
          expectedOpenPositions: persisted.expectedOpenPositions,
          lastKnownSyncTs: persisted.lastKnownSyncTs
        }
        : undefined,
      staleAfterMs: input.staleAfterMs
    });

    return {
      ...report,
      persistedStateFound: Boolean(persisted)
    };
  }
}
