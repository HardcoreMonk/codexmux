# Provider Relationship Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral read-only session relationship projection that can support future app-server adapter and fork/sub-agent UI work without changing runtime behavior.

**Architecture:** Add a pure relationship helper and expose its sanitized output through Codex session index metadata when source JSONL has relationship hints. Keep missing relationship data as a root/unknown-safe projection and do not persist raw transport payload.

**Tech Stack:** TypeScript, Codex JSONL fixtures, Vitest.

---

## File Structure

- Create `src/lib/agent-session-relationship.ts`
  - Own provider-neutral relationship types and normalization.
- Modify `src/types/timeline.ts`
  - Add optional `relationship` field to `ISessionMeta`.
- Modify `src/lib/session-index.ts`
  - Parse relationship hints from `session_meta` payload and attach sanitized projection.
- Create `tests/unit/lib/agent-session-relationship.test.ts`
  - Cover root, sub-agent/fork hints, unknown fallback, and redaction-safe output.
- Modify `tests/unit/lib/session-list.test.ts`
  - Cover session index public metadata with relationship fixture.
- Update architecture/status/follow-up docs.

## Tasks

- [x] Add RED tests for relationship projection helper and session list metadata.
- [x] Implement helper and type field.
- [x] Wire `session_meta` relationship hints into session index.
- [x] Run focused tests.
- [x] Update docs and operation handoff.
- [x] Run typecheck, lint, and full unit suite.
