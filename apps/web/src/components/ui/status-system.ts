export type PlatformStatus =
  | 'healthy'
  | 'degraded'
  | 'paused'
  | 'kill_switched'
  | 'live'
  | 'paper'
  | 'replay'
  | 'backtest'
  | 'long'
  | 'short'
  | 'positive'
  | 'negative';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export interface StatusPresentation {
  tone: StatusTone;
  label: string;
  icon: string;
  emphasis: 'high' | 'medium';
}

export const platformStatusMap: Record<PlatformStatus, StatusPresentation> = {
  healthy: { tone: 'success', label: 'Healthy', icon: 'pulse', emphasis: 'high' },
  degraded: { tone: 'warning', label: 'Degraded', icon: 'triangle-alert', emphasis: 'high' },
  paused: { tone: 'neutral', label: 'Paused', icon: 'pause', emphasis: 'medium' },
  kill_switched: { tone: 'danger', label: 'Kill Switched', icon: 'shield-off', emphasis: 'high' },
  live: { tone: 'danger', label: 'Live', icon: 'radio', emphasis: 'high' },
  paper: { tone: 'info', label: 'Paper', icon: 'beaker', emphasis: 'medium' },
  replay: { tone: 'accent', label: 'Replay', icon: 'rewind', emphasis: 'medium' },
  backtest: { tone: 'info', label: 'Backtest', icon: 'flask', emphasis: 'medium' },
  long: { tone: 'success', label: 'Long', icon: 'arrow-up-right', emphasis: 'medium' },
  short: { tone: 'danger', label: 'Short', icon: 'arrow-down-right', emphasis: 'medium' },
  positive: { tone: 'success', label: 'Positive', icon: 'trending-up', emphasis: 'medium' },
  negative: { tone: 'danger', label: 'Negative', icon: 'trending-down', emphasis: 'medium' },
};

export interface StatusBadgeModel {
  kind: 'status_badge';
  status: PlatformStatus;
  tone: StatusTone;
  label: string;
  icon: string;
  emphasis: 'high' | 'medium';
}

export function createStatusBadge(status: PlatformStatus, overrides?: Partial<StatusPresentation>): StatusBadgeModel {
  const base = platformStatusMap[status];
  return {
    kind: 'status_badge',
    status,
    tone: overrides?.tone ?? base.tone,
    label: overrides?.label ?? base.label,
    icon: overrides?.icon ?? base.icon,
    emphasis: overrides?.emphasis ?? base.emphasis,
  };
}
