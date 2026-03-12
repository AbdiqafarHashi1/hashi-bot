import { buildWorkspaceEnvelope, createPagePolishContract } from '../../components/ui/page-polish.js';
import { createWebContainer } from '../../lib/container.js';

const container = createWebContainer();

export async function getRunsWorkspacePage() {
  const polish = createPagePolishContract('runs', {
    emptyMessage: 'No replay/backtest runs found yet. Launch an experiment to populate run history.',
    mobileStackOrder: ['header', 'replay-runs', 'backtest-runs'],
  });

  return buildWorkspaceEnvelope({
    kind: 'runs_view',
    polish,
    loader: () => container.pagesService.getRunsPage(),
  });
}

export default async function Page() {
  return getRunsWorkspacePage();
}
