import type { InstantBacktestRequest, ReplayControlAction } from '@hashi-bot/backtest';
import type { EmergencyCommandType } from '@hashi-bot/core';
import type { ProfileCode, SymbolCode, Timeframe } from '@hashi-bot/core';

import { createWebContainer } from '../lib/container.js';

const { queryService, instantBacktestService, replayApiService, liveStatusService } = createWebContainer();

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
  return liveStatusService.getLiveState();
}

export async function getLiveHealthRoute() {
  return liveStatusService.getHealth();
}

export async function getLiveOrdersRoute() {
  return liveStatusService.getOrders();
}

export async function getLivePositionsRoute() {
  return liveStatusService.getPositions();
}

export async function getLiveIncidentsRoute() {
  return liveStatusService.getIncidents();
}

export async function getLiveSafetyRoute() {
  return liveStatusService.getSafety();
}

export async function postLiveEmergencyRoute(payload: { command?: EmergencyCommandType }) {
  return liveStatusService.executeEmergency(payload.command ?? 'acknowledge_incident');
}
