import type {
  LiveHealthResponse,
  LiveIncidentsResponse,
  LiveOrdersResponse,
  LivePositionsResponse,
  LiveSafetyResponse,
  LiveStatusResponse,
} from '../../services/live-status.service.js';
import {
  createCardContainer,
  createDangerActionDialog,
  createDataTableWrapper,
  createDetailPanel,
  createKpiCard,
  createMetricRow,
  createPageHeader,
  createSectionHeader,
  createTimelineFeed,
} from '../ui/index.js';

export interface LiveOperationsWorkspaceModel {
  kind: 'live_operations_workspace';
  pageHeader: ReturnType<typeof createPageHeader>;
  criticalStatusStrip: {
    status: ReturnType<typeof createCardContainer>;
    sync: ReturnType<typeof createCardContainer>;
    restrictions: ReturnType<typeof createCardContainer>;
  };
  summaryCards: Array<ReturnType<typeof createCardContainer>>;
  metrics: Array<ReturnType<typeof createKpiCard>>;
  executionHealth: {
    sectionHeader: ReturnType<typeof createSectionHeader>;
    healthPanel: ReturnType<typeof createDetailPanel>;
    ordersTable: ReturnType<typeof createDataTableWrapper>;
    positionsTable: ReturnType<typeof createDataTableWrapper>;
    incidentsTimeline: ReturnType<typeof createTimelineFeed>;
  };
  emergencyZone: {
    isolationCard: ReturnType<typeof createCardContainer>;
    guardedActions: Array<{
      key: string;
      label: string;
      endpoint: string;
      method: 'POST';
      dialog: ReturnType<typeof createDangerActionDialog>;
    }>;
  };
  notes: string[];
}

function mapLiveStatus(input: {
  live: LiveStatusResponse;
  health: LiveHealthResponse;
  safety: LiveSafetyResponse;
}): 'healthy' | 'degraded' | 'paused' | 'kill_switched' {
  const controlState = input.safety.safety.controlState ?? input.safety.safety.lockout?.controlState;
  if (controlState === 'kill_switched') {
    return 'kill_switched';
  }

  if (controlState === 'paused' || input.health.health.status === 'stopped' || input.health.health.status === 'idle') {
    return 'paused';
  }

  if (
    input.health.status === 'unavailable'
    || input.live.status === 'unavailable'
    || input.health.health.status === 'incident'
    || input.health.health.status === 'degraded'
    || input.health.health.criticalIncidentCount > 0
  ) {
    return 'degraded';
  }

  return 'healthy';
}

