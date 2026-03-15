# Final Control-Room Capability Audit (Current Branch)

This audit inventories **real capabilities currently implemented in code** and maps them to UI/API exposure status.

## Scope + method

- Audited web API/router/service stack, worker loops/services/jobs, shared types/contracts, and data repositories.
- Focused on operator-visible and operator-controllable runtime capabilities (replay, backtest, live/paper, settings/config, storage).
- No assumptions beyond current repository code.

---

## A. Confirmed controllable capabilities already present

### 1) Replay

#### Implemented controls

- Create replay run with inputs: `datasetId`, `symbolCodes`, `profileCode`, `timeframe`, `replaySpeed`.
- Control actions supported end-to-end:
  - `step` (`steps` optional)
  - `play`
  - `pause`
  - `jump_to_index`
  - `jump_to_timestamp`
  - `set_speed`
  - `reset`
- Control validation enforces non-empty `runId`, sane step/index/timestamp/speed ranges.

#### Exposed control routes

- `POST /api/replay` (create)
- `GET /api/replay` (list)
- `GET /api/replay/:id` (detail)
- `POST /api/replay/:id/control` (control action)

#### Replay state + metrics currently available

Via replay state/detail persistence (`RunDetailView`):
- cursor, playback state/speed, latest snapshots, latest regimes, latest signals
- open trades + closed-trade summary (`totalClosed`, `winRatePct`, `netPnl`, etc.)
- timeline events + timeline summary (`totalEvents`, event-type counts, latest timestamp)
- run summary metrics (`totalTrades`, `winRatePct`, `netPnl`)

#### Not present for replay (backend capability missing)

- No explicit control/action for: `resume` (use `play`), `replace-dataset`, upload/download dataset, replay clock manipulation beyond `set_speed` and jumps.
- No dedicated API route for timeline pagination/filtering, trade-slice querying, or launch-request retrieval despite repository support.
- No explicit replay goal-tracking/prop-evaluation object model (daily target/profit objective/consistency score/etc.).

---

### 2) Backtest

#### Implemented launch inputs

`InstantBacktestRequest` supports:
- `datasetId`
- `profileCode`
- `timeframe`
- `symbols[]`
- `fromTs` / `toTs`
- `initialBalance`
- `slippageBps`
- `commissionBps`
- `maxConcurrentPositions`
- `metadata`

#### Exposed control routes

- `POST /api/backtests` (launch instant backtest)
- `GET /api/backtests` (list summaries)
- `GET /api/backtests/:id` (detail)
- `GET /api/backtests/configs` (config/options payload)

#### Backtest result objects + metrics

- Run summary: mode/status/profile/timeframe/symbols/timestamps + key metrics (`totalTrades`, `winRatePct`, `netPnl`, `maxDrawdownPct`).
- Run detail includes:
  - `backtestConfig`
  - `tradeSummaries` (trade ID, side, setup, lifecycle, pnl, open/close timestamps, reason)
  - `metrics`
  - placeholder empty timeline for backtests

#### Not present for backtest (backend capability missing)

- No separate asynchronous historical-run scheduler/queue distinct from current instant-run flow exposed to web.
- No dedicated API for server-side filtered list/detail queries (symbol/status/profile/date window filters) even though repository interfaces support filtered reads.

---

### 3) Live / Paper

#### Runtime modes + venues

- Worker modes include `paper` and `live` with startup safety checks.
- Venue adapters implemented: `mock`, `ccxt`, `ctrader`.

#### Exposed operator data + controls (web)

- `GET /api/live` (overall live state)
- `GET /api/live/health`
- `GET /api/live/orders`
- `GET /api/live/positions`
- `GET /api/live/incidents`
- `GET /api/live/safety` (runtime safety file preferred; adapter fallback)
- `POST /api/live/emergency` exists but is intentionally **visibility-only** in web runtime (non-executing)

#### Real execution controls present in worker runtime

- Live cycle executes strategy batch, risk checks, order placement attempts, reconciliation, watchdog, health evaluation, kill-switch decisioning.
- Startup safety rails block unsafe start (e.g., live mode without `LIVE_ENABLED=true`, live+mock venue, missing credentials).
- Startup recovery evaluates persisted-vs-venue state and derives recovery outcome.
- Emergency command execution service supports real worker-side commands:
  - `cancel_all_orders`
  - `flatten_positions`
  - `disable_live_mode`
- Loop persists safety/control snapshots and emergency history into file state (`.runtime/worker-live-state.json` by default).

#### Data already exposed for operations/guardrails

- Account snapshot/sync data, open orders/positions, latest sync timestamp.
- Incidents, watchdog status, health evaluation, control decision, lockout reasons, operational summary.
- Recovery state/outcome notes and emergency history via persisted runtime state (consumed by `/api/live/safety`).

#### Not present for live/paper UI/API today

- Web endpoint does not execute real emergency commands (by design).
- No web API exposing full live-cycle internals from worker per-cycle (watchdog details, reconciliation entries, risk rejection reasons per signal, etc.) in streaming/history form.
- No exposed price-stream/analysis feed endpoint from worker loop; available pieces are indirect through evaluation outputs and adapter sync state.

---

### 4) Settings / Config

#### Config and registries already available

- Symbols registry and dataset catalog exposed via API (`/api/symbols`, `/api/datasets`).
- Backtest config payload includes profiles + dataset options + defaults.
- Replay/backtest profile selection supported via request payloads (`GROWTH_HUNTER`, `PROP_HUNTER`).
- Timeframe is controllable in replay/backtest create payloads.
- Execution venue/account/mode visibility exposed through live status payloads (derived from env/runtime).

