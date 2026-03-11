import type { EmergencyCommand, EmergencyCommandResult } from '@hashi-bot/core';
import { StartupRecoveryViewService, OperationalPersistenceViewService } from '@hashi-bot/telemetry';
import type { OperationalStateRepository } from '@hashi-bot/storage';

export class LiveOperationsService {
  private readonly persistenceView = new OperationalPersistenceViewService();
  private readonly recoveryView = new StartupRecoveryViewService();

  constructor(private readonly operationalStateRepository: OperationalStateRepository) {}

  async getLiveSummary() {
    const latestState = await this.operationalStateRepository.getLatestState();
    const incidents = await this.operationalStateRepository.listRecentIncidents(20);
    const emergencyActions = await this.operationalStateRepository.listRecentEmergencyActions(20);

    return {
      status: latestState ? 'ok' : 'unavailable',
      mode: latestState?.mode ?? 'unknown',
      latestState,
      incidents,
      emergencyActions,
      persistence: this.persistenceView.toView({
        latestState,
        recentIncidents: incidents,
        recentEmergencyActions: emergencyActions
      }),
      recovery: latestState?.recovery
        ? this.recoveryView.toView({
            decision:
              latestState.recovery.decision === 'resume_automatically'
                ? 'resume_ok'
                : latestState.recovery.decision === 'force_safe_sync_only'
                  ? 'sync_only_no_trading'
                  : latestState.recovery.decision === 'require_manual_review'
                    ? 'manual_review_required'
                    : 'lock_live_mode',
            recovery: latestState.recovery,
            notes: latestState.recoveryNotes ?? [],
            reconciliationDriftRatio: 0
          })
        : null
    };
  }

  async getLiveHealth() {
    const latestState = await this.operationalStateRepository.getLatestState();

    return {
      status: latestState ? 'ok' : 'unavailable',
      healthStatus: latestState?.healthStatus ?? 'unhealthy',
      safetyState: latestState?.safetyState ?? 'locked',
      incidentSeverity: latestState?.incidentSeverity ?? 'critical',
      recovery: latestState?.recovery ?? null
    };
  }

  async getLiveSafety() {
    const latestState = await this.operationalStateRepository.getLatestState();

    return {
      status: latestState ? 'ok' : 'unavailable',
      killSwitch: {
        state: latestState?.lockout.blockLiveMode ? 'engaged' : 'inactive',
        reason: latestState?.recovery?.reason
      },
      lockout: latestState?.lockout ?? {
        blockNewOrderPlacement: true,
        blockLiveMode: true,
        blockedSymbols: [],
        blockedVenues: []
      },
      recovery: latestState?.recovery ?? null,
      recoveryNotes: latestState?.recoveryNotes ?? []
    };
  }

  async getLiveIncidents() {
    const incidents = await this.operationalStateRepository.listRecentIncidents(50);
    const emergencyActions = await this.operationalStateRepository.listRecentEmergencyActions(20);

    return {
      status: incidents.length > 0 || emergencyActions.length > 0 ? 'ok' : 'unavailable',
      incidents,
      emergencyActions
    };
  }

  async postEmergency(command: EmergencyCommand) {
    const result: EmergencyCommandResult = {
      commandId: command.commandId,
      type: command.type,
      status: 'rejected',
      processedAt: new Date().toISOString() as EmergencyCommandResult['processedAt'],
      message: 'Emergency command endpoint is visibility-only in current web architecture; execute from worker/operator channel.',
      errors: ['web_emergency_execution_unavailable']
    };

    return {
      status: 'unavailable',
      accepted: false,
      command,
      result
    };
  }
}
