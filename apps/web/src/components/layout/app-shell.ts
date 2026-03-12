import { createStatusBadge, type PlatformStatus, type StatusBadgeModel } from '../ui/status-system.js';
import type { NavGroup } from './navigation.js';

export type ExperienceMode = 'desktop' | 'tablet' | 'mobile';

export interface TopHeaderAction {
  key: string;
  label: string;
  href: string;
  emphasis?: 'default' | 'accent' | 'danger';
}

export interface ModeStatusStrip {
  currentRoute: string;
  operationMode: PlatformStatus;
  health: PlatformStatus;
  contextTone: 'research' | 'live_danger';
  badges: StatusBadgeModel[];
  message: string;
}

export interface ResponsiveShellBehavior {
  desktop: {
    sidebar: 'expanded';
    showDescriptions: true;
    stickyStatusStrip: true;
  };
  tablet: {
    sidebar: 'collapsed';
    showDescriptions: false;
    stickyStatusStrip: true;
  };
  mobile: {
    sidebar: 'drawer';
    showDescriptions: false;
    stickyStatusStrip: false;
  };
}

export interface GlobalAppShellModel {
  kind: 'global_app_shell';
  productName: string;
  groups: NavGroup[];
  topHeader: {
    title: string;
    subtitle: string;
    actions: TopHeaderAction[];
  };
  statusStrip: ModeStatusStrip;
  responsive: ResponsiveShellBehavior;
}

export function createModeStatusStrip(input: {
  currentRoute: string;
  operationMode: PlatformStatus;
  health: PlatformStatus;
}): ModeStatusStrip {
  const liveContext = input.operationMode === 'live' || input.health === 'kill_switched' || input.health === 'degraded';

  const message = liveContext
    ? 'Live context: validate safety state before any operator action.'
    : 'Research context: replay/backtest outputs remain isolated from live execution.';

  return {
    currentRoute: input.currentRoute,
    operationMode: input.operationMode,
    health: input.health,
    contextTone: liveContext ? 'live_danger' : 'research',
    badges: [createStatusBadge(input.operationMode), createStatusBadge(input.health)],
    message,
  };
}

export function createGlobalAppShellModel(input: {
  productName: string;
  groups: NavGroup[];
  status: {
    currentRoute: string;
    operationMode: PlatformStatus;
    health: PlatformStatus;
  };
}): GlobalAppShellModel {
  return {
    kind: 'global_app_shell',
    productName: input.productName,
    groups: input.groups,
    topHeader: {
      title: 'Operator Control Center',
      subtitle: 'Navigate research and live operations with explicit safety context.',
      actions: [
        { key: 'open-runs', label: 'Runs', href: '/runs' },
        { key: 'open-live', label: 'Live Monitor', href: '/live', emphasis: 'danger' },
      ],
    },
    statusStrip: createModeStatusStrip(input.status),
    responsive: {
      desktop: { sidebar: 'expanded', showDescriptions: true, stickyStatusStrip: true },
      tablet: { sidebar: 'collapsed', showDescriptions: false, stickyStatusStrip: true },
      mobile: { sidebar: 'drawer', showDescriptions: false, stickyStatusStrip: false },
    },
  };
}
