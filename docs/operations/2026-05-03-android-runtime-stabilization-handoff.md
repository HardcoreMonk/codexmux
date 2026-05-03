# 2026-05-03 Android Runtime Stabilization Handoff

## 배포 상태

- Stabilization base commit: `b038ddd` (`Suppress Android foreground reconnect noise`)
- P0/P1 automation commit: `006100e` (`Add Android WebView smoke automation`)
- Permission prompt smoke automation: `corepack pnpm smoke:permission` added after the Android automation pass; current deployed commit is always `/api/health.commit`.
- 이전 안정화 커밋:
  - `fc8ae00` `Reduce Android reconnect noise`
  - `de251ed` `Fix production child cwd after rebuild`
- Version: `0.3.3`
- Live health after deploy must return `app`, `version`, `commit`, and `buildTime`; use `/api/health` as the source of truth for the currently deployed commit.
- Linux service: `codexmux.service`, `ActiveState=active`, `SubState=running`
- Service working directory after final deploy: `/data/projects/codex-zone/codexmux`

## 수정 내용

- Android foreground 복귀 시 stale WebSocket을 강제 reconnect하고, foreground grace window 안의 expected terminal/timeline connection error를 console error로 남기지 않게 했다.
- native Capacitor lifecycle fallback은 page load 후에도 다시 설치되어 원격 page에서 `window.Capacitor.triggerEvent`가 없는 경우의 `pause`/`resume` 예외를 막는다.
- production rebuild 뒤 실행 중인 service cwd가 삭제된 `.next/standalone`을 가리켜도 daily report `codex exec`와 build info가 `__CMUX_APP_DIR` 기준으로 동작하게 했다.
- Android WebView DevTools 기반 `smoke:android:foreground`와 `smoke:android:recovery`를 추가해 foreground reconnect, fresh app data clear first-run, network/HTTP/SSL recovery를 반복 실행할 수 있게 했다.
- `/login` 같은 인증 전 public route에서는 status/native notification/Web Push/service worker runtime service를 마운트하지 않아 fresh install 후 auth WebSocket과 service worker redirect console noise를 막는다.
- 임시 server/HOME/tmux tab 기반 `smoke:permission`을 추가해 permission prompt 상태 경로를 실제 WebSocket/API/stdin 흐름으로 검증한다.

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| `corepack pnpm vitest run tests/unit/lib/app-route-state.test.ts tests/unit/scripts/android-webview-smoke-lib.test.ts tests/unit/android-launcher.test.ts tests/unit/lib/foreground-reconnect.test.ts tests/unit/lib/permission-prompt.test.ts` | 5 files / 25 tests passed |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm build:electron` | passed |
| `corepack pnpm smoke:runtime-v2:phase2` | passed |
| `corepack pnpm smoke:android:install` | passed, `versionName=0.3.3`, `versionCode=303` |
| Tailscale Serve HTTPS `/api/health` | 200, `version=0.3.3`, commit/buildTime metadata present |
| `corepack pnpm smoke:android:foreground` | 2회 background/foreground, app info bridge, `triggerEvent`/TypeError 0, blocking console/logcat 0 |
| `CODEXMUX_ANDROID_BACKGROUND_MS=60000 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground` | `/login` surface, 60초 background 후 foreground 복귀, console 0, blocking logcat 0 |
| `CODEXMUX_ANDROID_CLEAR_APP_DATA=1 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground` | app data clear 후 `/login` 첫 실행, console event 0, blocking logcat 0 |
| `corepack pnpm smoke:android:recovery` | network, HTTP 4xx, SSL 실패 후 launcher 복귀와 `/login` 재연결, blocking console/logcat 0 |
| Stats/daily report | overview/list 200, `2026-05-03` report generate 200 |
| Windows sync dry-run | candidates 5, 14.8 MiB, errors 0 |
| `corepack pnpm smoke:permission` | temp server/HOME/tmux tab, `needs-input`, option parsing, stdin `2`, `status:ack-notification` 후 `busy` 복귀 |

## 남은 릴리스 리스크

- 실제 Codex CLI가 만든 permission prompt 재현 smoke는 P1에 남긴다. codexmux의 status/tmux/API/stdin 경로는 `smoke:permission`으로 검증했다.
- Android logged-in session 장시간 background, 반복 foreground reconnect, input draft 보존은 수십 분 이상 smoke 증거가 더 필요하다. `/login` surface 60초 background smoke는 통과했고, `smoke:android:foreground`는 `CODEXMUX_ANDROID_BACKGROUND_MS`와 `CODEXMUX_ANDROID_FOREGROUND_ROUNDS`로 강도를 올려 실행할 수 있다.
- Runtime v2는 Phase 2 gate가 통과했지만 Android WebView가 실제 `/api/v2/terminal` tab에 attach하는 foreground smoke는 아직 별도 항목이다.
- Electron은 `build:electron`까지 통과했고 `pack:electron:dev` 또는 signed/notarized package 산출물 검증은 남아 있다.
- Windows는 Linux dry-run만 통과했다. 실제 Windows Scheduled Task `Install -RunNow`, `Status`, `RunOnce`와 장시간 sync log/token 권한 확인이 필요하다.
- iPad Safari/Home Screen foreground reconnect는 Android와 별도로 확인해야 한다.

## 운영 기준

- live checkout에서 `corepack pnpm build:electron`을 실행한 뒤에는 `.next/standalone`이 다시 만들어질 수 있으므로 `corepack pnpm deploy:local`로 service를 재시작해 cwd를 정상화한다.
- Android native bridge를 바꾸지 않은 React/server reconnect 수정은 APK 재배포 없이 live server build/restart로 반영된다.
- Android native file, `android-web/` launcher asset, version metadata를 바꾸면 debug/release APK를 다시 빌드해 설치한다.
