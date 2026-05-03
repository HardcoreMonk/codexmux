# Browser Reconnect DOM Smoke Handoff

Date: 2026-05-04 KST
Commit: `3f56b8f`
Live target: `codexmux.service`

## Summary

- Added `corepack pnpm smoke:browser-reconnect`.
- The smoke starts a temp server and workspace, forces a missing terminal session, opens the real app in Playwright Chromium, and verifies:
  - `session-not-found` recovery overlay is visible
  - floating `다시 연결` control is not rendered over the blocking overlay
  - `새 터미널로 시작` is pointer-clickable and recovers the tab

## Deployment

- Deployed with `corepack pnpm deploy:local`.
- `/api/health` after restart:

```json
{"app":"codexmux","version":"0.3.3","commit":"3f56b8f","buildTime":"2026-05-03T18:40:42.100Z"}
```

## Verification

- `corepack pnpm smoke:browser-reconnect`
- `git diff --check`
- `corepack pnpm test` -> 79 files, 407 tests
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm deploy:local`

## Remaining Work

- Store browser reconnect smoke JSON output as a release workflow artifact when release CI is formalized.
- Long-running real-device reconnect smoke still remains for Android logged-in sessions and iPad Home Screen.
