import { getReplayByIdRoute } from '../../../../api/routes.js';

export function GET(runId: string) {
  return getReplayByIdRoute(runId);
}
