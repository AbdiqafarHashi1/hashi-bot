import type { BotMode } from '../enums/bot-mode.js';
import type { ExecutionVenue } from '../enums/execution-venue.js';
import type { ProfileCode } from '../enums/profile-code.js';
import type { Timeframe } from '../enums/timeframe.js';
import type { RunId, SymbolCode } from './common.js';

export interface RunConfigBase {
  runId: RunId;
  mode: BotMode;
  profileCode: ProfileCode;
  executionVenue: ExecutionVenue;
  timeframe: Timeframe;
  symbols: SymbolCode[];
}

export interface ReplayRunConfig extends RunConfigBase {
  mode: 'replay';
  datasetId: string;
  replaySpeed: number;
}

export interface BacktestRunConfig extends RunConfigBase {
  mode: 'backtest';
  datasetId: string;
  slippageBps?: number;
  commissionBps?: number;
}

export interface PaperRunConfig extends RunConfigBase {
  mode: 'paper';
  initialBalance: number;
}

export interface LiveRunConfig extends RunConfigBase {
  mode: 'live';
  accountRef: string;
}

export type RunConfig = ReplayRunConfig | BacktestRunConfig | PaperRunConfig | LiveRunConfig;
