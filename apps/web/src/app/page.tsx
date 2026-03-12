import { buildOverviewControlCenterModel } from '../components/overview/control-center.js';
import { buildWorkspaceEnvelope, createPagePolishContract } from '../components/ui/page-polish.js';
import { createWebContainer } from '../lib/container.js';

const container = createWebContainer();

export async function getOverviewControlCenterPage() {
  const polish = createPagePolishContract('overview', {
    emptyMessage: 'Overview has no live, signal, or run data yet. Start replay or backtest to seed operator context.',
    mobileStackOrder: ['header', 'status-strip', 'summary-cards', 'activity', 'details'],
  });

  return buildWorkspaceEnvelope({
    kind: 'overview_view',
    polish,
    loader: async () => {
      const overviewPage = await container.pagesService.getOverviewPage();

      const [live, health, incidents, orders, positions, safety] = await Promise.all([
        container.liveStatusService.getLiveState(),
        container.liveStatusService.getHealth(),
        container.liveStatusService.getIncidents(),
        container.liveStatusService.getOrders(),
        container.liveStatusService.getPositions(),
        container.liveStatusService.getSafety(),
      ]);

      return buildOverviewControlCenterModel({
        overviewPage,
        queryService: container.queryService,
        instantBacktestService: container.instantBacktestService,
        replayApiService: container.replayApiService,
        live,
        health,
        incidents,
        orders,
        positions,
        safety,
      });
    },
  });
}

export default async function Page() {
  return getOverviewControlCenterPage();
}
