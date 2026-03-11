import type { EmergencyCommand } from '@hashi-bot/core';

import {
  getLiveHealthRoute,
  getLiveIncidentsRoute,
  getLiveRoute,
  getLiveSafetyRoute,
  postLiveEmergencyRoute
} from './routes.js';

export async function getLive() {
  return getLiveRoute();
}

export async function getLiveHealth() {
  return getLiveHealthRoute();
}

export async function getLiveIncidents() {
  return getLiveIncidentsRoute();
}

export async function getLiveSafety() {
  return getLiveSafetyRoute();
}

export async function postLiveEmergency(command: EmergencyCommand) {
  return postLiveEmergencyRoute(command);
}
