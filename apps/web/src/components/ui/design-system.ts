export const controlRoomTheme = {
  color: {
    bg: '#070b13',
    panel: '#0d1527',
    panelAlt: '#101b31',
    border: '#2a3958',
    text: '#e8efff',
    muted: '#97a8ca',
    accent: '#4f8dff',
    positive: '#45d59b',
    caution: '#f4bf68',
    negative: '#ff8f9e'
  },
  radius: {
    panel: '12px',
    control: '8px'
  },
  spacing: {
    xs: '0.35rem',
    sm: '0.6rem',
    md: '0.9rem',
    lg: '1.25rem'
  }
} as const;

export type ControlRoomTheme = typeof controlRoomTheme;
