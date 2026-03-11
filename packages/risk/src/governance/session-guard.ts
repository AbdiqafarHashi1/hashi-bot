import type { SessionType } from '@hashi-bot/core';

export function isSessionTradable(sessionType: SessionType, atTs: number): boolean {
  if (sessionType === 'always_open') {
    return true;
  }

  const at = new Date(atTs);
  const day = at.getUTCDay();
  const hour = at.getUTCHours();

  if (day === 0 || day === 6) {
    return false;
  }

  return hour >= 6 && hour <= 20;
}
