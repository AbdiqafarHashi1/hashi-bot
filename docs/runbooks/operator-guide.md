# Operator guide (Phase 9)

This guide is for day-to-day operation of the bot with the current split architecture.

## 1) Architecture at a glance

- **Web (`apps/web`)**: UI + thin API routes for visibility/control payload handling.
- **Worker (`apps/worker`)**: replay/backtest/paper/live runtime loops and safety logic.
- **Storage**: external DB/Redis (+ optional Supabase integration) used by runtime workflows.
- **Shared packages**: strategy/risk/backtest/execution/storage boundaries remain package-owned.

## 2) Local development setup

1. Install deps: `pnpm install`
2. Copy env template: `cp .env.example .env`
3. Fill minimally required vars for your intended mode.
4. Run baseline checks:
   - `pnpm verify:env`
   - `pnpm verify:dataset`
5. Start runtimes as needed:
   - Web: `pnpm dev:web`
   - Worker: `pnpm dev:worker`

## 3) Environment requirements by runtime

### Web (production)
- Required: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Verify with: `pnpm verify:env:web:prod`

### Worker (paper)
- Required baseline: `DATABASE_URL`, `REDIS_URL`, `LIVE_ACCOUNT_REF`, `EXECUTION_VENUE`
- Common runtime controls: `WATCHLIST_SYMBOLS`, `RANKING_LIMIT`, `LIVE_MAX_CYCLES`, `LIVE_CYCLE_DELAY_MS`, `LIVE_STALE_AFTER_MS`
- Venue requirements:
  - `mock`: no external credentials
  - `ccxt`: `CCXT_API_KEY`, `CCXT_API_SECRET`
  - `ctrader`: `CTRADER_ACCESS_TOKEN`, `CTRADER_ACCOUNT_ID`, `CTRADER_BASE_URL`
- Verify with: `pnpm verify:env:worker:paper`

### Worker (live)
- All paper requirements, plus:
  - `LIVE_ENGINE_ENABLED=true`
  - `LIVE_ENABLED=true`
  - `EXECUTION_VENUE` **must not** be `mock`
- Verify with: `pnpm verify:env:worker:live`

## 4) Migration + seed expectations

- Canonical location: `supabase/migrations` (SQL files).
- Check readiness: `pnpm verify:migrations`.
- Phase 9 baseline includes an explicit no-op SQL migration to establish migration history safely.
- If the directory is absent in other snapshots, migration check returns explicit N/A (not a false pass).
- Keep schema updates versioned and deployed before worker mode changes that depend on them.

## 5) Dataset import and sanity flow

- Datasets are expected to be present and timestamp-ordered for replay/backtest use.
- Validate with: `pnpm verify:dataset`.
- This check verifies dataset presence, symbol presence, and candle timestamp ordering.

## 6) Replay usage (operator flow)

- Smoke run: `pnpm smoke:replay`
- Typical env knobs:
  - `REPLAY_DATASET_ID`, `REPLAY_SYMBOLS`, `REPLAY_ACTION`, `REPLAY_STEPS`
- Expected behavior:
  - deterministic action handling (`step`, `play`, `pause`, jumps, speed)
  - no live order placement side-effects

## 7) Backtest usage (operator flow)

- Smoke run: `pnpm smoke:backtest`
- Required env: `WORKER_MODE=backtest`, `DATASET_ID`
- Purpose: verify deterministic backtest path, run persistence wiring, and strategy/risk/backtest integration health.

## 8) Live mode safety checklist

Before enabling live mode:

1. `pnpm verify:env:worker:live` passes.
2. Venue credentials tested and reachable.
3. `EXECUTION_VENUE` is non-mock.
4. `LIVE_ENABLED=true` explicitly set.
5. `/api/live/safety` and live status show no lockout/recovery-required state.
6. Run `pnpm smoke:live:mock` successfully after code/config changes (sanity gate).

## 9) If kill switch or lockout triggers

1. **Do not restart blindly**.
2. Check worker logs for control state transitions and incident cause.
3. Inspect safety endpoints/state (`/api/live/safety`, live status sections in web).
4. Confirm emergency actions (cancel/flatten/disable-live) were persisted as expected.
5. Resolve root cause (venue health, credentials, stale state mismatch, incident flood).
6. Re-run env + smoke checks.
7. Resume with paper mode first, then promote to live only after clean cycles.

## 10) Restart and recovery expectations

- Worker startup runs safety rails + restart recovery for paper/live modes.
- Startup may append recovery notes and enforce lockouts when needed.
- Expected outcomes are explicit in logs (`resume_ok`, lock/guarded outcomes).
- Recovery state is meant to be inspectable; treat non-`resume_ok` as operationally significant.

## 11) Deploy/update checklist (fast path)

1. `pnpm verify:env:web:prod`
2. `pnpm verify:env:worker:paper` (and `...:live` if applicable)
3. `pnpm typecheck && pnpm lint && pnpm build`
4. `pnpm verify:migrations && pnpm verify:dataset`
5. `pnpm smoke:backtest && pnpm smoke:replay && pnpm smoke:live:mock`
6. Deploy web and worker separately.
7. Post-deploy: verify live status/safety views and worker startup logs.
