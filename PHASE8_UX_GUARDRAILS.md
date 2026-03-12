# Phase 8 UX/Product Layer Guardrails

This document locks the Phase 8 implementation rules for subsequent prompts in this Codex session.

## Scope
Phase 8 focuses on product UX quality and operator workflows while preserving the existing architecture from Phases 1–7.

## Non-Negotiable Constraints
- Keep architecture and package boundaries intact.
- Keep route handlers thin and service-oriented.
- Preserve real data flows (no fake decorative data).
- Preserve honest mode distinctions: replay, backtest, paper, live.
- Preserve and elevate safety/operational visibility.
- Prefer reusable design-system components and consistent UI patterns.
- Make dangerous/live actions visually distinct and safer to execute.

## In-Scope Outcomes
- Cohesive design system and clear visual hierarchy.
- Improved global shell/navigation and page architecture.
- Polished operator workflows for overview/replay/backtest/live.
- Dedicated signals/trades/runs/safety views.
- Better chart, table, card, and timeline presentation.
- Better config/profile/watchlist surfacing.
- Consistent loading/empty/error/danger states.

## Explicitly Out of Scope (Phase 8)
- Advanced optimization lab.
- Full commercial multi-user control plane.
- Billing/auth organization features.
- Deployment automation/orchestration.
- Final reporting suite beyond practical product needs.

## Design Direction
- Premium modern dashboard feel.
- Strong information hierarchy and spacing.
- Readable typography and status semantics.
- Excellent dark mode (and maintain light mode quality where present).
- Subtle motion only when it improves clarity.
- Strong desktop experience with acceptable smaller-screen behavior.
- Avoid cluttered all-in-one screens.

## Working Agreement for Next Prompts
- Do not start broad implementation until prompted.
- For initial follow-up work, prioritize foundational design-system primitives and app shell improvements that unlock consistent page modernization.
