import type { LiveHealthResponse, LiveIncidentsResponse, LiveSafetyResponse } from '../../services/live-status.service.js';
import {
  createCardContainer,
  createDataTableWrapper,
  createDetailPanel,
  createMetricRow,
  createPageHeader,
  createSectionHeader,
  createTimelineFeed,
} from '../ui/index.js';

export interface SafetyOperationsWorkspaceModel {
  kind: 'safety_operations_workspace';
  pageHeader: ReturnType<typeof createPageHeader>;
  visibilityStrip: {
    watchdogCard: ReturnType<typeof createCardContainer>;
    lockoutCard: ReturnType<typeof createCardContainer>;
    guidanceCard: ReturnType<typeof createCardContainer>;
  };
  safetyInspection: {
    sectionHeader: ReturnType<typeof createSectionHeader>;
    restrictionsPanel: ReturnType<typeof createDetailPanel>;
    incidentsTimeline: ReturnType<typeof createTimelineFeed>;
    recoveryTimeline: ReturnType<typeof createTimelineFeed>;
    emergencyHistoryTable: ReturnType<typeof createDataTableWrapper>;
  };
  notes: string[];
}

function statusTone(safety: LiveSafetyResponse, health: LiveHealthResponse): 'healthy' | 'degraded' | 'paused' | 'kill_switched' {
  const controlState = safety.safety.controlState ?? safety.safety.lockout?.controlState;
  if (controlState === 'kill_switched') {
    return 'kill_switched';
  }
  if (controlState === 'paused') {
    return 'paused';
  }
  if (health.status === 'unavailable' || health.health.criticalIncidentCount > 0 || health.health.status === 'incident') {
    return 'degraded';
  }
  return 'healthy';
}

function nextActionGuidance(input: { safety: LiveSafetyResponse; health: LiveHealthResponse; incidents: LiveIncidentsResponse }): string[] {
  const controlState = input.safety.safety.controlState ?? input.safety.safety.lockout?.controlState;
  const guidance: string[] = [];

  if (controlState === 'kill_switched') {
    guidance.push('Kill-switch is active: keep live mode disabled and validate recovery notes before any resume attempt.');
  }
  if (input.safety.safety.lockout?.blockLiveMode) {
    guidance.push('Live mode is currently blocked: resolve lockout reasons and confirm watchdog stability.');
  }
  if ((input.safety.safety.recoveryNotes?.length ?? 0) === 0) {
    guidance.push('No recovery notes recorded yet: add an operator note after triage for auditability.');
  }
  if (input.incidents.incidents.length > 0) {
    guidance.push('Review latest incidents and classify severity before unpausing trading controls.');
  }
  if (guidance.length === 0) {
    guidance.push('Safety appears healthy: continue routine monitoring and keep emergency paths validated.');
  }

  return guidance;
}

