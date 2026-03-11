import type { StartupRecoveryOutcome } from '@hashi-bot/execution';

export interface StartupRecoveryView {
  decision: StartupRecoveryOutcome['decision'];
  recoveryState: StartupRecoveryOutcome['recovery']['state'];
  recoveryDecision: StartupRecoveryOutcome['recovery']['decision'];
  duplicateOrderRiskDetected: boolean;
  reconciliationDriftRatio: number;
  notes: string[];
}

export class StartupRecoveryViewService {
  toView(outcome: StartupRecoveryOutcome): StartupRecoveryView {
    return {
      decision: outcome.decision,
      recoveryState: outcome.recovery.state,
      recoveryDecision: outcome.recovery.decision,
      duplicateOrderRiskDetected: outcome.recovery.duplicateOrderRiskDetected,
      reconciliationDriftRatio: outcome.reconciliationDriftRatio,
      notes: outcome.notes
    };
  }
}
