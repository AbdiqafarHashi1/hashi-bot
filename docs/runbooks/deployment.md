# Deployment runbook (Phase 9)

This repository is intended to be deployed as **split runtimes**:

1. **Web app (`apps/web`)** for pages + API orchestration.
2. **Worker (`apps/worker`)** for replay/backtest/paper/live loops.
3. **Storage services** (database + redis + optional supabase) as external dependencies.

## 1) Pre-deploy environment verification

Run target-specific checks before each deploy:

```bash
pnpm verify:env:web:prod
pnpm verify:env:worker:paper
# or for real live workers
pnpm verify:env:worker:live
```

Use `pnpm verify:env` for a local baseline smoke profile.

Use `docs/runbooks/release-checklist.md` as the pre-merge/pre-deploy gate document.

## 2) Worker mode safety boundaries

- `WORKER_MODE` must be explicit in production.
- `WORKER_MODE=live` requires:
  - `LIVE_ENABLED=true`
  - non-mock `EXECUTION_VENUE`
  - venue credentials for selected adapter
- `WORKER_MODE=backtest` requires `DATASET_ID`.
- `WORKER_MODE=replay` requires `REPLAY_DATASET_ID` (or fallback `DATASET_ID`).

These checks are enforced at worker startup and fail fast when invalid.

## 3) Web runtime safety boundaries

- `NEXT_PUBLIC_APP_NAME` is always required.
- Production web deployments also require:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Invalid `EXECUTION_VENUE` values fail web startup immediately.

## 4) Recommended deployment split

- **Web service**: deploy `apps/web` with web-only env vars + read APIs.
- **Worker service**: deploy `apps/worker` separately with mode-specific env vars.
- **Database/Redis**: managed separately; worker should fail startup when absent.

Do not run long-lived worker loops inside web runtime.

## 5) Fast release verification sequence

```bash
pnpm verify:release
```

This chains env + static + runtime smoke checks and should pass before merge/deploy.
