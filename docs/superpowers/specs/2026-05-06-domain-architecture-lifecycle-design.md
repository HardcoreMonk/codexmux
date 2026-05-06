# Domain Architecture Lifecycle Design

Date: 2026-05-06
Status: Approved input

## Goal

Add a DDD architecture pass to the Codex lifecycle so the domain model becomes a
first-class input to code architecture decisions. This change does not refactor
frontend/backend skills.

## Scope

- Add a `domain-architecture` pass after `superpowers:brainstorming` and before
  `grill-me`.
- Treat `writing-spec` as the design spec output of `superpowers:brainstorming`,
  not as a separate lifecycle gate.
- Keep `office-hours` optional before or during early discovery.
- Keep `improve-codebase-architecture` in scope as a bounded implementation
  refactor.
- Exclude FE/React/Vercel and BE/FastAPI skill refactoring from this lifecycle.

## Domain Architecture Pass

The pass reads available domain sources before plan grilling:

- `CONTEXT.md`
- `CONTEXT-MAP.md`
- `docs/adr/`
- context-specific ADR directories when present
- relevant existing code and docs

Missing domain files are not an error. Create or update them only when a real
domain term or hard-to-reverse decision exists and the user has confirmed it.

The pass must make architecture implications explicit:

- canonical domain terms and rejected synonyms
- bounded context or module candidates
- aggregate, entity, and value-object candidates where useful
- folder structure impact
- module boundary impact
- public API, function signature, or type-shape impact
- adapter/infrastructure boundary impact
- ADR candidates when the decision is hard to reverse, surprising without
  context, and has a real trade-off

## Improve Codebase Architecture

`improve-codebase-architecture` remains an implementation activity, but only for
architecture candidates accepted in the plan. It must not become an open-ended
cleanup phase.

Allowed targets:

- shallow modules
- duplicated seams
- testability friction
- poor locality between domain behavior and data
- naming that contradicts confirmed domain language

Boundaries:

- Do not change unrelated modules.
- Do not introduce framework-specific skill rewrites.
- Do not dispatch sub-agents unless the user explicitly asks for delegated or
  parallel agent work.
- Prefer public behavior tests or project-standard regression tests before
  moving domain boundaries.

## Non-Goals

- No FE/React/Vercel skill refactoring.
- No BE/FastAPI skill refactoring.
- No external guide installer, hook, package manager, or plugin manifest
  execution.
- No cross-project `AGENTS.md` rollout in this change.

## Review Notes

`plan-design-review` remains before `superpowers:writing-plans`. For non-UI
workflow changes, it reviews information architecture, gate clarity, operator
error prevention, and discoverability.

`plan-eng-review` must review the domain architecture pass because the pass
affects module boundaries, data flow, test strategy, and rollback path.

## Lifecycle Impact

The revised standard path is:

```text
intake
-> office-hours optional
-> superpowers:brainstorming / writing-spec
-> domain-architecture
-> grill-me
-> plan-design-review
-> superpowers:writing-plans
-> plan-eng-review
-> implement
-> code-review
-> release
-> operate
```

## Self-Review

- Scope is limited to lifecycle/domain architecture workflow documentation.
- `writing-spec` is explicitly an output, not a separate gate.
- `improve-codebase-architecture` is constrained to accepted plan candidates.
- External installer, hook, package manager, plugin, and cross-project rollout
  actions are excluded.
