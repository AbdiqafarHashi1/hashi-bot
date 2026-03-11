import { createWebContainer } from '../lib/container.js';

const { pagesService } = createWebContainer();

export function getOverviewPageRoute() {
  return pagesService.getOverviewPage();
}

export function getReplayPageRoute() {
  return pagesService.getReplayPage();
}

export function getBacktestPageRoute() {
  return pagesService.getBacktestPage();
}

export function getLivePageRoute() {
  return pagesService.getLivePage();
}

export function getSettingsPageRoute() {
  return pagesService.getSettingsPage();
}
