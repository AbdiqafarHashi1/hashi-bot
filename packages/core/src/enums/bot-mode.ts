export const BOT_MODES = ['replay', 'backtest', 'paper', 'live'] as const;

export type BotMode = (typeof BOT_MODES)[number];
