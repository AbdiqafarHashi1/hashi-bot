import { BOT_MODES } from '../enums/bot-mode.js';
import { EXECUTION_VENUES } from '../enums/execution-venue.js';
import { MARKET_TYPES } from '../enums/market-type.js';
import { PROFILE_CODES } from '../enums/profile-code.js';
import { SESSION_TYPES } from '../enums/session-type.js';
import { TIMEFRAMES } from '../enums/timeframe.js';

export const APP_NAME = 'hashi-bot';

export const DEFAULT_TIMEFRAME = '15m' as const;
export const SUPPORTED_BOT_MODES = BOT_MODES;
export const SUPPORTED_MARKET_TYPES = MARKET_TYPES;
export const SUPPORTED_EXECUTION_VENUES = EXECUTION_VENUES;
export const SUPPORTED_PROFILE_CODES = PROFILE_CODES;
export const SUPPORTED_SESSION_TYPES = SESSION_TYPES;
export const SUPPORTED_TIMEFRAMES = TIMEFRAMES;
