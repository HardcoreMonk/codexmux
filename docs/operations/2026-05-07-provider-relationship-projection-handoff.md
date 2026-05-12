# Provider Relationship Projection Handoff

Date: 2026-05-07

## Implemented

- Added provider-neutral session relationship projection in `src/lib/agent-session-relationship.ts`.
- Extended `ISessionMeta` with optional read-only `relationship` metadata.
- Session index now reads sanitized parent/root/source/relationship hints from Codex `session_meta` records when present.
- Existing Codex sessions without hints keep the same public shape except helper-level root projection behavior.
- Provider contract tests now cover the relationship projection entry point for future providers.

## Safety

- Projection stores only provider id, source session id, parent session id, root session id, relationship enum, and confidence enum.
- Raw prompt, cwd, command, JSONL path, terminal output, and transport payload detail are not copied into the projection.
- This slice does not add fork/sub-agent execution, UI controls, provider switching, or app-server transport.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm vitest run tests/unit/lib/agent-session-relationship.test.ts tests/unit/lib/session-list.test.ts` | passed, 2 files / 6 tests |
| `corepack pnpm vitest run tests/unit/lib/providers.test.ts tests/unit/lib/agent-session-relationship.test.ts tests/unit/lib/session-list.test.ts` | passed, 3 files / 16 tests |
| `corepack pnpm vitest run tests/unit/lib/providers.test.ts tests/unit/lib/agent-session-relationship.test.ts tests/unit/lib/session-list.test.ts tests/unit/lib/perf-triage.test.ts tests/unit/pages/debug-perf.test.ts tests/unit/lib/approval-queue.test.ts tests/unit/pages/send-input-api.test.ts` | passed, 7 files / 35 tests |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |
| `corepack pnpm test` | passed, 145 files / 699 tests |

## Follow-Up

- Add read-only UI badges/links after enough real relationship metadata is available.
- Keep app-server adapter disabled by default and make it pass this projection contract before exposing UI.
