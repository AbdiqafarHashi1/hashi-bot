import type { PlatformStatus } from '../ui/status-system.js';

export type AppRouteKey =
  | 'overview'
  | 'replay'
  | 'backtest'
  | 'live'
  | 'signals'
  | 'trades'
  | 'runs'
  | 'safety'
  | 'settings';

export interface NavItem {
  key: AppRouteKey;
  label: string;
  href: string;
  description: string;
  status?: PlatformStatus;
  category: 'operations' | 'analysis' | 'governance';
}

export interface NavGroup {
  key: 'primary' | 'research' | 'control';
  label: string;
  items: NavItem[];
}

export const globalNavGroups: NavGroup[] = [
  {
    key: 'primary',
    label: 'Primary',
    items: [
      {
        key: 'overview',
        label: 'Overview',
        href: '/',
        description: 'Cross-mode health and readiness at a glance.',
        category: 'operations',
      },
      {
        key: 'signals',
        label: 'Signals',
        href: '/signals',
        description: 'Ranked strategy outputs and qualification quality.',
        status: 'positive',
        category: 'analysis',
      },
      {
        key: 'trades',
        label: 'Trades',
        href: '/trades',
        description: 'Trade lifecycle outcomes across replay/backtest runs.',
        category: 'analysis',
      },
      {
        key: 'runs',
        label: 'Runs',
        href: '/runs',
        description: 'Unified replay and backtest run timeline.',
        category: 'operations',
      },
    ],
  },
  {
    key: 'research',
    label: 'Research Modes',
    items: [
      {
        key: 'replay',
        label: 'Replay',
        href: '/replay',
        description: 'Deterministic replay controls for event-by-event validation.',
        status: 'replay',
        category: 'analysis',
      },
      {
        key: 'backtest',
        label: 'Backtest',
        href: '/backtest',
        description: 'Instant run history, quality metrics, and config defaults.',
        status: 'backtest',
        category: 'analysis',
      },
    ],
  },
  {
    key: 'control',
    label: 'Control Center',
    items: [
      {
        key: 'live',
        label: 'Live',
        href: '/live',
        description: 'Execution adapter state, orders, positions, and incidents.',
        status: 'live',
        category: 'operations',
      },
      {
        key: 'safety',
        label: 'Safety',
        href: '/safety',
        description: 'Watchdog, lockout, recovery, and emergency visibility.',
        status: 'healthy',
        category: 'governance',
      },
      {
        key: 'settings',
        label: 'Settings',
        href: '/settings',
        description: 'Profiles, symbols, venue configuration, and reminders.',
        category: 'governance',
      },
    ],
  },
];

export function flattenNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

export function resolveRouteKey(path: string): AppRouteKey {
  const sanitized = path === '' ? '/' : path;
  const item = flattenNavItems(globalNavGroups).find((entry) => entry.href === sanitized);
  return item?.key ?? 'overview';
}