#### Prop-firm / risk-goal fields already implemented

- `PROP_HUNTER` risk profile exists with conservative limits (daily/global drawdown, max trades, etc.).
- Risk profile definitions include many prop-style constraints but no explicit “goal progress” tracking object exposed to UI/API.

#### Env-derived config surfaced now

- Web runtime validates app identity and (production) Supabase public keys.
- Worker runtime validates mode/venue/account and live safety env constraints.
- `/api/config` payload is currently static/phase-oriented and does **not** mirror full env/runtime details.

---

## B. Confirmed read-only but valuable data already present

- Replay detail model stores timeline events + timeline summary + state snapshot suitable for truth-inspector style views.
- Run-history repository supports query primitives:
  - summary filters (`mode`, `status`, `profileCode`, `datasetId`, `symbolCode`, pagination)
  - trade summary pagination/filtering
  - replay timeline events by `sinceTs` + pagination
- Live safety payload includes lockout/recovery/emergency history from persisted worker state when available.
- Worker computes rich internal live-cycle telemetry (watchdog/health/control/reconciliation/incidents) even if not fully surfaced to web yet.

---

## C. Missing UI wiring only

These are implemented and already available via API/service, but current UI shell is legacy and not wired into full operator pages:

- Replay controls (all supported actions) and replay detail state visualization.
- Backtest launcher/detail explorer with trade summaries and metrics.
- Live overview cards for health/orders/positions/incidents/safety endpoints.
- Settings pages for symbols/datasets/profiles/backtest defaults/venue/account visibility.
- Runs/trades/timeline inspector views from existing run detail payloads.

---

## D. Missing thin API glue

Backend capability exists but not exposed with dedicated web route(s):

1. **Run-history query APIs**
   - Expose `RunHistoryRepository` filter/pagination features:
     - filtered run summaries
     - trade summaries by run with symbol + paging
     - replay timeline incremental fetch (`sinceTs`, `limit`, `offset`)

2. **Launch-request and control audit visibility**
   - Expose stored launch requests (`saveLaunchRequest`) for run reproducibility/audit in UI.

3. **Worker-side emergency execution bridge (guarded)**
   - If desired, add explicit worker control-plane API (with hard auth/guardrails) rather than using current web visibility-only endpoint.

4. **Live-cycle diagnostics feed**
   - Optional thin endpoint(s) to surface latest watchdog/reconciliation/control-decision internals already computed in worker.

---

## E. Missing real backend capability

These do **not** appear implemented end-to-end in this branch:

1. Replay dataset replacement/upload/download workflows.
2. True multi-run historical backtest orchestration (queued background runs with lifecycle states) beyond instant execution pattern.
3. First-class prop-goal tracking model (e.g., objective progress, pass/fail checkpoints) persisted and exposed as domain objects.
4. Persistent storage implementation for run/config/live ops (current runtime uses in-memory repos + file state for live safety snapshot).
5. Multi-user/session/operator audit model for control-room actions.

---

## F. Recommended final control-room information architecture

Build UI on current truth with minimal glue in this order:

1. **Control Room Home (read-mostly, action-gated)**
   - Global mode/venue/account/readiness banner
   - Live health + lockout status + emergency history
   - Active replay/backtest run summaries

2. **Replay Workspace**
   - Left: run selection + create form
   - Center: timeline/event stream + cursor/clock + snapshot/regime/signal panel
   - Right: controls (`play/pause/step/jump/set-speed/reset`) + trades/open positions + quick metrics
   - Add thin API for paged timeline/trades when needed

3. **Backtest Workspace**
   - Launch panel (all instant inputs)
   - Summary leaderboard/table
   - Run detail drawer with config/metrics/trades
   - Add filtered list/detail API parameters from repository query support

4. **Live/Paper Operations**
   - Health/orders/positions/incidents/safety tabs
   - Explicit “visibility-only” badge on web emergency endpoint until real worker bridge exists
   - Guardrail-first rendering (lockout/recovery prominent)

5. **Settings + Runtime Truth**
   - Profiles, datasets, symbols, defaults, mode/venue/account
   - Show env/runtime validation outcomes clearly (read-only)

6. **Data/Persistence Roadmap Layer**
   - Short-term: expose in-memory/file-backed truth via thin APIs
   - Mid-term: swap repositories to persistent backing (Supabase/DB) without changing UI contracts

---

## Capability-to-source mapping quick index

- Web route composition: `apps/web/src/api/routes.ts`
- Replay API route wrappers: `apps/web/src/app/api/replay/*`
- Backtest API route wrappers: `apps/web/src/app/api/backtests/*`
- Live API route wrappers: `apps/web/src/app/api/live/*`
- Replay runtime service (web): `apps/web/src/services/replay-api.service.ts`
- Backtest runtime service (web): `apps/web/src/services/instant-backtest.service.ts`
- Live status service (web): `apps/web/src/services/live-status.service.ts`
- Worker replay/backtest/live orchestration: `apps/worker/src/index.ts`, `apps/worker/src/loops/*`, `apps/worker/src/services/*`
- Run history query surface: `packages/data/src/run-history-repository.ts`
- Live persisted safety state: `apps/worker/src/lib/live-state-store.ts`
- Execution adapter capabilities: `packages/execution/src/base/execution-adapter.ts`
- Risk profiles / prop-style constraints: `packages/risk/src/profiles/*`

