import type { ProfileCode, SymbolCode } from '@hashi-bot/core';

import { createWorkerContainer, type WorkerContainer } from './lib/container.js';

export interface WorkerBootstrapOptions {
  mode: string;
  accountRef: string;
  staleAfterMs?: number;
  watchlistSymbolCodes?: SymbolCode[];
  profileCode?: ProfileCode;
  env: Record<string, string | undefined>;
}


async function initializeExecutionAdapterIfSupported(container: WorkerContainer, mode: string): Promise<void> {
  const candidate = container.executionAdapter as unknown as { initialize?: () => Promise<void> };
  if (!candidate.initialize) {
    return;
  }

  try {
    await candidate.initialize();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_adapter_initialize_error';
    if (mode === 'live' || mode === 'paper') {
      throw new Error(`Execution adapter initialization failed for ${container.executionAdapter.venue}: ${message}`);
    }
    console.warn(`[worker] execution adapter initialization skipped in mode=${mode}: ${message}`);
  }
}

export interface WorkerBootstrapResult {
  container: WorkerContainer;
  startupRecovery?: Awaited<ReturnType<WorkerContainer['restartRecoveryService']['run']>>;
}

export async function bootstrapWorker(options: WorkerBootstrapOptions): Promise<WorkerBootstrapResult> {
  const container = createWorkerContainer();
  await initializeExecutionAdapterIfSupported(container, options.mode);

  if (options.mode === 'live' || options.mode === 'paper') {
    const safetyRails = await container.liveSafetyRailsService.evaluate({
      workerMode: options.mode,
      accountRef: options.accountRef,
      env: options.env
    });

    for (const warning of safetyRails.warnings) {
      console.warn(`[worker] safety warning: ${warning}`);
    }

    if (!safetyRails.allowed) {
      throw new Error(`Startup blocked by safety rails: ${safetyRails.reasons.join(', ')}`);
    }

    const startupRecovery = await container.restartRecoveryService.run({
      accountRef: options.accountRef,
      staleAfterMs: options.staleAfterMs
    });

    try {
      await container.liveStateStore.appendRecoveryNote(options.accountRef, {
        notedAtTs: startupRecovery.decision.reviewedAtTs,
        recoveryState: startupRecovery.recoveryState,
        decision: startupRecovery.decision,
        message: `startup_recovery:${startupRecovery.decision.outcome}`
      });

      container.liveOperationsRepository.save({
        savedAtTs: startupRecovery.decision.reviewedAtTs,
        accountRef: options.accountRef,
        venue: container.executionAdapter.venue,
        healthStatus: undefined,
        recoveryState: startupRecovery.recoveryState,
        recoveryNotes: [
          {
            notedAtTs: startupRecovery.decision.reviewedAtTs,
            recoveryState: startupRecovery.recoveryState,
            decision: startupRecovery.decision,
            message: `startup_recovery:${startupRecovery.decision.outcome}`
          }
        ],
        emergencyHistory: [],
        incidentSummary: {
          asOfTs: startupRecovery.decision.reviewedAtTs,
          totalOpenIncidents: startupRecovery.incidents.length,
          criticalIncidentCount: startupRecovery.incidents.filter((incident) => incident.severity === 'critical').length,
          latestIncidentMessage: startupRecovery.incidents.at(-1)?.message
        },
        lockout: {
          asOfTs: startupRecovery.decision.reviewedAtTs,
          controlState: undefined,
          blockNewOrderPlacement: startupRecovery.decision.outcome !== 'resume_ok',
          blockVenueTrading: startupRecovery.decision.outcome !== 'resume_ok',
          blockLiveMode: startupRecovery.decision.outcome === 'lock_live_mode',
          reasons: startupRecovery.decision.rationale
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_bootstrap_persistence_error';
      console.warn(`[worker] startup persistence warning: ${message}`);
    }

    console.log(
      `[worker] startup recovery mode=${options.mode} outcome=${startupRecovery.decision.outcome} state=${startupRecovery.recoveryState} mismatches=${startupRecovery.reconciliation.entries.filter((e) => e.code !== 'in_sync').length} duplicateRisk=${startupRecovery.duplicateOrderRisk}`
    );

    return { container, startupRecovery };
  }

  console.log('[worker] bootstrap complete (evaluation + backtest + replay + live execution services initialized)');
  return { container };
}
