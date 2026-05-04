# Runtime V2 Shadow Handoff

Date: 2026-05-04 KST
Live target: `codexmux.service`

## Summary

- `corepack pnpm smoke:runtime-v2`가 temp HOME/DB server를 `CODEXMUX_RUNTIME_V2=1`, 모든 surface mode `off`로 직접 띄우도록 wrapper를 추가했다.
- 기존 target smoke는 `corepack pnpm smoke:runtime-v2:target`으로 유지했다. `smoke:runtime-v2`에 `CODEXMUX_RUNTIME_V2_SMOKE_URL`을 주면 target smoke로 위임한다.
- live Phase 1 shadow runtime은 `~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf` drop-in으로 켰다.
- Production source of truth는 여전히 legacy routes와 JSON stores다. storage/timeline/status/default terminal cutover는 수행하지 않았다.

## Live Flags

```ini
CODEXMUX_RUNTIME_V2=1
CODEXMUX_RUNTIME_STORAGE_V2_MODE=off
CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off
CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off
CODEXMUX_RUNTIME_STATUS_V2_MODE=off
```

## Verification

- `corepack pnpm test tests/unit/scripts/runtime-v2-smoke-lib.test.ts`
- `node --check scripts/smoke-runtime-v2-isolated.mjs`
- `node --check scripts/smoke-runtime-v2.mjs`
- `node --check scripts/runtime-v2-smoke-lib.mjs`
- `corepack pnpm smoke:runtime-v2`
- `corepack pnpm smoke:runtime-v2:phase2`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- `corepack pnpm deploy:local`
- `CODEXMUX_RUNTIME_V2_SMOKE_URL=http://127.0.0.1:8122 corepack pnpm smoke:runtime-v2`

Live `/api/v2/runtime/health` after restart:

```json
{"ok":true,"storage":{"ok":true},"terminal":{"ok":true,"attached":0},"timeline":{"ok":true},"status":{"ok":true},"terminalV2Mode":"off"}
```

Live `/api/debug/perf` after target smoke showed all four workers with `starts=1`, `readyFailures=0`, `healthFailures=0`, `timeouts=0`, `restarts=0`, and no command failures.

## Rollback

```bash
rm ~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf
systemctl --user daemon-reload
systemctl --user restart codexmux.service
```

## Remaining Gate

- Phase 1은 live 24시간 관찰 window 동안 worker `restarts`, `timeouts`, `healthFailures`, `readyFailures`, `commandFailures`가 0으로 유지되어야 완료된다.
- Phase 3 storage, Phase 4 timeline, Phase 5 status, Phase 6 default cutover는 계속 `docs/RUNTIME-V2-PARITY.md` gap에 의해 blocked 상태다.
