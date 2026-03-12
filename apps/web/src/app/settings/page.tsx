import { buildSettingsWorkspaceModel } from '../../components/settings/workspace.js';
import { buildWorkspaceEnvelope, createPagePolishContract } from '../../components/ui/page-polish.js';
import { createWebContainer } from '../../lib/container.js';

const container = createWebContainer();

export async function getSettingsWorkspacePage() {
  const polish = createPagePolishContract('settings', {
    emptyMessage: 'Settings has no symbol/profile/config payload yet. Verify query service and runtime config sources.',
    mobileStackOrder: ['header', 'profiles', 'watchlists', 'symbols', 'execution', 'safety', 'strategy-risk'],
  });

  return buildWorkspaceEnvelope({
    kind: 'settings_view',
    polish,
    loader: async () => {
      const [live, health, safety] = await Promise.all([
        container.liveStatusService.getLiveState(),
        container.liveStatusService.getHealth(),
        container.liveStatusService.getSafety(),
      ]);

      return buildSettingsWorkspaceModel({
        queryService: container.queryService,
        live,
        health,
        safety,
      });
    },
  });
}

export default async function Page() {
  return getSettingsWorkspacePage();
}
