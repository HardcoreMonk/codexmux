# Status Poll Created Bootstrap And Counts

## Goal

Keep `StatusManager.poll()` focused on orchestration by extracting two remaining pure poll concerns:

- poll-created tab entry bootstrap and follow-up action flags
- poll traversal/tab kind/broadcast count aggregation

## Scope

- Add `src/lib/status/poll-created-tab-bootstrap.ts`.
- Add `src/lib/status/poll-counts.ts`.
- Update `src/lib/status-manager.ts` to use both helpers without changing runtime behavior.
- Add focused unit tests for both helpers.
- Update `docs/STATUS.md` and `docs/FOLLOW-UP.md`.

## Verification

- `corepack pnpm vitest run tests/unit/lib/status-poll-created-tab-bootstrap.test.ts tests/unit/lib/status-poll-counts.test.ts`
- status focused unit tests
- `corepack pnpm test`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- `corepack pnpm build`
