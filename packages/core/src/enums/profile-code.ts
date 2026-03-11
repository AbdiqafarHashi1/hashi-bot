export const PROFILE_CODES = ['GROWTH_HUNTER', 'PROP_HUNTER'] as const;

export type ProfileCode = (typeof PROFILE_CODES)[number];
