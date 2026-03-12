import type { EmergencyCommandType } from '@hashi-bot/core';

import { postLiveEmergencyRoute } from '../../../../api/routes.js';

export async function POST(request: { json?: () => Promise<{ command?: EmergencyCommandType }> }) {
  const payload = request.json ? await request.json() : {};
  return postLiveEmergencyRoute(payload ?? {});
}
