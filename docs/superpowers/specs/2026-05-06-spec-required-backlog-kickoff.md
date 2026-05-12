# Spec-Required Backlog Kickoff

Date: 2026-05-06

This document starts the backlog items that `ops:backlog:batch-plan` marks as `spec-required`.
It is not an implementation plan. Each item below needs its own focused design before code, service
mutation, or UI execution controls are added.

## Shared Rules

- Keep release-critical terminal, timeline, status, and reconnect behavior stable.
- Do not mutate systemd drop-ins, runtime flags, Codex-owned files, or release state without exact
  confirmation and a rollback path.
- Do not store raw terminal output, prompts, session ids, JSONL paths, tokens, device serials, or
  unredacted command text in audit/history artifacts.
- Keep tmux-backed Codex behavior as the fallback path until an alternative provider is proven.
- Every spec must define owner surface, source of truth, rollback, smoke evidence, and docs updates.

## 1. Runtime Rollback Mutation And Systemd Drop-In Editing

**Goal:** Allow lifecycle control to mutate runtime v2 rollback flags and systemd drop-ins safely.

**Scope:**
- Exact confirmation phrase for each mutation.
- Dry-run diff preview before write.
- Sanitized audit entry after write/restart.
- Rollback command output and post-restart health gate.

**Non-goals:**
- Arbitrary systemd unit editing.
- Shell command text input from the browser.
- Removing the existing read-only `lifecycle:rollback-dry-run`.

**Acceptance gate:**
- Unit coverage for allowlist, diff rendering, audit payload, and rejection paths.
- Local smoke that toggles a temp drop-in only, then proves no live drop-in mutation occurred.
- Separate operator-approved live drill before production default.

## 2. Durable Runtime State Source Of Truth

**Goal:** Define how storage/layout/status durable ownership moves beyond the current runtime v2
default gate.

**Scope:**
- Workspace/layout/message-history/status persistence ownership.
- SQLite schema/versioning policy.
- JSON fallback and import/export boundaries.
- Recovery behavior after partial writes or service restart.

**Non-goals:**
- Removing legacy JSON fallback in the same release.
- Changing Codex CLI `~/.codex` ownership.

**Acceptance gate:**
- Fixture migration tests for old/new stores.
- Read/write parity smoke with temp HOME and live read-only dry-run.
- Rollback plan that returns to JSON-backed projection without data loss.

## 3. Approval Durable Audit History

**Goal:** Extend approval audit history from append-only event evidence into an operator-usable
history surface.

**Scope:**
- Retention policy, query API, and redaction contract.
- Event types for option fetch, fallback, selection success, selection failure, and ack.
- UI surface only after the API proves privacy-safe.

**Non-goals:**
- Raw prompt or command capture.
- Cross-device identity tracking.

**Acceptance gate:**
- Unit tests proving sensitive fields are dropped.
- Fixture JSONL history query tests.
- Live permission smoke that records sanitized history only.

## 4. Timeline Windowed Render

**Goal:** Decide whether long timelines need windowed rendering beyond the current
`content-visibility` optimization.

**Scope:**
- Scroll anchor preservation.
- Load-more and append merge behavior.
- Dedupe behavior for paired assistant JSONL records.
- Mobile and desktop viewport screenshots.

**Non-goals:**
- Rewriting timeline storage or provider parsing.
- Changing stable entry ids.

**Acceptance gate:**
- Long JSONL fixture with append/load-more regression tests.
- Playwright screenshots for mobile and desktop.
- No duplicated assistant entries after resume/session-changed.

## 5. Status Adaptive Scheduling

**Goal:** Split status polling cadence for active/background workspaces based on measured latency
and worker load.

**Scope:**
- SLA for `unknown`, `needs-input`, and `ready-for-review` freshness.
- Active workspace fast path.
- Background workspace backoff.
- Interaction with terminal stdout coalescing and session search/index work.

**Non-goals:**
- Dropping prompt recovery.
- Hiding stale status without recovery evidence.

**Acceptance gate:**
- Pure helper tests for scheduling decisions.
- StatusManager worker smoke with clean failure/restart/timeout counters.
- `/api/debug/perf` before/after comparison.

## 6. Fork/Sub-Agent Relationship UI

**Goal:** Show Codex fork/sub-agent relationships without breaking the dense operational UI.

**Scope:**
- Relationship model from available Codex metadata.
- Session list and CODEX panel affordances.
- Fallback when relationship metadata is absent.

**Non-goals:**
- Spawning sub-agents from the UI in the first slice.
- Replacing existing workspace/tab grouping.

**Acceptance gate:**
- Fixture coverage for parent/child relationships and missing metadata.
- Mobile and desktop visual smoke.
- No session list layout shift for ordinary single-agent sessions.

## 7. Codex Resume Failure Taxonomy

**Goal:** Classify `codex resume` failures into actionable UI/status states.

**Scope:**
- Missing JSONL/session id.
- CWD mismatch.
- CLI stderr categories.
- Permission/resume directory prompt.
- Retry and fallback messaging.

**Non-goals:**
- Parsing arbitrary terminal output as trusted state.
- Changing Codex CLI command ownership.

**Acceptance gate:**
- Fixture tests for each failure class.
- Resume safety smoke.
- Mobile CODEX panel no longer shows ambiguous hang for classified failures.

## 8. Codex State SQLite Read-Only Indexer

**Goal:** Evaluate whether `~/.codex/state_*.sqlite` can improve session discovery while remaining
Codex-owned and read-only.

**Scope:**
- Read-only open mode.
- Schema drift detection.
- Redaction of file paths and session identifiers in diagnostics.
- Fallback to JSONL/tmux detection.

**Non-goals:**
- Writing to Codex SQLite.
- Requiring SQLite state for baseline operation.

**Acceptance gate:**
- Fixture or temp DB schema tests.
- Failure path when DB is absent, locked, or unknown.
- ADR update before enabling any live path.

## 9. App-Server Provider Adapter

**Goal:** Prepare for a Codex app-server provider only after the protocol is stable enough to trust.

**Scope:**
- Provider adapter contract.
- Trust boundary for approval/status events.
- tmux fallback and rollback behavior.
- Experimental flag naming.

**Non-goals:**
- Making app-server the default provider.
- Consuming unverified raw event payloads directly in UI.

**Acceptance gate:**
- Provider fixture contract tests.
- Experimental adapter behind an explicit flag.
- tmux fallback smoke remains required for every release.
