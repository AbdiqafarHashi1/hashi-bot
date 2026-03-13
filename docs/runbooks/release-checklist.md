# Release readiness checklist (Phase 9)

Use this checklist before merge/deploy and before any live-mode enablement.

## A) Baseline release gate (required)

- [ ] Environment baseline is valid.
  - Command: `pnpm verify:env`
- [ ] Web production env contract is valid.
  - Command: `pnpm verify:env:web:prod`
- [ ] Worker paper env contract is valid.
  - Command: `pnpm verify:env:worker:paper`
- [ ] Typecheck passes.
  - Command: `pnpm typecheck`
- [ ] Lint passes.
  - Command: `pnpm lint`
- [ ] Build passes.
  - Command: `pnpm build`
- [ ] Migrations are present/ready (or explicit N/A in repo snapshot).
  - Command: `pnpm verify:migrations`
- [ ] Datasets are loaded and sane.
  - Command: `pnpm verify:dataset`
- [ ] Backtest smoke run passes.
  - Command: `pnpm smoke:backtest`
- [ ] Replay smoke run passes.
  - Command: `pnpm smoke:replay`
- [ ] Mock live smoke run passes.
  - Command: `pnpm smoke:live:mock`

## B) Go-live gate (only for non-mock live)

- [ ] Worker live env contract passes with real venue selection.
  - Command: `pnpm verify:env:worker:live`
- [ ] `EXECUTION_VENUE` is non-mock and matches intended adapter path.
- [ ] Venue credentials are configured and tested (CCXT/cTrader as applicable).
- [ ] `LIVE_ENABLED=true` is explicitly set in live worker deploy config.
- [ ] `/api/live/safety` shows no lockout / recovery-required state.
- [ ] Operator understands kill-switch response and recovery sequence.

## C) Recovery readiness gate

- [ ] Runbook reviewed: `docs/runbooks/operator-guide.md` sections for kill switch + restart recovery.
- [ ] Team knows to halt on lockout/kill-switch and avoid blind restarts.
- [ ] Post-restart expectations are understood (startup recovery outcomes + persisted notes).

## D) One-command pre-release chain

If env vars are present in the shell/runtime, run:

```bash
pnpm verify:release
```

This chains env, static checks, migration/dataset checks, and smoke runs.
