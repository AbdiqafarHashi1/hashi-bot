import { buildWorkspaceEnvelope, createPagePolishContract } from '../../components/ui/page-polish.js';
import { createWebContainer } from '../../lib/container.js';

const container = createWebContainer();

export async function getSignalsWorkspacePage() {
  const polish = createPagePolishContract('signals', {
    emptyMessage: 'No qualified signals are available yet. Run strategy evaluation through datasets first.',
    mobileStackOrder: ['header', 'qualified-signals', 'coverage', 'notes'],
  });

  return buildWorkspaceEnvelope({
    kind: 'signals_view',
    polish,
    loader: () => container.pagesService.getSignalsPage(),
  });
}

export default async function Page() {
  return getSignalsWorkspacePage();
}
