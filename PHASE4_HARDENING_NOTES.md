# Phase 4 Hardening Notes

This note captures intentional boundaries and placeholders after the Phase 4 hardening pass.

## Confirmed boundaries

- `packages/strategy` owns signal-context computation and the Phase-4 signal adapter bridge.
- `packages/risk` owns profile sizing/governance decisions.
- `packages/backtest` owns simulation state machine, fills, and metrics.
- `apps/worker` orchestrates execution paths (evaluation vs backtest) without live order routing.
- `apps/web` exposes read/query surfaces for backtest visibility.

## Centralized simulation assumptions

- Fill and intra-bar assumptions remain centralized in `packages/backtest/src/fills/fill-simulator.stub.ts`.
- Trade lifecycle transitions remain centralized in `packages/backtest/src/engine/state-machine.ts`.

## Phase 5 placeholders (intentional)

- Replay-specific controls and timeline tooling.
- Incremental backtest execution + pagination for large runs.
- Persistent database-backed repositories (currently in-memory).
- Real exchange execution adapters and live order routing.
- Full setup/scoring signal pipeline replacement for current Phase-4 adapter bridge.
