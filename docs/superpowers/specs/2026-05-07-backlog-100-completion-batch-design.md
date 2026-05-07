# Backlog 100% Completion Batch Design

Date: 2026-05-07 KST

## Context

The remaining codexmux work list is no longer a single implementation backlog. It contains three
different classes of work:

- automated local evidence that can be run by the repo scripts
- conditional or physical-device evidence that requires an operator window
- spec-required or product-decision work that should not be marked as implemented by an unattended
  batch

The existing backlog automation already has these building blocks:

- `ops:backlog:batch-plan` maps remaining work into batch lanes and execution classes.
- `ops:backlog:batch-run` executes only automated rows by default.
- `ops:backlog:completion-manifest` writes evidence/defer/spec terminal states.
- `ops:backlog:completion-gate` reports `completionPercent` and `closable`.
- `ops:backlog:complete` runs the automated batch, writes a manifest, and gates the result.

This design updates the closeout model so the latest full work list can reach 100% without
pretending that hardware-only or spec-only rows were physically completed.

## Goal

Create a repeatable batch path that can close the full remaining work list at 100% when:

1. automated rows pass or have current evidence
2. conditional/manual rows have an approved defer entry with owner, reason, and revisit trigger
3. spec-required rows link to a concrete spec or handoff
4. the generated artifact clearly separates passed, evidence-attached, spec-linked, and
   approved-deferred rows

## Non-Goals

- Do not run release mutation, deploy/restart, Android device, iPad, or Mac packaged UX commands
  unless an explicit environment flag enables that conditional window.
- Do not fake manual smoke results.
- Do not mark spec-required items as implemented unless a separate implementation lands.
- Do not delete, rewrite, or migrate runtime data as part of closeout.

## Proposed UX

Recommended command:

```bash
CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1 \
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-complete \
corepack pnpm ops:backlog:complete
```

Default behavior without `CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1` remains conservative: manual
and conditional rows stay incomplete and the gate fails if they do not have direct evidence.

Optional conditional execution stays explicit:

```bash
CODEXMUX_BACKLOG_BATCH_INCLUDE_CONDITIONAL=1 \
CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1 \
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-complete-conditional \
corepack pnpm ops:backlog:complete
```

That mode is only for a release/device window where Android device, release mutation, or similar
conditional commands are expected to run.

## Implementation Design

### 1. Update The Batch Plan

Refresh `scripts/ops-backlog-batch-plan-lib.mjs` so it reflects the latest full list:

- keep existing automated rows for permission, stats/daily report, timeline/CODEX attach, perf,
  browser reconnect, runtime Phase 6, lifecycle dry-run, approval regression, provider fixture, and
  backlog automation
- keep physical-device rows as `manual-required`
- keep release mutation and Android device rows as `conditional`
- keep follow-up product/spec rows as `spec-required`
- add coverage for latest hotfix follow-up: CODEX panel switch/timeline duplicate
  `session-changed` regression

Every row must have a stable `slug`, execution class, rationale, and coverage tag.

### 2. Update Completion Manifest Mapping

Refresh `scripts/ops-backlog-completion-manifest-lib.mjs` so all current manual, conditional, and
spec-required rows have one of:

- `evidence-attached`: a committed operation handoff already contains the required evidence
- `spec-linked`: a committed spec or handoff starts the work and defines the next gate
- `approved-deferred`: allowed only when `CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1`

Approved defer entries must include:

- owner
- reason
- revisitTrigger
- safe relative reference
- ISO recordedAt

### 3. Keep Completion Gate Strict

`scripts/ops-backlog-completion-gate-lib.mjs` should continue to require a terminal state for every
row. A row is terminal only if it is:

- `passed`
- `evidence-attached`
- `spec-linked`
- `approved-deferred`

Unknown slugs, duplicate manifest entries, unsafe references, missing owner/reason, and missing
revisit triggers must keep the gate non-closable.

### 4. Add Tests

Update focused tests to prove:

- plan has stable slugs and current coverage rows
- completion manifest covers all non-automated rows when defer is allowed
- no manual/conditional row is auto-closed when defer is not allowed
- completion gate returns `completionPercent=100` and `closable=true` only with a valid manifest
- invalid manifest entries fail closed

### 5. Documentation And Handoff

Update:

- `docs/FOLLOW-UP.md` with the current closeout command and interpretation
- `docs/operations/` with a handoff for the 100% completion batch

The handoff must record the exact command, artifact directory, completion percentage, row state
summary, and any intentionally deferred rows.

## Expected Output

The successful command should produce a sanitized JSON summary like:

```json
{
  "ok": true,
  "artifactRoot": "/tmp/codexmux-backlog-complete",
  "manifestPath": "/tmp/codexmux-backlog-complete/backlog-completion-manifest.json",
  "results": [
    { "args": ["ops:backlog:batch-run"], "status": "passed" },
    { "args": ["ops:backlog:completion-manifest"], "status": "passed" },
    { "args": ["ops:backlog:completion-gate"], "status": "passed" }
  ]
}
```

The completion gate artifact should include:

- `completionPercent: 100`
- `closable: true`
- row counts by terminal state
- no prompt text, terminal output, cwd, JSONL path, token, secret, or app-server payload

## Rollback

This batch is read-only except for artifact files under `CODEXMUX_SMOKE_ARTIFACT_DIR`. If a manifest
mapping is wrong, revert the manifest/planner commit or rerun without
`CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1`; the gate will fail closed and leave rows open.

## Acceptance Criteria

- `corepack pnpm test tests/unit/scripts/ops-backlog-batch-plan-lib.test.ts tests/unit/scripts/ops-backlog-completion-manifest-lib.test.ts tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts`
  passes.
- `node --check` passes for changed scripts.
- `CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1 CODEXMUX_SMOKE_ARTIFACT_DIR=<tmp> corepack pnpm ops:backlog:complete`
  returns `ok: true`.
- The completion gate artifact reports `completionPercent=100` and `closable=true`.
- Running without `CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1` still fails open for manual/external
  rows unless direct evidence exists.
- Docs and operation handoff are current.

## Self-Review

- No manual evidence is treated as passed.
- Conditional commands remain opt-in.
- Spec-required rows are closed only by spec links, not implementation claims.
- The design preserves existing rollback behavior and does not mutate runtime/service state.
