import { buildLiveOperationsWorkspaceModel } from '../../components/live/workspace.js';
import { buildWorkspaceEnvelope, createPagePolishContract } from '../../components/ui/page-polish.js';
import { createWebContainer } from '../../lib/container.js';

const container = createWebContainer();

export async function getLiveOperationsWorkspacePage() {
  const polish = createPagePolishContract('live', {
    emptyMessage: 'Live workspace has no execution payload yet. Validate venue connectivity and sync status.',
    mobileStackOrder: ['header', 'critical-strip', 'exposure', 'health', 'danger-zone'],
    dangerZonePinnedOnMobile: true,
  });

  return buildWorkspaceEnvelope({
    kind: 'live_view',
    polish,
    loader: async () => {
      const [live, health, orders, positions, incidents, safety] = await Promise.all([
        container.liveStatusService.getLiveState(),
        container.liveStatusService.getHealth(),
        container.liveStatusService.getOrders(),
        container.liveStatusService.getPositions(),
        container.liveStatusService.getIncidents(),
        container.liveStatusService.getSafety(),
      ]);

      return buildLiveOperationsWorkspaceModel({
        live,
        health,
        orders,
        positions,
        incidents,
        safety,
      });
    },
  });
}

export default async function Page() {
  return getLiveOperationsWorkspacePage();
}
