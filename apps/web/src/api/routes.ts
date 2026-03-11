import { createWebContainer } from '../lib/container.js';

const { queryService } = createWebContainer();

export function getHealthRoute() {
  return queryService.getHealth();
}

export function getSymbolsRoute() {
  return queryService.getSymbols();
}

export function getDatasetsRoute() {
  return queryService.getDatasets();
}

export function getConfigRoute() {
  return queryService.getConfig();
}

export function getSnapshotsRoute() {
  return queryService.getSnapshots();
}

export function getRegimeRoute() {
  return queryService.getRegimes();
}

export function getSignalsRoute() {
  return queryService.getSignals();
}
