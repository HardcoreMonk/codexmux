# Full Backlog Batch Plan Design

## Goal

Turn the full remaining backlog into a read-only, repeatable batch plan that can guide future
automatic work without pretending that hardware checks, release mutation, or undefined Post-MVP
features are safe to run unattended.

## Batch Lanes

The planner uses eight stable lanes:

1. 운영/릴리스 반복 검증
2. 플랫폼/외부 기기 검증
3. Runtime v2 / Lifecycle
4. Approval Workflow
5. Performance
6. Codex Lifecycle / Provider
7. App-server Adapter
8. Architecture Modularization / 문서 운영

Each item has an execution class:

- `automated`: can be executed or implemented by a local Codex batch with existing tests/smokes.
- `conditional`: can run only in a release window, with an attached device, or when an upstream change exists.
- `manual-required`: needs real hardware, long observation, Play Console/macOS/iPad UX, or operator judgment.
- `spec-required`: changes behavior or ownership enough to need a separate feature spec.

## Non-Goals

- Do not run release version bumps, deploy/restart, rollback mutation, or hardware smokes from the planner.
- Do not implement Post-MVP UI or adapter work in this batch.
- Do not record secrets, raw terminal output, session ids, JSONL paths, device serials, or tokens.

## Interface

`corepack pnpm ops:backlog:batch-plan` prints JSON and writes a sanitized
`ops-backlog-batch-plan` artifact when `CODEXMUX_SMOKE_ARTIFACT_DIR` is set. The JSON includes
summary counts, validation checks, recommended lane order, and per-item commands where a safe
`corepack pnpm ...` command already exists.

## Validation

Unit tests verify stable lane ordering, summary counts, unique item slugs, required backlog
coverage, and command prefix safety. Runtime verification runs the planner, syntax checks, type
checking, lint, and the focused script test.
