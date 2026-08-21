# Session Relationship UI Handoff

Date: 2026-05-07

## Scope

- Added a provider-neutral relationship display helper.
- Added read-only relationship badges to Codex session list rows.
- Added read-only relation row to timeline metadata detail.
- Extended timeline init with optional `relationship` metadata sourced from session index JSONL path matches.
- Added Korean and English relationship labels.

## Safety

- Root or missing relationships render nothing.
- UI displays only relationship type, confidence, and shortened parent/root session id.
- No cwd, JSONL path, command, prompt, terminal output, token, or raw provider payload is shown.
- No relationship mutation, parent navigation action, provider switching, launch, resume, or approval behavior changed.

## Verification

Focused verification:

```bash
corepack pnpm vitest run tests/unit/lib/session-relationship-display.test.ts tests/unit/lib/timeline-init-message.test.ts tests/unit/lib/session-list.test.ts tests/unit/components/session-relationship-ui.test.ts
```

Result: passed as part of expanded focused verification, 5 files / 19 tests.

Full verification:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

Result: passed. Full test suite passed, 148 files / 711 tests.
