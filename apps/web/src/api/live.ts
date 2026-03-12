import {
  getLiveHealthRoute,
  getLiveIncidentsRoute,
  getLiveOrdersRoute,
  getLivePositionsRoute,
  getLiveRoute
} from './routes.js';

export async function getLive() {
  return getLiveRoute();
}

export async function getLiveHealth() {
  return getLiveHealthRoute();
}

export async function getLiveOrders() {
  return getLiveOrdersRoute();
}

export async function getLivePositions() {
  return getLivePositionsRoute();
}

export async function getLiveIncidents() {
  return getLiveIncidentsRoute();
}
