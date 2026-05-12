# Backlog Completion Gate Design

## Goal

Add a completion gate for the full backlog batch system. The gate should make the remaining work
list closable to 100% without pretending that real hardware checks, release mutation, Play Console
steps, macOS/iPad UX, or feature specs were completed by a local unattended runner.

## Completion Model

`corepack pnpm ops:backlog:completion-gate` consumes the existing backlog plan and evidence files.
Every backlog row must resolve to one of these terminal states:

- `passed`: an automated or conditional command ran successfully in the current evidence set.
- `evidence-attached`: a manual-required row has an operator-provided evidence entry.
- `spec-linked`: a spec-required row links to an approved project-local spec, plan, or handoff.
- `approved-deferred`: a row is explicitly deferred with owner, reason, and revisit trigger.

Rows that are only skipped by `ops:backlog:batch-run` are not complete. If any row lacks a terminal
state, the gate exits non-zero and prints `notClosableReasons`.

## Evidence Inputs

The gate reads JSON artifacts from `CODEXMUX_SMOKE_ARTIFACT_DIR` and an optional evidence manifest.
The manifest uses sanitized project-local references rather than raw logs:

- `slug`: backlog item slug from `ops-backlog-batch-plan-lib.mjs`.
- `state`: one of `evidence-attached`, `spec-linked`, or `approved-deferred`.
- `reference`: relative file path, workflow artifact name, or external system label.
- `owner`: operator or team label.
- `recordedAt`: ISO timestamp.
- `reason`: short operational reason for defer or manual acceptance.

The gate must not store tokens, device serials, raw terminal output, prompts, session ids, JSONL
paths, or unredacted command text. Existing smoke artifacts remain the source for automated command
results.

## Interface

The first slice adds these scripts:

- `corepack pnpm ops:backlog:completion-gate`: evaluate the latest evidence and fail unless every
  row is closed.
- `CODEXMUX_BACKLOG_COMPLETION_MANIFEST=<path>`: read a specific evidence manifest.
- `CODEXMUX_BACKLOG_COMPLETION_DRY_RUN=1`: print the gate decision without requiring fresh command
  execution.

The gate does not run release bumps, deploy/restart, Android commands, or lifecycle mutation. It
may reuse artifacts produced by `ops:backlog:batch-run`, `release:patch`, Android smokes, PWA
smokes, Electron builds, and operation handoff docs.

## Output

The command prints JSON and writes an `ops-backlog-completion-gate` smoke artifact. The payload
includes:

- plan summary and row count.
- completion summary by terminal state.
- `completionPercent`.
- `closable`.
- `notClosableReasons`.
- sanitized evidence references per backlog slug.

`completionPercent` reaches `100` only when every row has a terminal state. `closable: true` is the
only success condition.

## Safety

The gate is read-only. It cannot mutate package versions, git state, systemd drop-ins, runtime
flags, Android devices, or remote services. This keeps it safe for normal local and CI execution.
Separate release/device/manual UX commands remain explicit operational windows.

`approved-deferred` is allowed, but it must be auditable. A defer entry needs owner, reason, and
revisit trigger so production readiness does not silently absorb unfinished work.

## Verification

Unit tests cover terminal state resolution, skipped-row rejection, manifest validation, sanitized
payload shape, percentage calculation, and failure reasons.

Runtime verification uses:

```bash
CODEXMUX_BACKLOG_COMPLETION_DRY_RUN=1 corepack pnpm ops:backlog:completion-gate
```

with an incomplete manifest first, expecting failure. A fixture manifest then proves a fully closed
40-row backlog returns `completionPercent: 100` and `closable: true`.

Docs update `docs/TESTING.md` and `docs/FOLLOW-UP.md` so future operators know that the automated
runner executes what can be run locally, while the completion gate decides whether the entire backlog
can be closed.

## Non-Goals

- Do not mark manual-required rows complete without evidence.
- Do not implement the spec-required product features inside this gate.
- Do not automate Play Console, real iPad/macOS UX, or upstream app-server stability decisions.
- Do not replace the existing backlog planner or runner.
