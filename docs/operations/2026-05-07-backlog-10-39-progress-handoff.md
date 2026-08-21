# Backlog 10-39 Progress Handoff

Date: 2026-05-07 KST

## Scope

This handoff records the requested progress pass for backlog rows 10-39 from the 100% closeout
batch artifact.

## Executed

| Row range | Check | Result |
| --- | --- | --- |
| 10 | `~/Android/Sdk/platform-tools/adb devices -l` | device connected: `R3CX10RTWFH`, `SM_S928N`, USB transport |
| 11 | Android foreground/runtime/timeline smoke bundle | passed on connected device, app `0.4.7` / `407`, Android `16` |
| 17 | `corepack pnpm smoke:runtime-v2:phase6-default-gate` | passed, terminal `new-tabs`, storage/timeline/status `default`, worker counters clean |
| 18 | `corepack pnpm lifecycle:rollback-dry-run` | passed, `mutates=false`, rollback commands rendered |
| 22-23, 27-28, 31, 37-39 | focused unit test bundle | passed, 10 files / 49 tests |
| 26 | `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-10-39-progress-20260507 corepack pnpm ops:automation:batch` | passed, 6/6 rows |

Focused unit bundle:

```bash
corepack pnpm test \
  tests/unit/lib/approval-queue.test.ts \
  tests/unit/lib/status-web-push-payload.test.ts \
  tests/unit/lib/stats-codex.test.ts \
  tests/unit/lib/timeline-message-counts.test.ts \
  tests/unit/pages/timeline-sessions.test.ts \
  tests/unit/lib/providers.test.ts \
  tests/unit/lib/timeline-subscription-delivery.test.ts \
  tests/unit/lib/timeline-file-watcher-service.test.ts \
  tests/unit/lib/status-poll-service.test.ts \
  tests/unit/lib/status-pane-recovery-service.test.ts
```

## Artifact Evidence

| Artifact root | Result |
| --- | --- |
| `/tmp/codexmux-10-39-progress-20260507` | `ops:automation:batch` passed |
| `/tmp/codexmux-android-10-11-20260507` | Android foreground, runtime-v2, and timeline foreground smokes passed |

Android evidence from `R3CX10RTWFH` / `SM_S928N`:

| Smoke | Artifact | Result |
| --- | --- | --- |
| `corepack pnpm smoke:android:foreground` | `android-foreground-20260507T052259468Z-passed.json` | passed, 2 foreground rounds, 12s background, blocking console/logcat `0` |
| `corepack pnpm smoke:android:runtime-v2` | `android-runtime-v2-20260507T052344088Z-passed.json` | passed, runtime version `2`, 2 foreground rounds, blocking console/logcat `0` |
| `corepack pnpm smoke:android:timeline-foreground` | `android-timeline-foreground-20260507T052512427Z-passed.json` | passed, `timelineV2Mode=default`, `timelineOk=true`, entries increased `3 -> 5 -> 7`, blocking console/logcat `0` |

Perf triage from the run:

| Category | Metric | Severity | Evidence |
| --- | --- | --- | --- |
| stats | `stats.session_parse.7d` | high | average `3259.17ms`, last `3345.73ms`, count `2` |
| runtime | `eventLoop.delay` | medium | p99 `21.61ms`, max `317.98ms` |

## Not Run In This Window

- Row 10: self-hosted Android runner/artifact 운영 is still not promoted to CI-hosted artifact upload.
  Local connected-device artifacts were captured under `/tmp/codexmux-android-10-11-20260507`.
- Row 12: Android Play Console AAB evidence. Requires Play Console operator action.
- Rows 13-14: iPad/PWA long background and input draft/timeline reconnect. Requires real iPad/PWA
  observation.
- Row 15: macOS packaged Electron UX. Requires macOS desktop session.
- Row 16: iOS native shell review. Product decision remains separate.
- Row 19: actual rollback drill. Would mutate runtime flags/restart service, so it remains an
  explicit operator window.
- Row 24: mobile lock-screen/push copy smoke. Requires actual mobile notification surface.
- Row 35: Codex app-server protocol watch. Depends on upstream protocol stability and real CLI
  behavior observation.

## Spec-Linked Rows

Rows 20, 21, 25, 29, 30, 32, 33, 34, and 36 remain `spec-linked`. They are not blocked by this
progress pass, but implementation should be opened one spec at a time to avoid mixing rollback
mutation, durable runtime ownership, approval audit expansion, performance UI, provider hierarchy,
resume failure taxonomy, Codex state indexing, and app-server adapter work in one unsafe change.
