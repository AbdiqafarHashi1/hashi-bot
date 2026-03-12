import { createWebContainer } from '../lib/container.js';

const { pagesService } = createWebContainer();

export async function getOverviewPageRoute() {
  return pagesService.getOverviewPage();
}

export function getReplayPageRoute() {
  return pagesService.getReplayPage();
}

export function getBacktestPageRoute() {
  return pagesService.getBacktestPage();
}

export async function getLivePageRoute() {
  return pagesService.getLivePage();
}

export async function getSettingsPageRoute() {
  return pagesService.getSettingsPage();
}


export function getSignalsPageRoute() {
  return pagesService.getSignalsPage();
}

export function getTradesPageRoute() {
  return pagesService.getTradesPage();
}

export function getRunsPageRoute() {
  return pagesService.getRunsPage();
}

export async function getSafetyPageRoute() {
  return pagesService.getSafetyPage();
}
