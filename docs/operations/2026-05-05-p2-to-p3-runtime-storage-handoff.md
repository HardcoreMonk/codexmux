# 2026-05-05 P2 To P3 Runtime Storage Handoff

## Scope

P2 terminal gate evidence를 현재 코드 기준으로 재확인하고, P3 storage default rollout 전 preflight를 실제 `~/.codexmux` 데이터에 대해 실행했다.

## Live Mode

| Check | Result |
| --- | --- |
| service | `codexmux.service` active/running, `NRestarts=0`, `ExecMainPID=1629654` |
| flags | `CODEXMUX_RUNTIME_V2=1`, `CODEXMUX_RUNTIME_STORAGE_V2_MODE=write`, `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off`, timeline/status `off` |
| `/api/v2/runtime/health` | storage/terminal/timeline/status `ok`, `storageV2Mode="write"`, `terminalV2Mode="off"` |
| `/api/debug/perf` worker counters | storage/terminal/timeline/status `healthFailures=0`, `readyFailures=0`, `commandFailures=0`, `timeouts=0`, `restarts=0`, `errors=0` |

## P2 Evidence

| Check | Result |
| --- | --- |
| `corepack pnpm smoke:runtime-v2:phase2` | passed; cookie login, workspace create/delete, legacy initial route, new-tab v2 route, browser reload v2 reattach, server restart legacy/v2 route, terminal mode off health and legacy fallback |
| `corepack pnpm smoke:browser-reconnect` | passed; `session-not-found` overlay visible, floating reconnect hidden, 새 터미널 복구 click path verified |
| Electron/Android runtime v2 | covered by 2026-05-05 RC platform smoke handoff |

## P3 Storage Preflight

| Check | Result |
| --- | --- |
| `corepack pnpm smoke:runtime-v2:storage-dry-run` | passed, `cutoverReady=true`, blocker 0 |
| `corepack pnpm smoke:runtime-v2:storage-backup` | passed |
| `corepack pnpm smoke:runtime-v2:storage-import` | passed |
| `corepack pnpm smoke:runtime-v2:storage-write` | passed |
| `corepack pnpm smoke:runtime-v2:storage-default-read` | passed |
| `corepack pnpm smoke:runtime-v2:storage-shadow` | passed, expected/actual runtime v2 tab count matched |
| `corepack pnpm runtime-v2:storage-dry-run` | passed on live data, `cutoverReady=true`, blocker 0, workspace 4, pane 4, tab 4 |
| `corepack pnpm runtime-v2:storage-backup` | passed, backup `~/.codexmux/backups/runtime-v2-storage-20260504T163816Z`, copied 37 JSON/SQLite files |
| `corepack pnpm runtime-v2:storage-import` | passed, workspace 4, pane 4, tab 4, message-history 5, missing/invalid/prune 0 |

## Remaining Gates

- Production storage mode must stay `write` until a default rollout and rollback window are explicitly scheduled. This was completed later on 2026-05-05 in `2026-05-05-runtime-v2-live-new-tabs-default-handoff.md`.
- Do not mark P2 fully closed until the 24-hour runtime worker restart-loop observation is recorded.
- Timeline/status cutovers remain separate Phase 4/5 work, not part of this P3 storage handoff.
