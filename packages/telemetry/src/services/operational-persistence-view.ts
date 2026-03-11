import type { PersistedEmergencyAction, PersistedIncidentSummary, PersistedOperationalState } from '@hashi-bot/storage';

export interface OperationalPersistenceView {
  latestState?: PersistedOperationalState;
  recentIncidents: PersistedIncidentSummary[];
  recentEmergencyActions: PersistedEmergencyAction[];
  totals: {
    incidents: number;
    emergencies: number;
  };
}

export class OperationalPersistenceViewService {
  toView(input: {
    latestState?: PersistedOperationalState;
    recentIncidents: PersistedIncidentSummary[];
    recentEmergencyActions: PersistedEmergencyAction[];
  }): OperationalPersistenceView {
    return {
      latestState: input.latestState,
      recentIncidents: input.recentIncidents,
      recentEmergencyActions: input.recentEmergencyActions,
      totals: {
        incidents: input.recentIncidents.length,
        emergencies: input.recentEmergencyActions.length
      }
    };
  }
}
