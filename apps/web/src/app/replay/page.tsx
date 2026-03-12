import { buildReplayWorkstationModel } from '../../components/replay/workstation.js';
import { buildWorkspaceEnvelope, createPagePolishContract } from '../../components/ui/page-polish.js';
import { createWebContainer } from '../../lib/container.js';

const container = createWebContainer();

export async function getReplayWorkstationPage(runId?: string) {
  const polish = createPagePolishContract('replay', {
    emptyMessage: 'No replay runs available yet. Create a replay run to unlock controls and cursor inspection.',
    mobileStackOrder: ['header', 'run-selection', 'controls', 'cursor', 'inspection'],
  });

  return buildWorkspaceEnvelope({
    kind: 'replay_view',
    polish,
    loader: () =>
      buildReplayWorkstationModel({
        replayApiService: container.replayApiService,
        queryService: container.queryService,
        runId,
      }),
  });
}

export default async function Page() {
  return getReplayWorkstationPage();
}
