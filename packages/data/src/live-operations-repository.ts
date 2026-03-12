import type {
  EmergencyCommandResult,
  EpochMs,
  HealthStatus,
  OperationalControlState,
  RecoveryDecision,
  RecoveryState
} from '@hashi-bot/core';

export interface LiveIncidentSummary {
  asOfTs: EpochMs;
  totalOpenIncidents: number;
  criticalIncidentCount: number;
  latestIncidentMessage?: string;
}

export interface LiveLockoutSnapshot {
  asOfTs: EpochMs;
  controlState?: OperationalControlState;
  blockNewOrderPlacement: boolean;
  blockVenueTrading: boolean;
  blockLiveMode: boolean;
  reasons: string[];
}

export interface LiveRecoveryNote {
  notedAtTs: EpochMs;
  recoveryState: RecoveryState;
  decision: RecoveryDecision;
  message: string;
}

export interface PersistedLiveOperationalState {
  savedAtTs: EpochMs;
  accountRef: string;
  venue: string;
  healthStatus?: HealthStatus;
  recoveryState?: RecoveryState;
  lockout?: LiveLockoutSnapshot;
  incidentSummary?: LiveIncidentSummary;
  recoveryNotes: LiveRecoveryNote[];
  emergencyHistory: EmergencyCommandResult[];
}

export interface LiveOperationsRepository {
  get(accountRef: string): PersistedLiveOperationalState | undefined;
  save(state: PersistedLiveOperationalState): void;
  appendRecoveryNote(accountRef: string, note: LiveRecoveryNote): void;
  appendEmergencyHistory(accountRef: string, items: EmergencyCommandResult[]): void;
}

export class InMemoryLiveOperationsRepository implements LiveOperationsRepository {
  private readonly records = new Map<string, PersistedLiveOperationalState>();

  public get(accountRef: string): PersistedLiveOperationalState | undefined {
    const record = this.records.get(accountRef);
    return record ? structuredClone(record) : undefined;
  }

  public save(state: PersistedLiveOperationalState): void {
    this.records.set(state.accountRef, structuredClone(state));
  }

  public appendRecoveryNote(accountRef: string, note: LiveRecoveryNote): void {
    const existing = this.records.get(accountRef);
    if (!existing) {
      return;
    }

    existing.recoveryNotes = [...existing.recoveryNotes, note].slice(-20);
    existing.savedAtTs = note.notedAtTs;
    this.records.set(accountRef, structuredClone(existing));
  }

  public appendEmergencyHistory(accountRef: string, items: EmergencyCommandResult[]): void {
    const existing = this.records.get(accountRef);
    if (!existing || items.length === 0) {
      return;
    }

    existing.emergencyHistory = [...existing.emergencyHistory, ...items].slice(-50);
    existing.savedAtTs = Date.now() as EpochMs;
    this.records.set(accountRef, structuredClone(existing));
  }
}
