import { createGlobalAppShellModel } from '../components/layout/app-shell.js';
import { globalNavGroups } from '../components/layout/navigation.js';
import { createAppShellLayout } from '../components/ui/primitives.js';

export const appShellLayout = createAppShellLayout(
  'Hashi Operator Console',
  globalNavGroups.flatMap((group) =>
    group.items.map((item) => ({ key: item.key, label: item.label, href: item.href, status: item.status }))
  ),
  [{ key: 'settings', label: 'Settings', href: '/settings' }]
);

export const globalAppShell = createGlobalAppShellModel({
  productName: 'Hashi Operator Console',
  groups: globalNavGroups,
  status: {
    currentRoute: '/',
    operationMode: 'paper',
    health: 'healthy',
  },
});

export interface AppLayoutContract {
  shell: typeof appShellLayout;
  globalShell: typeof globalAppShell;
  maxContentWidth: string;
  supportsDenseTables: boolean;
  responsiveGuidance: {
    nav: {
      desktop: 'expanded';
      tablet: 'collapsed';
      mobile: 'drawer';
    };
    cardGrids: {
      overview: '3-up desktop, 2-up tablet, stacked mobile';
      live: '3-up desktop, stacked mobile with critical strip first';
    };
    controlPanels: {
      replay: 'controls remain compact and horizontal on desktop; wrap into two rows on mobile';
      backtest: 'launch and selected-run summary stay above metric tables on mobile';
    };
    dangerActions: 'danger zones remain visually isolated and pinned near top on small screens';
  };
  pageHierarchy: Array<{
    key: string;
    label: string;
    path: string;
    parent?: string;
  }>;
}

export const appLayoutContract: AppLayoutContract = {
  shell: appShellLayout,
  globalShell: globalAppShell,
  maxContentWidth: '1680px',
  supportsDenseTables: true,
  responsiveGuidance: {
    nav: {
      desktop: 'expanded',
      tablet: 'collapsed',
      mobile: 'drawer',
    },
    cardGrids: {
      overview: '3-up desktop, 2-up tablet, stacked mobile',
      live: '3-up desktop, stacked mobile with critical strip first',
    },
    controlPanels: {
      replay: 'controls remain compact and horizontal on desktop; wrap into two rows on mobile',
      backtest: 'launch and selected-run summary stay above metric tables on mobile',
    },
    dangerActions: 'danger zones remain visually isolated and pinned near top on small screens',
  },
  pageHierarchy: [
    { key: 'overview', label: 'Overview', path: '/' },
    { key: 'signals', label: 'Signals', path: '/signals', parent: 'overview' },
    { key: 'trades', label: 'Trades', path: '/trades', parent: 'overview' },
    { key: 'runs', label: 'Runs', path: '/runs', parent: 'overview' },
    { key: 'replay', label: 'Replay', path: '/replay', parent: 'runs' },
    { key: 'backtest', label: 'Backtest', path: '/backtest', parent: 'runs' },
    { key: 'live', label: 'Live', path: '/live', parent: 'overview' },
    { key: 'safety', label: 'Safety', path: '/safety', parent: 'live' },
    { key: 'settings', label: 'Settings', path: '/settings' },
  ],
};
