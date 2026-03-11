import { createWebContainer } from '../lib/container.js';

const { pagesService } = createWebContainer();

export async function getOverviewPageRoute() {
  return pagesService.getOverviewPage();
}

export async function getReplayPageRoute() {
  return pagesService.getReplayPage();
}

export async function getBacktestPageRoute() {
  return pagesService.getBacktestPage();
}

export async function getLivePageRoute() {
  return pagesService.getLivePage();
}

export async function getSettingsPageRoute() {
  return pagesService.getSettingsPage();
}
