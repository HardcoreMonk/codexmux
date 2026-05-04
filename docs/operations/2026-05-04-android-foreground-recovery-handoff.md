# 2026-05-04 Android Foreground/Recovery Handoff

## Scope

- Live server was redeployed with foreground reconnect hardening.
- Android debug APK was rebuilt and reinstalled because `CodexmuxWebViewClient` changed.
- Device: SM-S928N, Android 16, serial `R3CX10RTWFH`, connected while Android Auto was active.

## Changes

- `terminal`, `timeline`, `status`, and `sync` WebSocket hooks pause sockets and retry timers on Android native background.
- Foreground reconnect waits for `/api/health` readiness before reopening WebSockets.
- Native WebView main-frame failure recovery now stops the failing load before posting launcher navigation.
- Android recovery smoke uses actual launcher connect button behavior and verifies network/http/ssl failure classes independently to avoid DevTools target lifetime flake.

## Evidence

| Check | Result |
| --- | --- |
| `corepack pnpm deploy:local` | passed, live health `commit=b97140d`, `buildTime=2026-05-04T11:49:02.280Z` |
| `systemctl --user show codexmux.service` | `ActiveState=active`, `SubState=running`, `NRestarts=0`, `MainPID=1323528` |
| `corepack pnpm android:test:unit` | passed |
| `corepack pnpm android:build:debug` | passed |
| `corepack pnpm android:install` | passed |
| `corepack pnpm smoke:android:install` | passed, `versionName=0.3.3`, `versionCode=303`, `lastUpdateTime=2026-05-04 20:59:46` |
| `corepack pnpm smoke:android:recovery` | passed, network/http/ssl launcher recovery, blocking console/logcat 0 |
| `CODEXMUX_ANDROID_BACKGROUND_MS=60000 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground` | passed on logged-in `/` surface, console 0, blocking logcat 0 |
| `corepack pnpm smoke:android:runtime-v2` | passed, temp server `http://100.112.40.104:28393`, initial + 2 foreground markers, blocking console/logcat 0 |
| `corepack pnpm smoke:runtime-v2:storage-default-read` | passed |
| `corepack pnpm test` | 92 files, 441 tests passed |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |

## Remaining Risk

- 24-hour live monitoring is still the release confidence gate for long-running restart loops.
- iPad Safari/Home Screen long-background reconnect remains separate from Android WebView.
