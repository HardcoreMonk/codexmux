# Operations Automation Batch Design

Date: 2026-05-06
Status: Approved option A

## Goal

Turn the remaining six post-MVP/operations items into a safe automation batch.
The batch should automate evidence collection and low-risk improvements while
keeping hardware-dependent smokes and rollback mutations outside unattended
execution.

## Context

The current main branch already includes:

- Release smoke artifact foundation and a browser reconnect workflow artifact.
- Stats date filtering for narrow `today` stats cache builds.
- Runtime v2 default gate work and lifecycle allowlisted actions for
  `phase6-gate`, `restart-service`, and `deploy-local`.
- Approval queue foundation, parsed metadata, Web Push fallback root deep link,
  and durable audit history.

The remaining list mixes repository automation, live performance work, mobile
notification refinement, lifecycle mutation, long external smokes, and
Post-MVP product exploration. These should not be implemented as one large
behavior change. The safe batch is a sequence of bounded slices with explicit
evidence outputs.

## Scope

### 1. Release/CI artifact preservation

Extend the artifact contract without making release dependent on unavailable
devices:

- Keep the GitHub-hosted browser reconnect artifact as the blocking automated
  release evidence.
- Add optional workflow/manual paths for Android device and macOS packaged UX
  smoke artifacts.
- Document self-hosted runner requirements and expected artifact names.
- Do not require real Android or Mac smoke jobs on GitHub-hosted runners.

### 2. Measurement-based perf tuning

Use `/api/debug/perf` as the source of truth:

- Re-measure `stats`, `timeline`, `status`, and `diff` sub-endpoints
  before changing behavior.
- Continue with the current proven bottleneck first: `stats` `7d`, `30d`, and
  `all` endpoints remain slow after the `today` date-filtering slice.
- Prefer cache reuse, response-level reuse, and date-range filtering refinements
  over broad parser rewrites.
- Record before/after numbers in `docs/PERFORMANCE.md` and
  `docs/FOLLOW-UP.md`.

### 3. Approval queue follow-up

Improve the operator-facing mobile path without changing approval semantics:

- Review how status-owned parsed metadata is exposed to approval queue records.
- Use sanitized metadata for mobile lock-screen copy when available.
- Keep fallback copy stable when command/file/permission metadata is absent.
- Preserve durable audit records and existing fallback deep link behavior.

### 4. Lifecycle Control follow-up

Keep mutation work behind a separate spec boundary:

- Add a spec or dry-run validator for rollback flag mutation, systemd drop-in
  editing, and rollback drill automation.
- Do not add unattended rollback mutation to `/experimental/runtime` in this
  batch.
- Keep existing allowlisted actions as the executable surface.

### 5. Long/external smoke evidence

Batch the parts that can be automated locally:

- Add a repeatable smoke evidence template or runner for long Codex work,
  Browser/PWA reconnect, and existing runtime gate checks.
- Represent real iPad/PWA long background and Mac packaged UX checks as manual
  evidence rows unless the required device/runner is present.
- Do not fake device evidence.

### 6. Post-MVP backlog grooming

Keep product exploration out of the automation implementation:

- Group fork/sub-agent UI, app-server adapter review, additional provider
  fixtures, and timeline/status module splitting into a Post-MVP roadmap note.
- Do not implement new Post-MVP UI in this batch.

## Non-Goals

- No destructive rollback mutation without a follow-up spec and explicit
  operator approval.
- No GitHub-hosted Android device smoke requirement.
- No broad runtime v2 ownership changes; Phase 5/6 default work is already
  tracked separately.
- No fork/sub-agent UI implementation.
- No release-blocking dependency on external iPad, Android, or Mac hardware.

## Architecture

The batch is organized around evidence-producing slices:

| Slice | Primary output | Runtime risk |
| --- | --- | --- |
| Release artifacts | workflow/manual artifact files and docs | low |
| Perf tuning | measured code improvement plus perf docs | medium |
| Approval copy | metadata-aware copy and tests | low |
| Lifecycle follow-up | spec/dry-run validator only | low |
| External smoke | evidence template/runner | low |
| Post-MVP grooming | roadmap/spec note | low |

Each slice should be independently testable and committable. The perf slice may
touch production endpoints; it requires focused tests and live measurement after
deployment. The approval copy slice may affect user-visible notifications; it
requires unit tests around metadata presence and fallback behavior.

## Data And Safety Rules

- Smoke artifacts must reuse the existing sanitized artifact writer contract.
- Perf measurements may record endpoint names, durations, counters, and cache
  hit/miss details, but not session content, prompts, terminal output, tokens,
  raw JSONL lines, or workspace secrets.
- Approval notification copy may include sanitized command/file/permission
  labels, but not full command text when the metadata layer provides only a
  sensitive fallback.
- Lifecycle dry-run outputs must not include stdout/stderr from privileged
  commands.

## Testing

Minimum validation before merging implementation slices:

- Focused unit tests for any changed helper or API behavior.
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- Focused smoke or local command for each automation script that changes.
- Live `/api/debug/perf` before/after capture for perf slices.

Hardware-dependent evidence is valid only when the real device or packaged app
was used. Otherwise the artifact must clearly state `manual-required` or
`skipped-no-runner`.

## Rollout

1. Write the implementation plan from this spec.
2. Implement low-risk documentation/evidence scaffolding first.
3. Implement one perf slice at a time with before/after measurement.
4. Implement approval lock-screen copy only after confirming the existing
   metadata ownership path.
5. Leave lifecycle rollback mutation as spec/dry-run work unless explicitly
   approved later.
6. Update docs and handoff after each implemented slice.

## Success

- The six-item list is represented as concrete automation, evidence, or
  deferred spec work.
- Release artifact docs distinguish blocking automated evidence from optional
  hardware evidence.
- Perf work has measured before/after numbers rather than speculative tuning.
- Approval mobile copy improves when sanitized metadata exists and preserves
  fallback behavior otherwise.
- Lifecycle rollback mutation is not accidentally exposed as an unattended UI
  action.
- Post-MVP exploration remains documented but does not expand the current batch.
