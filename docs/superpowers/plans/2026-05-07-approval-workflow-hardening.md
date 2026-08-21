# Approval Workflow Hardening Plan

**Goal:** Finish the automatically actionable approval slice by tightening the durable audit path and using status-owned approval metadata as the notification panel's first-class fallback.

**Scope**

- Use `ITabState.approvalPromptMetadata` in the global approval queue before pane fetch completes and when pane parsing fails.
- Keep pane capture metadata as the fresh source when it is available.
- Move approval selection sent/failed audit writes onto `/api/tmux/send-input` so selection durability is tied to the server-side tmux send outcome.
- Preserve existing option index semantics, tab navigation fallback, and `status:ack-notification` behavior.
- Do not store raw option labels, command bodies, tmux session names, cwd, JSONL paths, prompt bodies, terminal output, or auth/token material in audit records.

**Acceptance Gate**

- Unit tests prove status metadata is preferred as fallback copy and replaced by fresh pane metadata when available.
- Unit tests prove `/api/tmux/send-input` appends sanitized `selection-sent` and `selection-failed` audit events when audit context is supplied.
- Existing approval helper, audit store, audit API, and permission prompt tests still pass.
- `corepack pnpm smoke:permission` still passes.
- `docs/STATUS.md`, `docs/FOLLOW-UP.md`, and the approval handoff reflect that durable selection audit is server-side.

## Tasks

- [x] Add RED tests for status metadata fallback and server-side selection audit.
- [x] Add approval queue helpers for choosing display/audit metadata.
- [x] Pass `approvalPromptMetadata` from notification state into `ApprovalQueueItem`.
- [x] Extend `/api/tmux/send-input` with optional sanitized audit context and write audit events after tmux send success/failure.
- [x] Update status/follow-up/handoff docs.
- [x] Run focused tests, typecheck/lint as practical, and permission smoke.