export function buildSafetyOperationsWorkspaceModel(input: {
  safety: LiveSafetyResponse;
  health: LiveHealthResponse;
  incidents: LiveIncidentsResponse;
}): SafetyOperationsWorkspaceModel {
  const tone = statusTone(input.safety, input.health);
  const guidance = nextActionGuidance(input);

  return {
    kind: 'safety_operations_workspace',
    pageHeader: createPageHeader({
      title: 'Safety Operations Workspace',
      description: 'Dedicated safety inspection for watchdog state, incidents, lockouts, recovery notes, and emergency history.',
      statuses: [tone, input.safety.mode === 'live' ? 'live' : 'paper'],
      actions: [
        { key: 'to-live', label: 'Open Live', actionId: 'nav:live', intent: 'danger' },
        { key: 'to-overview', label: 'Open Overview', actionId: 'nav:overview' },
      ],
    }),
    visibilityStrip: {
      watchdogCard: createCardContainer(
        [
          `Health status: ${input.safety.safety.healthStatus}`,
          `Engine status: ${input.health.health.status}`,
          `Open incidents: ${input.health.health.openIncidentCount}`,
          `Critical incidents: ${input.health.health.criticalIncidentCount}`,
        ],
        'Watchdog + Health',
        tone === 'healthy' ? 'elevated' : 'danger'
      ),
      lockoutCard: createCardContainer(
        [
          `Control state: ${input.safety.safety.controlState ?? input.safety.safety.lockout?.controlState ?? 'unknown'}`,
          `Block new order placement: ${String(input.safety.safety.lockout?.blockNewOrderPlacement ?? false)}`,
          `Block venue trading: ${String(input.safety.safety.lockout?.blockVenueTrading ?? false)}`,
          `Block live mode: ${String(input.safety.safety.lockout?.blockLiveMode ?? false)}`,
        ],
        'Lockout State',
        input.safety.safety.lockout?.blockVenueTrading || input.safety.safety.lockout?.blockLiveMode ? 'danger' : 'default'
      ),
      guidanceCard: createCardContainer(
        guidance,
        'Next Action Guidance',
        tone === 'healthy' ? 'default' : 'elevated'
      ),
    },
    safetyInspection: {
      sectionHeader: createSectionHeader(
        'Safety Audit Trail',
        'Inspect restrictions, incident chronology, recovery notes, and emergency command history.',
        'This page isolates safety state from the rest of the console for focused incident response.'
      ),
      restrictionsPanel: createDetailPanel('Restrictions + Recovery Snapshot', [
        {
          title: 'Restrictions',
          rows: [
            createMetricRow('Control state', input.safety.safety.controlState ?? 'n/a', tone),
            createMetricRow('Recovery state', input.safety.safety.recoveryState ?? 'n/a', tone),
            createMetricRow('Lockout reason count', String(input.safety.safety.lockout?.reasons?.length ?? 0), tone),
            createMetricRow('Safety source', input.safety.safety.source),
          ],
        },
        {
          title: 'Runtime safety freshness',
          rows: [
            createMetricRow('Last updated', String(input.safety.safety.lastUpdatedTs ?? 'n/a')),
            createMetricRow('Incident summary timestamp', String(input.safety.safety.incidentSummary?.asOfTs ?? 'n/a')),
            createMetricRow('Emergency history entries', String(input.safety.safety.emergencyHistory?.length ?? 0)),
            createMetricRow('Recovery notes entries', String(input.safety.safety.recoveryNotes?.length ?? 0)),
          ],
        },
      ]),
      incidentsTimeline: createTimelineFeed(
        'Incident Feed',
        input.incidents.incidents.map((incident) => ({
          timestamp: String(incident.raisedAtTs),
          label: `${incident.code} (${incident.severity})`,
          description: incident.message,
          status: incident.severity === 'critical' ? 'kill_switched' : 'degraded',
        }))
      ),
      recoveryTimeline: createTimelineFeed(
        'Recovery Notes',
        (input.safety.safety.recoveryNotes ?? []).map((note) => ({
          timestamp: String(note?.notedAtTs ?? 0),
          label: note?.recoveryState ?? 'recovery_note',
          description: `${note?.message ?? 'No message'}${note?.decision?.outcome ? ` | decision=${note.decision.outcome}` : ''}`,
          status: note?.recoveryState === 'blocked' ? 'kill_switched' : note?.recoveryState === 'required' ? 'degraded' : 'healthy',
        }))
      ),
      emergencyHistoryTable: createDataTableWrapper('Emergency Action History', [
        { key: 'commandId', label: 'Command ID', width: '180px' },
        { key: 'command', label: 'Command', width: '140px' },
        { key: 'accepted', label: 'Accepted', width: '100px' },
        { key: 'completed', label: 'Completed', width: '100px' },
        { key: 'errorCode', label: 'Error', width: '140px' },
        { key: 'receivedAtTs', label: 'Received', width: '140px' },
      ]),
    },
    notes: [
      'Safety page uses dedicated LiveStatusService safety/health/incidents responses only; no synthetic controls are introduced.',
      'Lockout and control-state details are surfaced independently from Live page to improve operator focus during incident triage.',
      'Next-action guidance is deterministic from current restrictions/incidents/recovery context.',
    ],
  };
}
