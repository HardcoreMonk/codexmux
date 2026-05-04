# 2026-05-05 RC Platform Smoke Handoff

## Scope

다음 release candidate 전 platform smoke를 `ef09b42` 기준으로 재실행했다.

## Systemd

| Check | Result |
| --- | --- |
| `corepack pnpm deploy:local` | passed |
| `/api/health` | `version=0.4.1`, `commit=ef09b42`, `buildTime=2026-05-04T16:27:53.772Z` |
| `systemctl --user show codexmux.service` | `ActiveState=active`, `SubState=running`, `NRestarts=0`, `Result=success`, `ExecMainPID=1619520` |
| warning journal | no entries in the last 10 minutes |

## Electron

| Check | Result |
| --- | --- |
| `corepack pnpm smoke:electron:attach` | passed, target `http://127.0.0.1:8122`, Electron CLI launch, preload bridge present, blocking console 0 |
| `corepack pnpm smoke:electron:runtime-v2` | passed, temp server `http://127.0.0.1:24013`, initial + 2 reconnect marker outputs, console clean |

## Android

| Check | Result |
| --- | --- |
| device | `R3CX10RTWFH`, `SM-S928N`, Android 16 |
| installed app | `com.hardcoremonk.codexmux`, `versionName=0.4.1`, `versionCode=401` |
| `corepack pnpm smoke:android:foreground` | passed, target `https://gti12.tail73c4be.ts.net`, 2 foreground rounds, blocking console/logcat 0 |
| `corepack pnpm smoke:android:runtime-v2` | passed, temp server `http://100.112.40.104:30653`, initial + 2 foreground marker outputs, blocking console/logcat 0 |

## Notes

- The production route list no longer includes the removed Windows integration routes.
- This smoke run covers Electron/Android/systemd RC preflight only; packaged macOS Finder/Gatekeeper UX remains a separate manual check.
