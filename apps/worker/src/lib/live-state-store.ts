import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type {
  EpochMs,
  ExecutionVenue,
  HealthStatus,
  OperationalControlState,
  RecoveryDecision,
  RecoveryState
} from '@hashi-bot/core';
import type { EmergencyCommandExecutionResult, VenueOrder, VenuePosition } from '@hashi-bot/execution';

export interface PersistedLiveIncidentSummary {
  asOfTs: EpochMs;
  totalOpenIncidents: number;
  criticalIncidentCount: number;
  latestIncidentMessage?: string;
}

export interface PersistedLiveLockoutSnapshot {
  asOfTs: EpochMs;
  controlState?: OperationalControlState;
  blockNewOrderPlacement: boolean;
  blockVenueTrading: boolean;
  blockLiveMode: boolean;
  reasons: string[];
}

export interface PersistedLiveRecoveryNote {
  notedAtTs: EpochMs;
  recoveryState: RecoveryState;
  decision: RecoveryDecision;
  message: string;
}

export interface PersistedLiveState {
  savedAtTs: EpochMs;
  accountRef: string;
  venue: ExecutionVenue;
  expectedOpenOrders: VenueOrder[];
  expectedOpenPositions: VenuePosition[];
  lastKnownSyncTs?: EpochMs;
  lastControlState?: OperationalControlState;
  healthStatus?: HealthStatus;
  recoveryState?: RecoveryState;
  incidentSummary?: PersistedLiveIncidentSummary;
  lockout?: PersistedLiveLockoutSnapshot;
  recoveryNotes: PersistedLiveRecoveryNote[];
  emergencyHistory: EmergencyCommandExecutionResult[];
}

export class FileLiveStateStore {
  public constructor(private readonly filePath: string) {}

  public async load(): Promise<PersistedLiveState | undefined> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedLiveState>;
      return {
        ...parsed,
        recoveryNotes: parsed.recoveryNotes ?? [],
        emergencyHistory: parsed.emergencyHistory ?? []
      } as PersistedLiveState;
    } catch {
      return undefined;
    }
  }

  public async save(state: PersistedLiveState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  public async appendRecoveryNote(accountRef: string, note: PersistedLiveRecoveryNote): Promise<void> {
    const current = await this.load();
    if (!current || current.accountRef !== accountRef) {
      return;
    }

    current.recoveryNotes = [...current.recoveryNotes, note].slice(-20);
    current.savedAtTs = note.notedAtTs;
    await this.save(current);
  }

  public async appendEmergencyHistory(accountRef: string, items: EmergencyCommandExecutionResult[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const current = await this.load();
    if (!current || current.accountRef !== accountRef) {
      return;
    }

    current.emergencyHistory = [...current.emergencyHistory, ...items].slice(-50);
    current.savedAtTs = Date.now() as EpochMs;
    await this.save(current);
  }

  public static fromEnv(): FileLiveStateStore {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const path = env.WORKER_LIVE_STATE_PATH ?? '.runtime/worker-live-state.json';
    return new FileLiveStateStore(resolve(path));
  }
}
