import type { BotMode, EmergencyCommand, EpochMs, ProfileCode, SymbolCode } from '@hashi-bot/core';

import type { WorkerContainer } from '../lib/container.js';
import { deriveOperatingModeLabel } from '../services/operational-guard.service.js';

export interface LiveLoopOptions {
  mode: Extract<BotMode, 'paper' | 'live'>;
  accountRef: string;
  profileCode: ProfileCode;
  watchlistSymbolCodes?: SymbolCode[];
  rankingLimit?: number;
  staleAfterMs?: number;
  maxCycles?: number;
  cycleDelayMs?: number;
  startupRecovery?: Awaited<ReturnType<WorkerContainer['restartRecoveryService']['run']>>;
  startupEmergencyCommands?: EmergencyCommand[];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runLiveLoop(container: WorkerContainer, options: LiveLoopOptions): Promise<void> {
  const maxCycles = options.maxCycles ?? 1;
  const cycleDelayMs = options.cycleDelayMs ?? 0;

  const startupOutcome = options.startupRecovery?.decision.outcome;

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const nowTs = Date.now() as EpochMs;
    const emergencyCommands = cycle === 1 ? options.startupEmergencyCommands ?? [] : [];

    const result = await container.liveExecutionService.runCycle({
      accountRef: options.accountRef,
      profileCode: options.profileCode,
      watchlistSymbolCodes: options.watchlistSymbolCodes,
      rankingLimit: options.rankingLimit,
      staleAfterMs: options.staleAfterMs,
      emergencyCommands
    });

    const mismatchCount = result.reconciliation.entries.filter((entry) => entry.code !== 'in_sync').length;
    const criticalIncidentCount = result.incidents.filter((incident) => incident.severity === 'critical').length;
    const existingState = await container.liveStateStore.load();

    await container.liveStateStore.save({
      savedAtTs: nowTs,
      accountRef: options.accountRef,
      venue: container.executionAdapter.venue,
      expectedOpenOrders: result.syncSnapshot.openOrders,
      expectedOpenPositions: result.syncSnapshot.openPositions,
      lastKnownSyncTs: result.syncSnapshot.fetchedAtTs,
      lastControlState: result.controlDecision.controlState,
      healthStatus: result.healthEvaluation.healthStatus,
      recoveryState: options.startupRecovery?.recoveryState,
      incidentSummary: {
        asOfTs: nowTs,
        totalOpenIncidents: result.incidents.length,
        criticalIncidentCount,
        latestIncidentMessage: result.incidents.at(-1)?.message
      },
      lockout: {
        asOfTs: nowTs,
        controlState: result.controlDecision.controlState,
        blockNewOrderPlacement: result.controlDecision.lockout.blockNewOrderPlacement,
        blockVenueTrading: result.controlDecision.lockout.blockVenueTrading,
        blockLiveMode: result.controlDecision.lockout.blockLiveMode,
        reasons: result.controlDecision.lockout.reasons
      },
      recoveryNotes: existingState?.recoveryNotes ?? [],
      emergencyHistory: existingState?.emergencyHistory ?? []
    });

    await container.liveStateStore.appendEmergencyHistory(options.accountRef, result.emergencyCommandResults);

    container.liveOperationsRepository.save({
      savedAtTs: nowTs,
      accountRef: options.accountRef,
      venue: container.executionAdapter.venue,
      healthStatus: result.healthEvaluation.healthStatus,
      recoveryState: options.startupRecovery?.recoveryState,
      recoveryNotes: existingState?.recoveryNotes ?? [],
      emergencyHistory: [...(existingState?.emergencyHistory ?? []), ...result.emergencyCommandResults].slice(-50),
      incidentSummary: {
        asOfTs: nowTs,
        totalOpenIncidents: result.incidents.length,
        criticalIncidentCount,
        latestIncidentMessage: result.incidents.at(-1)?.message
      },
      lockout: {
        asOfTs: nowTs,
        controlState: result.controlDecision.controlState,
        blockNewOrderPlacement: result.controlDecision.lockout.blockNewOrderPlacement,
        blockVenueTrading: result.controlDecision.lockout.blockVenueTrading,
        blockLiveMode: result.controlDecision.lockout.blockLiveMode,
        reasons: result.controlDecision.lockout.reasons
      }
    });

    const operatingMode = deriveOperatingModeLabel({
      startupOutcome,
      controlState: result.controlDecision.controlState,
      healthStatus: result.healthEvaluation.healthStatus
    });

    console.log(
      `[worker:live] mode=${options.mode} cycle=${cycle}/${maxCycles} operating=${operatingMode} venue=${container.executionAdapter.venue} symbols=${result.evaluatedSymbols.length} signals=${result.signalsEvaluated} placed=${result.ordersPlaced} skipped=${result.ordersSkipped} failed=${result.ordersFailed} incidents=${result.incidents.length} mismatches=${mismatchCount} watchdog=${result.watchdog.overallStatus} health=${result.healthEvaluation.healthStatus} action=${result.healthEvaluation.recommendedAction} control=${result.controlDecision.controlState} blockedOrders=${result.controlDecision.lockout.blockNewOrderPlacement} emergencyResults=${result.emergencyCommandResults.length} startupRecovery=${options.startupRecovery?.decision.outcome ?? 'none'}`
    );

    if (result.controlDecision.controlState === 'kill_switched' || result.controlDecision.controlState === 'locked_pending_review') {
      console.warn(`[worker:live] halting loop due to control_state=${result.controlDecision.controlState}`);
      break;
    }

    if (cycle < maxCycles && cycleDelayMs > 0) {
      await wait(cycleDelayMs);
    }
  }
}
