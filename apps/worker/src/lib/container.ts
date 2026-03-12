import { isExecutionVenue, parseExecutionVenue, type ExecutionVenue } from '@hashi-bot/core';
import {
  InMemoryBacktestRunRepository,
  InMemoryDatasetRepository,
  InMemoryRunHistoryRepository,
  InMemoryLiveOperationsRepository,
  type BacktestRunRepository,
  type DatasetRepository,
  type LiveOperationsRepository,
  type RunHistoryRepository
} from '@hashi-bot/data';
import {
  CcxtExecutionAdapter,
  CTraderExecutionAdapter,
  MockExecutionAdapter,
  type ExecutionAdapter
} from '@hashi-bot/execution';
import {
  InMemoryEmergencyCommandSink,
  InMemoryIncidentSink,
  type TelemetryEmergencyCommandSink,
  type TelemetryIncidentSink
} from '@hashi-bot/telemetry';

import { EvaluationService } from '../services/evaluation-service.js';
import { BacktestService } from '../services/backtest-service.js';
import { BacktestSignalService } from '../services/backtest-signal.service.js';
import { ReplayService } from '../services/replay-service.js';
import { LiveExecutionService } from '../services/live-execution.service.js';
import { WorkerRestartRecoveryService } from '../services/restart-recovery.service.js';
import { LiveSafetyRailsService } from '../services/live-safety-rails.service.js';
import { FileLiveStateStore } from './live-state-store.js';

export interface WorkerContainer {
  datasetRepository: DatasetRepository;
  backtestRunRepository: BacktestRunRepository;
  evaluationService: EvaluationService;
  backtestSignalService: BacktestSignalService;
  backtestService: BacktestService;
  runHistoryRepository: RunHistoryRepository;
  replayService: ReplayService;
  executionAdapter: ExecutionAdapter;
  incidentSink: TelemetryIncidentSink;
  emergencyCommandSink: TelemetryEmergencyCommandSink;
  liveExecutionService: LiveExecutionService;
  liveStateStore: FileLiveStateStore;
  restartRecoveryService: WorkerRestartRecoveryService;
  liveSafetyRailsService: LiveSafetyRailsService;
  liveOperationsRepository: LiveOperationsRepository;
}

function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

type CcxtMarketType = 'spot' | 'swap' | 'future' | 'margin';

const CCXT_MARKET_TYPES: readonly CcxtMarketType[] = ['spot', 'swap', 'future', 'margin'];

function parseCcxtMarketType(value: string | undefined): CcxtMarketType {
  if (!value) {
    return 'spot';
  }

  if (!CCXT_MARKET_TYPES.includes(value as CcxtMarketType)) {
    throw new Error(`[worker:env] Invalid CCXT_MARKET_TYPE: ${value}. Expected one of ${CCXT_MARKET_TYPES.join(', ')}.`);
  }

  return value as CcxtMarketType;
}

function buildExecutionAdapter(datasetRepository: DatasetRepository): ExecutionAdapter {
  const vars = env();
  if (vars.EXECUTION_VENUE && !isExecutionVenue(vars.EXECUTION_VENUE)) {
    throw new Error(`[worker:env] Invalid EXECUTION_VENUE: ${vars.EXECUTION_VENUE}. Expected mock|ccxt|ctrader.`);
  }

  const venue: ExecutionVenue = parseExecutionVenue(vars.EXECUTION_VENUE);
  const accountRef = vars.LIVE_ACCOUNT_REF ?? 'paper-account';
  const symbols = datasetRepository.listSymbols();

  if (venue === 'ccxt') {
    return new CcxtExecutionAdapter({
      exchangeId: vars.CCXT_EXCHANGE_ID ?? 'binance',
      accountRef,
      apiKey: vars.CCXT_API_KEY ?? '',
      secret: vars.CCXT_API_SECRET ?? '',
      password: vars.CCXT_API_PASSWORD,
      sandbox: vars.CCXT_SANDBOX === 'true',
      marketType: parseCcxtMarketType(vars.CCXT_MARKET_TYPE),
      symbolSpecs: symbols
    });
  }

  if (venue === 'ctrader') {
    return new CTraderExecutionAdapter({
      baseUrl: vars.CTRADER_BASE_URL ?? 'http://localhost:8080',
      accountRef,
      accountId: vars.CTRADER_ACCOUNT_ID ?? 'demo-account-id',
      accessToken: vars.CTRADER_ACCESS_TOKEN ?? '',
      symbolSpecs: symbols
    });
  }

  return new MockExecutionAdapter({
    accountRef,
    initialBalance: Number(vars.PAPER_INITIAL_BALANCE ?? 10_000)
  });
}

export function createWorkerContainer(): WorkerContainer {
  const datasetRepository = new InMemoryDatasetRepository();
  const backtestRunRepository = new InMemoryBacktestRunRepository();
  const backtestSignalService = new BacktestSignalService();
  const runHistoryRepository = new InMemoryRunHistoryRepository();
  const executionAdapter = buildExecutionAdapter(datasetRepository);
  const incidentSink = new InMemoryIncidentSink();
  const evaluationService = new EvaluationService(datasetRepository);
  const emergencyCommandSink = new InMemoryEmergencyCommandSink();
  const liveStateStore = FileLiveStateStore.fromEnv();
  const liveOperationsRepository = new InMemoryLiveOperationsRepository();

  return {
    datasetRepository,
    backtestRunRepository,
    evaluationService,
    backtestSignalService,
    backtestService: new BacktestService(datasetRepository, backtestRunRepository, backtestSignalService, runHistoryRepository),
    runHistoryRepository,
    replayService: new ReplayService(datasetRepository, runHistoryRepository),
    executionAdapter,
    incidentSink,
    emergencyCommandSink,
    liveExecutionService: new LiveExecutionService(
      evaluationService,
      datasetRepository,
      executionAdapter,
      incidentSink,
      emergencyCommandSink
    ),
    liveStateStore,
    restartRecoveryService: new WorkerRestartRecoveryService(executionAdapter, liveStateStore),
    liveSafetyRailsService: new LiveSafetyRailsService(executionAdapter),
    liveOperationsRepository
  };
}