export function buildLiveOperationsWorkspaceModel(input: {
  live: LiveStatusResponse;
  health: LiveHealthResponse;
  orders: LiveOrdersResponse;
  positions: LivePositionsResponse;
  incidents: LiveIncidentsResponse;
  safety: LiveSafetyResponse;
}): LiveOperationsWorkspaceModel {
  const runStatus = mapLiveStatus(input);
  const incidentCount = input.incidents.incidents.length;
  const openOrders = input.orders.orders.length;
  const openPositions = input.positions.positions.length;

  return {
    kind: 'live_operations_workspace',
    pageHeader: createPageHeader({
      title: 'Live Operations Workstation',
      description: 'Real-time execution visibility, safety state inspection, and guarded emergency controls for live/paper operations.',
      statuses: [input.live.mode === 'live' ? 'live' : 'paper', runStatus],
      actions: [
        { key: 'to-safety', label: 'Open Safety', actionId: 'nav:safety', intent: 'danger' },
        { key: 'to-runs', label: 'Open Runs', actionId: 'nav:runs' },
        { key: 'to-overview', label: 'Open Overview', actionId: 'nav:overview' },
      ],
    }),
    criticalStatusStrip: {
      status: createCardContainer(
        [
          `Engine status: ${input.health.health.status}`,
          `Mode: ${input.live.mode}`,
          `Safety state: ${input.safety.safety.healthStatus}`,
          `Control state: ${input.safety.safety.controlState ?? input.safety.safety.lockout?.controlState ?? 'unknown'}`,
        ],
        'Critical Status',
        runStatus === 'kill_switched' || input.live.mode === 'live' ? 'danger' : 'elevated'
      ),
      sync: createCardContainer(
        [
          `Latest sync (live): ${input.live.latestSyncTs ?? 'n/a'}`,
          `Latest sync (health): ${input.health.health.lastSyncTs ?? 'n/a'}`,
          `Last heartbeat: ${input.health.health.lastHeartbeatTs ?? 'n/a'}`,
          `Watch scope symbols: ${input.live.state.watchedSymbols.join(', ') || 'none'}`,
        ],
        'Sync + Heartbeat',
        'default'
      ),
      restrictions: createCardContainer(
        [
          `Block new order placement: ${String(input.safety.safety.lockout?.blockNewOrderPlacement ?? false)}`,
          `Block venue trading: ${String(input.safety.safety.lockout?.blockVenueTrading ?? false)}`,
          `Block live mode: ${String(input.safety.safety.lockout?.blockLiveMode ?? false)}`,
          `Recovery state: ${input.safety.safety.recoveryState ?? 'n/a'}`,
        ],
        'Restrictions + Recovery',
        runStatus === 'healthy' ? 'default' : 'danger'
      ),
    },
    summaryCards: [
      createCardContainer(
        [
          `Venue: ${input.live.venue}`,
          `Account: ${input.live.accountRef}`,
          `Adapter ready: ${String(input.live.adapterReady)}`,
          `Data source status: ${input.live.status}`,
        ],
        'Venue + Account',
        input.live.mode === 'live' ? 'danger' : 'elevated'
      ),
      createCardContainer(
        [
          `Open orders: ${openOrders}`,
          `Open positions: ${openPositions}`,
          `Recent incidents: ${incidentCount}`,
          `Critical incidents: ${input.health.health.criticalIncidentCount}`,
        ],
        'Exposure Snapshot',
        'elevated'
      ),
      createCardContainer(
        [
          `Safety source: ${input.safety.safety.source}`,
          `Incident summary (open): ${input.safety.safety.incidentSummary?.totalOpenIncidents ?? input.health.health.openIncidentCount}`,
          `Latest incident note: ${input.safety.safety.incidentSummary?.latestIncidentMessage ?? 'n/a'}`,
          `Recovery notes: ${input.safety.safety.recoveryNotes?.length ?? 0}`,
        ],
        'Safety Snapshot',
        runStatus === 'healthy' ? 'default' : 'danger'
      ),
    ],
    metrics: [
      createKpiCard('Live Engine', input.health.health.status, undefined, runStatus),
      createKpiCard('Open Orders', String(openOrders), undefined, openOrders > 0 ? 'degraded' : 'healthy'),
      createKpiCard('Open Positions', String(openPositions), undefined, openPositions > 0 ? 'live' : 'healthy'),
      createKpiCard('Incidents', String(incidentCount), undefined, incidentCount > 0 ? 'degraded' : 'healthy'),
      createKpiCard(
        'Kill-Switch',
        input.safety.safety.controlState === 'kill_switched' ? 'active' : 'not active',
        undefined,
        input.safety.safety.controlState === 'kill_switched' ? 'kill_switched' : 'healthy'
      ),
    ],
    executionHealth: {
      sectionHeader: createSectionHeader(
        'Execution Health and State Inspection',
        'Orders, positions, sync telemetry, and incidents for operator triage.',
        'All values are sourced from live APIs and runtime safety snapshots when available.'
      ),
      healthPanel: createDetailPanel('Engine + Recovery Details', [
        {
          title: 'Engine status',
          rows: [
            createMetricRow('Mode', input.live.mode, input.live.mode === 'live' ? 'live' : 'paper'),
            createMetricRow('Execution status', input.health.health.status, runStatus),
            createMetricRow('Health status', input.safety.safety.healthStatus, runStatus),
            createMetricRow('Control state', input.safety.safety.controlState ?? 'n/a', runStatus),
            createMetricRow('Recovery state', input.safety.safety.recoveryState ?? 'n/a', runStatus),
          ],
        },
        {
          title: 'Operational pressure',
          rows: [
            createMetricRow('Open incident count', String(input.health.health.openIncidentCount), input.health.health.openIncidentCount > 0 ? 'degraded' : 'healthy'),
            createMetricRow('Critical incidents', String(input.health.health.criticalIncidentCount), input.health.health.criticalIncidentCount > 0 ? 'kill_switched' : 'healthy'),
            createMetricRow('Latest sync', String(input.live.latestSyncTs ?? input.health.health.lastSyncTs ?? 'n/a')),
            createMetricRow('Last heartbeat', String(input.health.health.lastHeartbeatTs ?? 'n/a')),
          ],
        },
      ]),
      ordersTable: createDataTableWrapper('Open Orders', [
        { key: 'orderId', label: 'Order ID', width: '180px' },
        { key: 'symbolCode', label: 'Symbol', width: '120px' },
        { key: 'side', label: 'Side', width: '100px' },
        { key: 'quantity', label: 'Qty', width: '120px' },
        { key: 'status', label: 'Status', width: '140px' },
      ], undefined, { density: 'compact', stickyHeader: true, stripedRows: true, horizontalScroll: 'auto' }),
      positionsTable: createDataTableWrapper('Open Positions', [
        { key: 'symbolCode', label: 'Symbol', width: '120px' },
        { key: 'side', label: 'Side', width: '100px' },
        { key: 'quantity', label: 'Qty', width: '120px' },
        { key: 'entryPrice', label: 'Entry', width: '120px' },
        { key: 'unrealizedPnl', label: 'Unrealized PnL', width: '140px' },
      ], undefined, { density: 'compact', stickyHeader: true, stripedRows: true, horizontalScroll: 'auto' }),
      incidentsTimeline: createTimelineFeed(
        'Recent Incidents',
        input.incidents.incidents.map((incident) => ({
          timestamp: String(incident.raisedAtTs),
          label: `${incident.code} (${incident.severity})`,
          description: incident.message,
          status: incident.severity === 'critical' ? 'kill_switched' : 'degraded',
        }))
      ),
    },
    emergencyZone: {
      isolationCard: createCardContainer(
        [
          'Danger zone: use only for active incident response.',
          'Actions are API visibility controls in web runtime and do not bypass worker authority.',
          `Current control state: ${input.safety.safety.controlState ?? 'unknown'}`,
          `Emergency history entries: ${input.safety.safety.emergencyHistory?.length ?? 0}`,
        ],
        'Guarded Emergency Actions',
        'danger'
      ),
      guardedActions: [
        {
          key: 'cancel-all',
          label: 'Cancel All Orders',
          endpoint: '/api/live/emergency',
          method: 'POST',
          dialog: createDangerActionDialog(
            'Cancel all venue orders?',
            'Use only when order state is unsafe. Confirm after checking lockout and incident timeline.',
            'Confirm Cancel All Orders',
            'Back Out',
            'CANCEL ALL'
          ),
        },
        {
          key: 'flatten',
          label: 'Flatten Positions',
          endpoint: '/api/live/emergency',
          method: 'POST',
          dialog: createDangerActionDialog(
            'Flatten all positions?',
            'This is intended for emergency de-risking. Confirm after reviewing current exposure and sync freshness.',
            'Confirm Flatten',
            'Back Out',
            'FLATTEN'
          ),
        },
        {
          key: 'disable-live',
          label: 'Disable Live Mode',
          endpoint: '/api/live/emergency',
          method: 'POST',
          dialog: createDangerActionDialog(
            'Disable live mode?',
            'This should be used when risk controls require immediate live lockout.',
            'Confirm Disable Live',
            'Back Out',
            'DISABLE LIVE'
          ),
        },
      ],
    },
    notes: [
      'Workspace values are sourced from LiveStatusService endpoints (state/health/orders/positions/incidents/safety).',
      'Healthy/degraded/paused/kill-switched highlighting is derived from real controlState + health status, not decorative flags.',
      'Emergency actions remain intentionally guarded visibility controls in this web runtime architecture.',
    ],
  };
}
