# Windows Terminal Bridge Preflight Handoff

Date: 2026-05-04 KST
Commit: `9705289`
Live target: `codexmux.service`

## Summary

- Root cause: Windows bridge clients could point at a stale server build that did not yet serve `/api/remote/terminal/*`. In that case the bridge tried to parse the server's HTML error page as JSON and reported `Unexpected token '<'`.
- Fix: `scripts/windows-terminal-bridge.mjs` now delegates request/poll/output flow to `scripts/windows-terminal-bridge-lib.mjs`. The bridge calls `/api/remote/terminal/register` before starting the local Windows shell and reports non-JSON responses with method, path, status, content type, and a short response preview.
- UI adjustment: the Windows terminal button now prefers an actually registered terminal bridge source and falls back to the Windows sync source only when bridge state has not loaded.

## Deployment

- Deployed with `corepack pnpm deploy:local`.
- `/api/health` after restart:

```json
{"app":"codexmux","version":"0.3.3","commit":"9705289","buildTime":"2026-05-03T18:33:21.478Z"}
```

- `systemctl --user show codexmux.service -p ActiveState -p SubState -p ExecMainPID -p Result -p NRestarts -p WorkingDirectory`:
  - `ActiveState=active`
  - `SubState=running`
  - `Result=success`
  - `NRestarts=0`
  - `WorkingDirectory=/data/projects/codex-zone/codexmux`
- `journalctl --user -u codexmux.service --since '5 minutes ago' -p warning --no-pager`: no entries.

## Verification

- `git diff --check`
- `corepack pnpm test` -> 79 files, 407 tests
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm deploy:local`

## Remaining Smoke

- Windows 11 실기기에서 최신 checkout을 받은 뒤 `corepack pnpm windows:terminal-bridge -- --source-id <sourceId>`를 실행한다.
- Browser `/windows-terminal?sourceId=<sourceId>`에서 `pwd`, `Get-Location`, `node --version`, resize, reconnect를 확인한다.
- 이 bridge는 bridge가 시작한 별도 `pwsh` session만 제어하며 기존 Windows Terminal process에 attach하지 않는다.
