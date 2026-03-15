export interface NavItem {
  href: string;
  label: string;
}

export const controlRoomNavigation: NavItem[] = [
  { href: '/overview', label: 'Overview' },
  { href: '/replay', label: 'Replay Lab' },
  { href: '/backtest', label: 'Backtest Lab' },
  { href: '/live', label: 'Live Center' },
  { href: '/trades', label: 'Trades' },
  { href: '/runs', label: 'Runs' },
  { href: '/safety', label: 'Safety' },
  { href: '/settings', label: 'Settings' }
];
