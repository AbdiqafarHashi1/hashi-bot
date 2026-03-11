import type { EmergencyCommand } from '@hashi-bot/core';

import { postLiveEmergencyRoute } from '../../../../api/routes.js';

export async function POST(payload: EmergencyCommand) {
  return postLiveEmergencyRoute(payload);
}
