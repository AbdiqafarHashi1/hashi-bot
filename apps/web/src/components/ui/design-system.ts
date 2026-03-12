export type Density = 'comfortable' | 'compact';

export interface TypeScale {
  size: string;
  lineHeight: string;
  weight: number;
  letterSpacing?: string;
}

export interface DesignSystemTokens {
  spacing: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl', string>;
  radius: Record<'sm' | 'md' | 'lg' | 'xl', string>;
  typography: Record<'overline' | 'label' | 'body' | 'h3' | 'h2' | 'h1', TypeScale>;
  shadows: Record<'subtle' | 'card' | 'floating', string>;
  surfaces: Record<'canvas' | 'panel' | 'elevated' | 'danger', string>;
}

export const designSystemTokens: DesignSystemTokens = {
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    '2xl': '2rem',
  },
  radius: {
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
  },
  typography: {
    overline: { size: '0.75rem', lineHeight: '1rem', weight: 600, letterSpacing: '0.04em' },
    label: { size: '0.8125rem', lineHeight: '1.1rem', weight: 500 },
    body: { size: '0.9375rem', lineHeight: '1.4rem', weight: 400 },
    h3: { size: '1.0625rem', lineHeight: '1.5rem', weight: 600 },
    h2: { size: '1.5rem', lineHeight: '2rem', weight: 650 },
    h1: { size: '2rem', lineHeight: '2.5rem', weight: 700 },
  },
  shadows: {
    subtle: '0 1px 2px rgba(0, 0, 0, 0.16)',
    card: '0 4px 16px rgba(0, 0, 0, 0.2)',
    floating: '0 12px 32px rgba(0, 0, 0, 0.28)',
  },
  surfaces: {
    canvas: 'surface.canvas',
    panel: 'surface.panel',
    elevated: 'surface.elevated',
    danger: 'surface.danger',
  },
};

export interface VisualRhythm {
  pageGap: string;
  sectionGap: string;
  cardPadding: string;
  gridGap: string;
  density: Density;
}

export function createVisualRhythm(density: Density = 'comfortable'): VisualRhythm {
  if (density === 'compact') {
    return {
      pageGap: designSystemTokens.spacing.xl,
      sectionGap: designSystemTokens.spacing.lg,
      cardPadding: designSystemTokens.spacing.lg,
      gridGap: designSystemTokens.spacing.md,
      density,
    };
  }

  return {
    pageGap: designSystemTokens.spacing['2xl'],
    sectionGap: designSystemTokens.spacing.xl,
    cardPadding: designSystemTokens.spacing.xl,
    gridGap: designSystemTokens.spacing.lg,
    density,
  };
}
