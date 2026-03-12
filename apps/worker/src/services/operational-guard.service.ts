import type { EmergencyCommand, EpochMs, RecoveryDecisionOutcome } from '@hashi-bot/core';

export type StartupRecoveryOutcome = RecoveryDecisionOutcome | undefined;

interface BuildRecoveryEmergencyCommandsParams {
  outcome: StartupRecoveryOutcome;
  nowTs: EpochMs;
  issuedBy: string;
}

export function buildRecoveryEmergencyCommands(params: BuildRecoveryEmergencyCommandsParams): EmergencyCommand[] {
  const { outcome, nowTs, issuedBy } = params;

  if (!outcome || outcome === 'resume_ok') {
    return [];
  }

  const commandBase = {
    commandId: `startup_${issuedBy}_${nowTs}`,
    issuedAtTs: nowTs,
    issuedBy,
    reason: `startup_recovery_outcome:${outcome}`
  };

  if (outcome === 'sync_only_no_trading') {
    return [{ ...commandBase, command: 'pause_venue' }];
  }

  return [{ ...commandBase, command: 'disable_live_mode' }];
}

export function deriveOperatingModeLabel(params: {
  startupOutcome: StartupRecoveryOutcome;
  controlState: string;
  healthStatus: string;
}): string {
  if (params.startupOutcome && params.startupOutcome !== 'resume_ok') {
    return `recovery_guarded:${params.startupOutcome}`;
  }

  if (params.controlState !== 'normal') {
    return `control:${params.controlState}`;
  }

  if (params.healthStatus !== 'healthy') {
    return `health:${params.healthStatus}`;
  }

  return 'normal';
}
