import { buildWorkspaceEnvelope, createPagePolishContract } from '../../components/ui/page-polish.js';
import { createWebContainer } from '../../lib/container.js';

const container = createWebContainer();

export async function getTradesWorkspacePage() {
  const polish = createPagePolishContract('trades', {
    emptyMessage: 'Trade outcome history is empty. Execute replay/backtest runs to generate trade logs.',
    mobileStackOrder: ['header', 'trade-log', 'replay-summary'],
  });

  return buildWorkspaceEnvelope({
    kind: 'trades_view',
    polish,
    loader: () => container.pagesService.getTradesPage(),
  });
}

export default async function Page() {
  return getTradesWorkspacePage();
}
