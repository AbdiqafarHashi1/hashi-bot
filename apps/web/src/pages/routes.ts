import { createWebContainer } from '../lib/container.js';

const { pagesService } = createWebContainer();

export async function getOverviewPageRoute() {
  return pagesService.getOverviewPage();
}

export function getReplayPageRoute(query: URLSearchParams = new URLSearchParams()) {
  return pagesService.getReplayPage(query);
}

export function getBacktestPageRoute(query: URLSearchParams = new URLSearchParams()) {
  return pagesService.getBacktestPage(query);
}

export async function getLivePageRoute(query: URLSearchParams = new URLSearchParams()) {
  return pagesService.getLivePage(query);
}

export async function getSettingsPageRoute() {
  return pagesService.getSettingsPage();
}

export function getRunsPageRoute(query: URLSearchParams = new URLSearchParams()) {
  return pagesService.getRunsPage(query);
}

export function getTradesPageRoute(query: URLSearchParams = new URLSearchParams()) {
  return pagesService.getTradesPage(query);
}

export async function getSafetyPageRoute(query: URLSearchParams = new URLSearchParams()) {
  return pagesService.getSafetyPage(query);
}
