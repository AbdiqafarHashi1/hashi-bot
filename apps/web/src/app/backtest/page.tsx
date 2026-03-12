import { buildBacktestWorkstationModel } from '../../components/backtest/workstation.js';
import { buildWorkspaceEnvelope, createPagePolishContract } from '../../components/ui/page-polish.js';
import { createWebContainer } from '../../lib/container.js';

const container = createWebContainer();

export async function getBacktestWorkstationPage(runId?: string) {
  const polish = createPagePolishContract('backtest', {
    emptyMessage: 'No backtest runs yet. Launch an instant run to populate metrics, charts, and trade summaries.',
    mobileStackOrder: ['header', 'launch', 'run-summary', 'metrics', 'tables'],
  });

  return buildWorkspaceEnvelope({
    kind: 'backtest_view',
    polish,
    loader: () =>
      buildBacktestWorkstationModel({
        instantBacktestService: container.instantBacktestService,
        queryService: container.queryService,
        runId,
      }),
  });
}

export default async function Page() {
  return getBacktestWorkstationPage();
}
