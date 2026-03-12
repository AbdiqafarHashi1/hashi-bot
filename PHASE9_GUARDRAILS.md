# Phase 9 Guardrails and Session Lock

This file records the non-negotiable implementation constraints for Phase 9 and is intended to remain in-repo as a durable reference while release-readiness work is implemented incrementally.

## Phase 9 Goal
Implement final product finishing, performance hardening, reliability cleanup, critical-flow testing, deployment readiness, operational documentation, and last-mile UX refinements so the platform is release-ready.

## Scope (Allowed in Phase 9)
- performance optimization in critical paths
- API/query cleanup and targeted refactors
- stronger validation and error handling
- critical-path automated tests
- deployment and environment readiness work
- operational runbooks and docs
- last-mile UI/UX polish
- release and smoke-test helpers

## Explicitly Out of Scope (Do Not Implement)
- major new product features
- optimization lab
- broad new venue support
- multi-user organization control plane
- major architecture rewrites
- speculative scope additions

## Non-Negotiable Architecture and Delivery Rules
- Do not simplify or rewrite the architecture unnecessarily.
- Keep package boundaries intact.
- Focus on release-readiness rather than new core features.
- Prefer targeted refactors over broad rewrites.
- Keep route handlers thin.
- Keep app/worker separation intact.
- Preserve crypto + forex compatibility.
- Preserve honest UI/data behavior.
- Prioritize reliability and maintainability.
- Add tests and docs where they materially reduce operational risk.

## Expected Phase 9 Outcomes
After this phase, the repo should be:
- cleaner
- faster
- better tested
- better documented
- easier to deploy
- safer to operate
- ready for a serious first release candidate

## Session Note
For the initiating prompt, broad implementation is intentionally deferred. This guardrail file locks scope and constraints so upcoming changes in this session can proceed consistently.
