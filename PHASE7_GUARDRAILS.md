# Phase 7 Guardrails and Session Lock

This file records the non-negotiable implementation constraints for Phase 7 and is intended to remain in-repo as a durable reference while the phase is implemented incrementally.

## Phase 7 Goal
Implement live operational hardening, safety controls, watchdogs, restart recovery, emergency workflows, and safer run-mode/deployment boundaries.

## Scope (Allowed in Phase 7)
- operational health controller
- stale feed/sync/heartbeat watchdogs
- kill switch logic
- emergency cancel/flatten workflows
- stronger live-state persistence and restart recovery
- guarded resume behavior
- run-mode safety rails
- richer incident escalation/health summaries
- worker/web visibility for operational safety state

## Explicitly Out of Scope (Do Not Implement Yet)
- advanced analytics/reporting suite
- final visual design system polish
- optimization/walk-forward tooling
- broad multi-user control plane
- venue expansion beyond current targets

## Non-Negotiable Architecture and Safety Rules
- Do not simplify the architecture.
- Keep safety logic explicit and centralized.
- Do not bury kill-switch logic inside random adapters.
- Preserve app/worker separation.
- Preserve strategy/risk/execution boundaries.
- Prefer fail-safe behavior over hidden retries.
- Keep restart recovery conservative and inspectable.
- Avoid duplicate order risk during recovery.
- Keep crypto + forex compatibility intact.
- Keep route handlers thin and service-oriented.
- No fake operational status behavior.

## Expected Phase 7 Outcomes
After this phase, the repo should be able to:
- detect unhealthy live conditions
- pause or kill-switch safely
- recover state on restart safely
- execute emergency cancel/flatten flows
- expose operational safety status clearly
- prepare for Phase 8 product polish and operating UX

## Session Note
For the initiating prompt, broad implementation is intentionally deferred. This guardrail file locks scope and constraints so upcoming changes in this session can proceed consistently.
