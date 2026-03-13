# hashi-bot

Phase 9 release-candidate monorepo for a modular trading bot architecture with split runtimes (`web` + `worker`) and explicit support for replay, backtest, paper, and live workflows.

## Architecture overview

This repository is organized around **runtime isolation** and **package boundaries**:

- `apps/web` is the operator/dashboard surface and thin API layer.
- `apps/worker` is the runtime engine host for evaluation/replay/backtest/paper/live execution loops.
- `packages/*` contain modular domain components shared by web/worker.

### Runtime responsibility split

- **Web (`apps/web`)**
  - Validates web environment contract at startup.
  - Exposes lightweight API routes for health, datasets, replay/backtest orchestration, and live safety/operations views.
  - Does **not** run long-lived trading loops.

- **Worker (`apps/worker`)**
  - Validates worker mode + execution venue contract at startup.
  - Boots safety rails/recovery for paper/live.
  - Runs mode-specific loop orchestration:
    - `evaluation`
    - `replay`
    - `backtest`
    - `paper`
    - `live`

## Runtime flow (end-to-end chain)

The production chain is wired as:

`dataset -> data layer -> indicators -> strategy -> risk -> execution -> telemetry`

At a high level:

1. Data repositories provide dataset candles and runtime state.
2. Evaluation builds market snapshots and indicator context.
3. Strategy/regime/scoring produce ranked trade signals.
4. Risk engine validates tradability and derives position plans.
5. Execution adapter submits/synchronizes orders/positions.
6. Telemetry records incidents, emergency command outcomes, and operational status.

## Repository layout

```text
hashi-bot/
  apps/
    web/
    worker/
  packages/
    core/
    market/
    data/
    indicators/
    strategy/
    risk/
    execution/
    backtest/
    telemetry/
  scripts/
  datasets/
  docs/
    runbooks/
```

## Package responsibilities

- `packages/core`: shared enums/types/constants/config/helpers.
- `packages/market`: market normalization and symbol metadata helpers.
- `packages/data`: repositories for datasets, run history, and live operations state.
- `packages/indicators`: pure indicator calculations.
- `packages/strategy`: regime/scoring/setup/strategy orchestration.
- `packages/risk`: sizing/governance/risk decision logic.
- `packages/execution`: adapters (`mock`, `ccxt`, `ctrader`) + safety/reconciliation/watchdog.
- `packages/backtest`: deterministic backtest/replay engines + fills/metrics/state-machine.
- `packages/telemetry`: sink interfaces and in-memory implementations.

## Environment contract

Copy and fill `.env.example` for local work:

```bash
cp .env.example .env
```

Key contract groups:

- **Web runtime**: `NEXT_PUBLIC_APP_NAME` (+ Supabase public keys in production).
- **Worker runtime**: `WORKER_MODE`, `DATABASE_URL`, `REDIS_URL`, plus mode-specific keys.
- **Execution adapters**:
  - `mock`: no external credentials
  - `ccxt`: exchange + API credentials
  - `ctrader`: base URL + auth/account credentials
- **Datasets/replay/backtest**: `DATASET_ID`, `REPLAY_*` controls.
- **Live safety/alerts**: `LIVE_ENABLED`, `LIVE_ENGINE_ENABLED`, `TELEGRAM_*`.

## Local development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env
   ```

3. Validate baseline environment:

   ```bash
   pnpm verify:env
   ```

4. Start runtimes independently:

   ```bash
   pnpm dev:web
   pnpm dev:worker
   ```

## Runtime modes and smoke commands

- Replay smoke:

  ```bash
  pnpm smoke:replay
  ```

- Backtest smoke:

  ```bash
  pnpm smoke:backtest
  ```

- Paper/live-path smoke with mock execution adapter:

  ```bash
  pnpm smoke:live:mock
  ```

## Verification workflow (release candidate)

Recommended validation sequence:

```bash
pnpm verify:env
pnpm typecheck
pnpm lint
pnpm build
pnpm verify:migrations
pnpm verify:dataset
pnpm smoke:backtest
pnpm smoke:replay
pnpm smoke:live:mock
```

Or run the chained release gate:

```bash
pnpm verify:release
```

## Deployment model

Deploy as **split services**:

1. `apps/web` service (dashboard + API orchestration)
2. `apps/worker` service (runtime loops + execution)
3. external storage dependencies (DB/Redis, optional Supabase integration)

Do not colocate long-running worker loops inside the web runtime.

## Runbooks

- Deployment: `docs/runbooks/deployment.md`
- Operator guide: `docs/runbooks/operator-guide.md`
- Release checklist: `docs/runbooks/release-checklist.md`
