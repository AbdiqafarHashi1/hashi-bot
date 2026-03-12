import {
  createEmptyState,
  createErrorState,
  createLoadingState,
  type EmptyState,
  type ErrorState,
  type LoadingState,
} from './primitives.js';

export type MajorPageKey =
  | 'overview'
  | 'replay'
  | 'backtest'
  | 'live'
  | 'signals'
  | 'trades'
  | 'runs'
  | 'safety'
  | 'settings';

export interface PageResponsiveHints {
  preserveDesktopDensity: boolean;
  mobileStackOrder: string[];
  compactNavigation: boolean;
  dangerZonePinnedOnMobile?: boolean;
}

export interface PagePolishContract {
  loading: LoadingState;
  empty: EmptyState;
  error: ErrorState;
  responsive: PageResponsiveHints;
}

export interface WorkspaceEnvelope<TKind extends string, TContent> {
  kind: TKind;
  polish: PagePolishContract;
  content: TContent | null;
  error?: string;
}

const PAGE_TITLES: Record<MajorPageKey, string> = {
  overview: 'Overview',
  replay: 'Replay',
  backtest: 'Backtest',
  live: 'Live',
  signals: 'Signals',
  trades: 'Trades',
  runs: 'Runs',
  safety: 'Safety',
  settings: 'Settings',
};

export function createPagePolishContract(page: MajorPageKey, options?: {
  emptyMessage?: string;
  errorMessage?: string;
  mobileStackOrder?: string[];
  dangerZonePinnedOnMobile?: boolean;
}): PagePolishContract {
  const title = PAGE_TITLES[page];
  return {
    loading: createLoadingState(`${title} loading`, 6),
    empty: createEmptyState(
      `${title} is currently empty`,
      options?.emptyMessage ?? `No ${title.toLowerCase()} data is available yet for this workspace.`
    ),
    error: createErrorState(
      `${title} failed to load`,
      options?.errorMessage ?? `Unable to build the ${title.toLowerCase()} workspace from current service data.`
    ),
    responsive: {
      preserveDesktopDensity: true,
      compactNavigation: true,
      mobileStackOrder: options?.mobileStackOrder ?? ['header', 'critical-strip', 'primary-content', 'details'],
      dangerZonePinnedOnMobile: options?.dangerZonePinnedOnMobile,
    },
  };
}

export async function buildWorkspaceEnvelope<TKind extends string, TContent>(input: {
  kind: TKind;
  polish: PagePolishContract;
  loader: () => Promise<TContent> | TContent;
}): Promise<WorkspaceEnvelope<TKind, TContent>> {
  try {
    return {
      kind: input.kind,
      polish: input.polish,
      content: await input.loader(),
    };
  } catch (error) {
    return {
      kind: input.kind,
      polish: input.polish,
      content: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
