# Stats Date Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce stats cold scans by filtering Codex JSONL files by date path before parsing narrow periods.

**Architecture:** Add date extraction and filtering helpers beside `collectAgentJsonlFiles()`, then use those helpers from stats cache and stats parsers. Preserve `period=all` full scans and include unknown-date paths as a safe fallback.

**Tech Stack:** TypeScript, Vitest, existing stats parsers, existing `/api/debug/perf` counters.

---

## Tasks

### Task 1: Failing Tests

**Files:**
- Modify: `tests/unit/lib/stats-codex.test.ts`
- Create: `tests/unit/lib/stats-agent-jsonl-files.test.ts`

- [x] Add helper tests for date extraction and target-date filtering.
- [x] Add a stats cache regression test where an old path containing a today timestamp is excluded when only today is missing.
- [x] Run:

```bash
corepack pnpm test tests/unit/lib/stats-agent-jsonl-files.test.ts tests/unit/lib/stats-codex.test.ts
```

Expected: fail because the helper does not exist and old path files are still parsed.

### Task 2: Helper Implementation

**Files:**
- Modify: `src/lib/stats/agent-jsonl-files.ts`
- Modify: `src/lib/stats/period-filter.ts`

- [x] Add `extractDateFromAgentJsonlPath(filePath)`.
- [x] Add `filterAgentJsonlFilesByDates(files, targetDates)`.
- [x] Add `dateStringsForPeriod(period)` returning `null` for `all`.

### Task 3: Apply Filtering

**Files:**
- Modify: `src/lib/stats/stats-cache.ts`
- Modify: `src/lib/stats/jsonl-parser.ts`
- Modify: `src/lib/stats/history-parser.ts`

- [x] Filter `computeMissingDays()` file list by `targetDates`.
- [x] Filter `parseAllProjects()` and `parseAllSessions()` by period date set.
- [x] Filter `parseTimestampsByDay()` by target dates.
- [x] Filter `parseHistory()` by period date set.

### Task 4: Docs And Verification

**Files:**
- Modify: `docs/PERFORMANCE.md`
- Modify: `docs/FOLLOW-UP.md`

- [x] Record the 2026-05-06 live measurement and date filtering change.
- [x] Run focused stats tests.
- [x] Run `corepack pnpm test`.
- [x] Run `corepack pnpm tsc --noEmit`.
- [x] Run `corepack pnpm lint`.
- [x] Run `git diff --check`.

## Self-Review

- Scope is limited to stats date filtering.
- No cache schema migration is required.
- Unknown date paths stay included, so custom layouts do not silently disappear.
