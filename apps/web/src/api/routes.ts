import type { InstantBacktestRequest, ReplayControlAction } from '@hashi-bot/backtest';
import type { EmergencyCommand, ProfileCode, SymbolCode, Timeframe } from '@hashi-bot/core';

import { createWebContainer } from '../lib/container.js';

const { queryService, instantBacktestService, replayApiService, liveOperationsService } = createWebContainer();

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

export function getBacktestsRoute() {
  return instantBacktestService.listRuns();
}

export function createBacktestRoute(payload: InstantBacktestRequest) {
  return instantBacktestService.launch(payload);
}

export function getBacktestConfigsRoute() {
  return queryService.getBacktestConfigs();
}

export function getBacktestByIdRoute(runId: string) {
  return instantBacktestService.getRun(runId);
}

export interface CreateReplayRoutePayload {
  datasetId?: string;
  symbolCodes?: SymbolCode[];
  profileCode?: ProfileCode;
  timeframe?: Timeframe;
  replaySpeed?: number;
}

export function createReplayRoute(payload: CreateReplayRoutePayload) {
  return replayApiService.createRun(payload);
}

export function getReplayRunsRoute() {
  return replayApiService.listRuns();
}

export function getReplayByIdRoute(runId: string) {
  return replayApiService.getRun(runId);
}

export function controlReplayRoute(runId: string, action: ReplayControlAction) {
  return replayApiService.controlRun(runId, action);
}

export async function getLiveRoute() {
  return liveOperationsService.getLiveSummary();
}

export async function getLiveHealthRoute() {
  return liveOperationsService.getLiveHealth();
}

export async function getLiveSafetyRoute() {
  return liveOperationsService.getLiveSafety();
}

export async function getLiveIncidentsRoute() {
  return liveOperationsService.getLiveIncidents();
}

export async function postLiveEmergencyRoute(command: EmergencyCommand) {
  return liveOperationsService.postEmergency(command);
}
