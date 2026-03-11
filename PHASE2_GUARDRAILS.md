# Phase 2 Guardrails (Locked for this session)

This document locks the Phase 2 implementation rules so subsequent prompts in this session can build consistently on the same constraints.

## Baseline assumption

Phase 1 architecture is treated as the fixed baseline. Work in Phase 2 must extend this baseline without simplification or architectural restructuring.

## In-scope for Phase 2

- Core indicator implementations.
- Market snapshot generation from indicator outputs.
- Regime classification foundations.
- Dataset-to-snapshot evaluation pipeline.
- Symbol-aware normalization logic that is safe for both crypto and forex instruments.
- Multi-pair-safe regime context generation.
- Worker-side evaluation service/shell wiring.
- Basic web/API exposure of indicator/regime outputs.

## Out-of-scope for Phase 2 (do not implement yet)

- Final strategy entries.
- Final trade execution.
- Final risk math.
- Final replay engine.
- Final backtest engine.
- Polished analytics UI.
- Optimization logic.

## Non-negotiable implementation constraints

- Do not simplify or restructure the Phase 1 architecture.
- Do not collapse packages.
- Keep logic in the correct package boundaries.
- Keep indicators in `packages/indicators`.
- Keep regime logic in `packages/strategy/regime` (and related strategy base files).
- Use and carefully extend shared types in `packages/core` only when needed.
- Preserve crypto + forex compatibility.
- Preserve multi-pair compatibility.
- Keep deterministic, pure implementations where appropriate.
- Use clear TypeScript.
- Do not use placeholder math where real indicator logic is required.
- Avoid circular dependencies and expose clean exports.

## Phase 2 target outcomes

By the end of Phase 2, the repository should be able to:

- Load a dataset.
- Compute indicator series.
- Derive a per-symbol `MarketSnapshot`.
- Classify regime with explicit logic.
- Support clean extension into Phase 3 setup/entry logic.
