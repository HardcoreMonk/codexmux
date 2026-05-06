# Perf Triage Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sanitized `/api/debug/perf.triage` result that ranks measured bottleneck candidates across stats, diff, timeline, status, terminal, session index, runtime workers, and event loop health.

**Architecture:** Keep collection unchanged. Add a pure `src/lib/perf-triage.ts` classifier, call it from `/api/debug/perf`, and test it independently from mocked API snapshots. The classifier returns numeric evidence only.

**Tech Stack:** TypeScript, Next.js Pages Router API route, Vitest.

---

## File Structure

- Create `src/lib/perf-triage.ts`
  - Pure classifier for runtime/service snapshots.
- Create `tests/unit/lib/perf-triage.test.ts`
  - Unit coverage for severity, category mapping, worker failures, event loop, redaction.
- Modify `src/pages/api/debug/perf.ts`
  - Include `triage: buildPerfTriageSnapshot({ runtime, services })`.
- Modify `tests/unit/pages/debug-perf.test.ts`
  - Assert triage exists and sensitive key exclusion remains true.
- Modify `docs/PERFORMANCE.md`, `docs/FOLLOW-UP.md`
  - Document perf 31-36 triage automation.

## Tasks

- [x] Add failing `tests/unit/lib/perf-triage.test.ts` for stats/diff/event-loop/runtime-worker triage.
- [x] Run `corepack pnpm vitest run tests/unit/lib/perf-triage.test.ts` and verify RED.
- [x] Implement `src/lib/perf-triage.ts` with category mapping, severity thresholds, sorting, limit, and redaction-safe fields.
- [x] Run `corepack pnpm vitest run tests/unit/lib/perf-triage.test.ts` and verify GREEN.
- [x] Add failing API test assertions in `tests/unit/pages/debug-perf.test.ts`.
- [x] Wire `triage` into `src/pages/api/debug/perf.ts`.
- [x] Run focused tests:

```bash
corepack pnpm vitest run tests/unit/lib/perf-triage.test.ts tests/unit/pages/debug-perf.test.ts
```

- [x] Update `docs/PERFORMANCE.md`, `docs/FOLLOW-UP.md`, and add operation handoff.
- [x] Run `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, and `corepack pnpm test`.
