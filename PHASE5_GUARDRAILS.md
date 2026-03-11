# Phase 5 Guardrails (Session Lock)

This file captures the implementation constraints declared for Phase 5 and is intended to remain in-repo as a reference for subsequent prompts in this Codex session.

## Scope
Implement in Phase 5:
- deterministic replay engine
- replay state model
- replay controls/service layer
- instant backtest orchestration flow
- stronger run storage/retrieval support
- worker/web integration for replay and instant backtest
- replay/backtest pages that expose these capabilities meaningfully

## Explicitly Out of Scope (Do Not Implement Yet)
- real exchange execution
- live venue integration
- final live trading loop
- advanced optimization suite
- polished production-grade design system
- final venue-specific execution behavior

## Non-negotiable Architecture Rules
- Do not simplify the architecture.
- Do not fork strategy/risk/simulation logic into separate replay-only or backtest-only versions.
- Reuse the Phase 4 simulation foundation wherever possible.
- Keep replay logic in `packages/backtest` and worker orchestration where appropriate.
- Keep app/worker separation strict.
- Preserve crypto + forex compatibility.
- Preserve single-pair + multi-pair compatibility.
- Keep replay deterministic and inspectable.
- Keep route handlers thin and service-oriented.
- Avoid fake UI behavior.

## Phase 5 Target Outcomes
After Phase 5, the repository should be able to:
- run deterministic replay with step/play/pause/jump semantics
- show current decision context during replay
- launch and inspect instant backtests from the app flow
- store and retrieve run history meaningfully
- set up Phase 6 live execution work cleanly
