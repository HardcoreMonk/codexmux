# 2026-05-05 Runtime V2 Live New Tabs Default Handoff

## Scope

Production `codexmux.service`에서 plain terminal new-tabs를 runtime v2로 전환하고, workspace/layout/message-history read owner를 storage v2 default로 전환했다.

## Change

Updated `~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf`:

```ini
[Service]
Environment=CODEXMUX_RUNTIME_V2=1
Environment=CODEXMUX_RUNTIME_STORAGE_V2_MODE=default
Environment=CODEXMUX_RUNTIME_TERMINAL_V2_MODE=new-tabs
Environment=CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off
Environment=CODEXMUX_RUNTIME_STATUS_V2_MODE=off
```

Applied with:

```bash
systemctl --user daemon-reload
systemctl --user restart codexmux.service
```

## Verification

| Check | Result |
| --- | --- |
| service | active/running, `NRestarts=0`, `ExecMainPID=1644017` |
| `/api/health` | `version=0.4.1`, `commit=d4b1ef6`, `buildTime=2026-05-04T16:32:48.221Z` |
| `/api/v2/runtime/health` | all workers ok, `terminalV2Mode="new-tabs"`, `storageV2Mode="default"` |
| live app-surface new tab | temporary workspace plain terminal tab returned `runtimeVersion=2`, `rtv2-` session prefix, runtime storage projection present, cleanup completed |
| `CODEXMUX_RUNTIME_V2_SMOKE_URL=http://127.0.0.1:8122 corepack pnpm smoke:runtime-v2:target` | passed; health, workspace list, attach/stdin/stdout/resize, web stdin heartbeat, fresh reattach, fanout, backpressure close, tab delete, deleted-session rejection, workspace delete |
| rollback window canary | 30-second interval x 6; mode stayed `new-tabs/default`, worker restart/timeout/failure counters stayed 0, service `NRestarts=0` |
| final warning journal | no warning-or-higher entries in the final 5-minute window |

## Rollback

Surface rollback:

```ini
Environment=CODEXMUX_RUNTIME_STORAGE_V2_MODE=write
Environment=CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user restart codexmux.service
curl -fsS -H "x-cmux-token: $(cat ~/.codexmux/cli-token)" http://127.0.0.1:8122/api/v2/runtime/health
```

Expected rollback health: `storageV2Mode="write"`, `terminalV2Mode="off"`. Legacy JSON remains present and storage v2 default has JSON fallback evidence from `corepack pnpm smoke:runtime-v2:storage-default-read`.

## Remaining Gates

- Keep observing worker counters and warning journal for the 24-hour restart-loop window.
- Timeline/status remain off and must follow Phase 4/5 gates separately.
