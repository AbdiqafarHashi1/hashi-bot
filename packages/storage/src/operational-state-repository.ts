import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
  EmergencyCommandResult,
  ExecutionVenue,
  HealthStatus,
  IncidentSeverity,
  IsoTimestamp,
  RecoverySnapshot,
  SafetyState
} from '@hashi-bot/core';

export interface PersistedOperationalState {
  observedAt: IsoTimestamp;
  mode: 'live' | 'paper' | 'replay' | 'backtest';
  venue: ExecutionVenue;
  safetyState: SafetyState;
  healthStatus: HealthStatus;
  incidentSeverity: IncidentSeverity;
  lockout: {
    blockNewOrderPlacement: boolean;
    blockLiveMode: boolean;
    blockedSymbols: string[];
    blockedVenues: ExecutionVenue[];
  };
  recovery?: RecoverySnapshot;
  recoveryNotes?: string[];
}

export interface PersistedIncidentSummary {
  observedAt: IsoTimestamp;
  severity: IncidentSeverity;
  source: 'watchdog' | 'recovery' | 'emergency' | 'safety_rail';
  message: string;
}

export interface PersistedEmergencyAction {
  recordedAt: IsoTimestamp;
  result: EmergencyCommandResult;
}

export interface OperationalStateRepository {
  saveState(state: PersistedOperationalState): Promise<void>;
  getLatestState(): Promise<PersistedOperationalState | undefined>;
  appendIncident(incident: PersistedIncidentSummary): Promise<void>;
  listRecentIncidents(limit?: number): Promise<PersistedIncidentSummary[]>;
  appendEmergencyAction(action: PersistedEmergencyAction): Promise<void>;
  listRecentEmergencyActions(limit?: number): Promise<PersistedEmergencyAction[]>;
}

interface OperationalStateStore {
  latestState?: PersistedOperationalState;
  incidents: PersistedIncidentSummary[];
  emergencyActions: PersistedEmergencyAction[];
}

const DEFAULT_STORE: OperationalStateStore = {
  incidents: [],
  emergencyActions: []
};

export class JsonOperationalStateRepository implements OperationalStateRepository {
  constructor(private readonly filePath: string = '.hashi/operational-state.json') {}

  async saveState(state: PersistedOperationalState): Promise<void> {
    const current = await this.readStore();
    current.latestState = state;
    await this.writeStore(current);
  }

  async getLatestState(): Promise<PersistedOperationalState | undefined> {
    const current = await this.readStore();
    return current.latestState;
  }

  async appendIncident(incident: PersistedIncidentSummary): Promise<void> {
    const current = await this.readStore();
    current.incidents = [...current.incidents, incident].slice(-50);
    await this.writeStore(current);
  }

  async listRecentIncidents(limit = 20): Promise<PersistedIncidentSummary[]> {
    const current = await this.readStore();
    return current.incidents.slice(-limit).reverse();
  }

  async appendEmergencyAction(action: PersistedEmergencyAction): Promise<void> {
    const current = await this.readStore();
    current.emergencyActions = [...current.emergencyActions, action].slice(-50);
    await this.writeStore(current);
  }

  async listRecentEmergencyActions(limit = 20): Promise<PersistedEmergencyAction[]> {
    const current = await this.readStore();
    return current.emergencyActions.slice(-limit).reverse();
  }

  private async readStore(): Promise<OperationalStateStore> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as OperationalStateStore;
      return {
        latestState: parsed.latestState,
        incidents: parsed.incidents ?? [],
        emergencyActions: parsed.emergencyActions ?? []
      };
    } catch {
      return { ...DEFAULT_STORE, incidents: [], emergencyActions: [] };
    }
  }

  private async writeStore(store: OperationalStateStore): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }
}
