# Approval Workflow Hardening Handoff

Date: 2026-05-07

## Implemented

- Notification panel `needs-input` queue now receives status-owned `approvalPromptMetadata` and uses it as the initial/fallback metadata source.
- Pane capture remains the fresh option source. Fresh useful pane metadata replaces status metadata; unknown/empty pane metadata no longer erases a useful status-owned projection.
- `/api/tmux/send-input` accepts optional sanitized approval audit context and records `selection-sent` or `selection-failed` on the server side after the tmux send outcome is known.
- Client-side selection audit is retained only for network failures before the server is reached.
- Audit records continue to exclude option labels, command previews, tmux session names, cwd, JSONL paths, prompt bodies, terminal output, and secrets.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts tests/unit/pages/send-input-api.test.ts` | passed, 2 files / 13 tests |
| `corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts tests/unit/lib/approval-queue.test.ts tests/unit/lib/approval-audit-store.test.ts tests/unit/lib/status-web-push-payload.test.ts tests/unit/lib/push-deep-link.test.ts tests/unit/pages/permission-options-api.test.ts tests/unit/pages/approval-audit-api.test.ts tests/unit/pages/send-input-api.test.ts` | passed, 8 files / 54 tests |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |
| `corepack pnpm smoke:permission` | passed, needs-input/options/stdin/ack flow |
| `corepack pnpm test` | passed, 143 files / 690 tests |

## Follow-Up

- Actual mobile lock-screen push click behavior still needs device-level long-run smoke evidence.
