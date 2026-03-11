import type { OperationalGuardDecision } from '@hashi-bot/execution';

export interface OperationalControlView {
  state: OperationalGuardDecision['state'];
  killSwitchState: OperationalGuardDecision['killSwitch']['state'];
  killSwitchReason?: OperationalGuardDecision['killSwitch']['reason'];
  lockout: {
    blockNewOrderPlacement: boolean;
    blockLiveMode: boolean;
    blockedSymbols: string[];
    blockedVenues: string[];
  };
  reasons: string[];
}

export class OperationalControlViewService {
  toView(decision: OperationalGuardDecision): OperationalControlView {
    return {
      state: decision.state,
      killSwitchState: decision.killSwitch.state,
      killSwitchReason: decision.killSwitch.reason,
      lockout: {
        blockNewOrderPlacement: decision.lockoutPolicy.blockNewOrderPlacement,
        blockLiveMode: decision.lockoutPolicy.blockLiveMode,
        blockedSymbols: decision.lockoutPolicy.blockedSymbols,
        blockedVenues: decision.lockoutPolicy.blockedVenues
      },
      reasons: decision.reasons
    };
  }
}
