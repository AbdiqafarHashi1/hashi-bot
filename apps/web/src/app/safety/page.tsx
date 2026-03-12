import { buildSafetyOperationsWorkspaceModel } from '../../components/safety/workspace.js';
import { buildWorkspaceEnvelope, createPagePolishContract } from '../../components/ui/page-polish.js';
import { createWebContainer } from '../../lib/container.js';

const container = createWebContainer();

export async function getSafetyOperationsWorkspacePage() {
  const polish = createPagePolishContract('safety', {
    emptyMessage: 'Safety workspace has no incident or lockout records yet.',
    mobileStackOrder: ['header', 'watchdog-strip', 'lockouts', 'incidents', 'recovery'],
    dangerZonePinnedOnMobile: true,
  });

  return buildWorkspaceEnvelope({
    kind: 'safety_view',
    polish,
    loader: async () => {
      const [safety, health, incidents] = await Promise.all([
        container.liveStatusService.getSafety(),
        container.liveStatusService.getHealth(),
        container.liveStatusService.getIncidents(),
      ]);

      return buildSafetyOperationsWorkspaceModel({
        safety,
        health,
        incidents,
      });
    },
  });
}

export default async function Page() {
  return getSafetyOperationsWorkspacePage();
}
