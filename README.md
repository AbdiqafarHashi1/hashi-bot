# hashi-bot

Phase 1 foundation for a modular trading bot monorepo that is designed to support replay, backtest, paper, and live workflows across crypto and forex-style markets.

## Purpose

This repository establishes the **architecture, contracts, and infrastructure wiring** for a production-oriented trading system. Phase 1 intentionally focuses on scaffolding and boundaries rather than final trading logic.

Planned long-term support includes:
- Market support: crypto, forex, metals, indices
- Operation modes: replay, instant backtest, paper, live
- Execution venues: mock, personal exchange APIs, and prop/forex adapters
- Shared strategy core with profile-specific behavior
- Supabase-backed storage and configuration
- Vercel-hosted web app plus a separate always-on worker runtime

## Phase 1 scope (foundation only)

Phase 1 includes:
- Monorepo workspace and package boundaries
- Base TypeScript and task orchestration setup
- Initial contracts/stubs and placeholder integrations
- Supabase schema and ingestion-oriented structure

Phase 1 does **not** include finalized:
- Strategy math
- Risk math
- Live execution engine
- Full replay/backtest engine
- Polished dashboard experience

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
    storage/
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
- `packages/data`: dataset parsing, validation, loading contracts
- `packages/indicators`: pure indicator implementations
- `packages/strategy`: strategy interfaces and scoring/setup/regime stubs
- `packages/risk`: profile, sizing, and governance interfaces/stubs
- `packages/execution`: adapter interfaces/stubs (mock/ccxt/ctrader)
- `packages/backtest`: replay/backtest/fill/state machine contracts/stubs
- `packages/storage`: Supabase wrappers and repository layer
- `packages/telemetry`: logging/incidents/alerts stubs

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
- `pnpm verify:env`: verify required environment variable placeholders
- `pnpm bootstrap:local`: print local bootstrap checklist

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
3. Validate environment placeholders:
   ```bash
   pnpm verify:env
   ```
4. Start development tasks (once workspace packages/apps are added):
   ```bash
   pnpm dev
   ```
