# hashi-bot

Phase 9 release-candidate baseline for a modular trading bot monorepo supporting replay, backtest, paper, and live workflows across crypto and forex-style markets.

## Purpose

This repository now carries the **release-candidate architecture, hardening, and operational workflows** for first serious deployment. The design keeps strict boundaries between web orchestration and worker runtime execution.

Planned long-term support includes:
- Market support: crypto, forex, metals, indices
- Operation modes: replay, instant backtest, paper, live
- Execution venues: mock, personal exchange APIs, and prop/forex adapters
- Shared strategy core with profile-specific behavior
- Supabase-backed storage and configuration
- Vercel-hosted web app plus a separate always-on worker runtime

## Phase 9 scope (release-candidate state)

Current Phase 9 baseline includes:
- Hardened web/worker split with fail-fast environment validation
- Replay/backtest/paper/live runtime checks and smoke flows
- Operational runbooks for deployment, recovery, and release checklist gating
- Critical-path automated tests for strategy/risk/backtest/execution flows

Intentional out-of-scope for this release candidate:
- Broad multi-venue expansion beyond current adapters
- Organization-level multi-user control plane
- Major architecture rewrites

## Monorepo structure

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
  supabase/
    migrations/
    seed/
  datasets/
    crypto/
    forex/
  scripts/
```

## Responsibilities

### Apps
- `apps/web`: dashboard and lightweight API routes only
- `apps/worker`: replay/backtest/live loop shells and workers

### Packages
- `packages/core`: shared enums, constants, types, config, and utilities
- `packages/market`: symbol registry, metadata, normalization, sessions
- `packages/data`: dataset parsing/validation and in-memory repositories for replay/backtest/live run-history workflows
- `packages/indicators`: pure indicator implementations
- `packages/strategy`: strategy interfaces and scoring/setup/regime engines
- `packages/risk`: profile, sizing, and governance logic
- `packages/execution`: adapter interfaces and implementations (mock/ccxt/ctrader)
- `packages/backtest`: replay/backtest/fill/state-machine engines and contracts
- `packages/telemetry`: logging/incidents/alerts interfaces and in-memory sinks

## Tooling

- Package manager: `pnpm` workspaces
- Task runner: `turbo`
- Language: TypeScript across apps/packages
- Base TS config: `tsconfig.base.json` for shared strict compiler behavior

## Root scripts

- `pnpm dev`: run all workspace dev tasks via turbo
- `pnpm build`: run all workspace build tasks via turbo
- `pnpm lint`: run all workspace lint tasks via turbo
- `pnpm typecheck`: run all workspace typecheck tasks via turbo
- `pnpm dev:web`: run web app dev task
- `pnpm dev:worker`: run worker app dev task
- `pnpm verify:env`: local baseline env check (dev + paper profile)
- `pnpm verify:env:web:prod`: strict web production env verification
- `pnpm verify:env:worker:paper`: worker paper-mode env verification
- `pnpm verify:env:worker:live`: worker live-mode env verification
- `pnpm bootstrap:local`: print local bootstrap checklist
- `pnpm verify:migrations`: migration readiness check (`supabase/migrations` SQL presence, or explicit N/A)
- `pnpm verify:dataset`: dataset import/sanity check (repository load + timestamp ordering)
- `pnpm smoke:backtest`: worker backtest smoke run on synthetic dataset
- `pnpm smoke:replay`: worker replay smoke run with deterministic step action
- `pnpm smoke:live:mock`: worker paper/live-loop smoke run using mock adapter
- `pnpm verify:release`: full pre-release verification chain (env, typecheck, lint, build, migrations, dataset, smoke runs)
- Release checklist runbook: `docs/runbooks/release-checklist.md`
- `docs/runbooks/deployment.md`: deployment split + startup/env hardening runbook


## Architecture + operator docs

- Deployment runbook: `docs/runbooks/deployment.md`
- Operator guide (setup/operations/recovery): `docs/runbooks/operator-guide.md`
- Release checklist (pre-deploy + go-live gates): `docs/runbooks/release-checklist.md`

These documents are the primary operational references for deploy, run-mode safety, replay/backtest usage, and incident recovery.

## How later phases plug in

This structure is intentionally future-facing. Later phases can add implementation details without restructuring:
- `packages/*` evolve from contracts/stubs into functional modules
- `apps/worker` becomes the runtime host for replay/backtest/live loops
- `apps/web` remains UI/API orchestration without long-running trading loops
- Supabase migrations and repositories become the persistent source for run/profile/config state
- Dataset import scripts and registry logic expand to support multi-pair pipelines

## Quick start

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Copy environment template:
   ```bash
   cp .env.example .env
   ```
3. Validate baseline environment:
   ```bash
   pnpm verify:env
   ```
4. Start runtimes (split architecture):
   ```bash
   pnpm dev:web
   pnpm dev:worker
   ```
5. Optional runtime sanity checks:
   ```bash
   pnpm smoke:backtest
   pnpm smoke:replay
   pnpm smoke:live:mock
   ```

## Pre-release smoke and verification flow

See `docs/runbooks/release-checklist.md` for the operator checkboxes and go-live safety gates.


Run these checks in order for fast confidence before merge/deploy/live usage:

1. Verify environment contract (baseline and deploy-target specific checks):
   ```bash
   pnpm verify:env
   pnpm verify:env:web:prod
   pnpm verify:env:worker:paper
   # For non-mock live deployment:
   pnpm verify:env:worker:live
   ```
2. Verify static quality/build:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm build
   ```
3. Verify migration readiness and dataset sanity:
   ```bash
   pnpm verify:migrations
   pnpm verify:dataset
   ```
4. Run runtime smoke flows:
   ```bash
   pnpm smoke:backtest
   pnpm smoke:replay
   pnpm smoke:live:mock
   ```

Or run the end-to-end chain:

```bash
pnpm verify:release
```

Notes:
- `smoke:backtest`/`smoke:replay` default to built-in synthetic datasets (`dataset-btc-1m`).
- `smoke:live:mock` runs in `WORKER_MODE=paper` with `EXECUTION_VENUE=mock` and one cycle.
- These are practical runtime checks (not placeholders), intended to catch regressions in worker orchestration and critical data paths quickly.
