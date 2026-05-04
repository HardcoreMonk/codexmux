# 2026-05-03 Android Runtime Stabilization Handoff

## 배포 상태

- Stabilization base commit: `b038ddd` (`Suppress Android foreground reconnect noise`)
- P0/P1 automation commit: `006100e` (`Add Android WebView smoke automation`)
- Runtime v2 reconnect recovery commit: `4351cf8` (`Fix runtime v2 reconnect recovery`)
- Android runtime v2 smoke stabilization commit: `6013c86` (`Stabilize Android runtime v2 smoke`)
- Playwright browser tooling commit: `5da4097` (`Add Playwright test tooling`)
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
- Runtime v2 Terminal Worker/service restart는 retryable close로 client fresh attach를 유도한다.
- `session-not-found` 상태의 runtime v2 tab restart는 legacy tmux가 아니라 Supervisor/Storage/Terminal Worker 경로로 같은 tab id/session name을 재생성한다.
- desktop browser와 mobile surface 모두 blocking recovery overlay가 활성화되면 floating `다시 연결` control을 숨겨, 보이지만 클릭되지 않는 중복 UI를 만들지 않는다.
- Playwright/Chromium tooling을 추가해 웹 DOM/pointer 회귀를 실제 browser에서 검증할 수 있게 했다.

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| `corepack pnpm test` | 73 files / 385 tests passed |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |
| `corepack pnpm build` | passed |
| `corepack pnpm exec playwright --version` + headless Chromium launch | Playwright 1.59.1, Chromium launch passed |
| `corepack pnpm build:electron` | passed |
| `corepack pnpm smoke:electron:attach` | live server attach, Electron preload bridge, page reload, blocking console 0 |
| `corepack pnpm smoke:electron:runtime-v2` | temp runtime v2 server, Electron page-context `/api/v2/terminal` cookie-auth attach, initial + 2회 page reload/reconnect marker output |
| Mac M1 `pnpm pack:electron:dev` | passed, arm64/x64 DMG and zip artifacts created; native binding, app arch, Info.plist, and `hdiutil verify` passed |
| `corepack pnpm smoke:runtime-v2:phase2` | passed |
| `corepack pnpm smoke:android:install` | passed, `versionName=0.3.3`, `versionCode=303` |
| Tailscale Serve HTTPS `/api/health` | 200, `version=0.3.3`, commit/buildTime metadata present |
| `corepack pnpm smoke:android:foreground` | 2회 background/foreground, app info bridge, `triggerEvent`/TypeError 0, blocking console/logcat 0 |
| `corepack pnpm smoke:android:runtime-v2` | SM-S928N Android 16, temp runtime v2 server via `http://100.112.40.104:<port>`, initial + 2회 foreground `/api/v2/terminal` marker output, blocking console/logcat 0 |
| `CODEXMUX_ANDROID_FOREGROUND_ROUNDS=0 CODEXMUX_ANDROID_RESTART_APP=1 corepack pnpm smoke:android:foreground` | native restart 후 `/login` 복귀, app info bridge, console 0, blocking logcat 0 |
| `CODEXMUX_ANDROID_BACKGROUND_MS=60000 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground` | `/login` surface, 60초 background 후 foreground 복귀, console 0, blocking logcat 0 |
| `CODEXMUX_ANDROID_CLEAR_APP_DATA=1 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground` | app data clear 후 `/login` 첫 실행, console event 0, blocking logcat 0 |
| `corepack pnpm smoke:android:recovery` | network, HTTP 4xx, SSL 실패 후 launcher 복귀와 `/login` 재연결, blocking console/logcat 0 |
| Stats/daily report | overview/list 200, `2026-05-03` report generate 200 |
| `corepack pnpm smoke:permission` | temp server/HOME/tmux tab, `needs-input`, option parsing, stdin `2`, `status:ack-notification` 후 `busy` 복귀 |

## 남은 릴리스 리스크

- 실제 Codex CLI가 만든 permission prompt 재현 smoke는 P1에 남긴다. codexmux의 status/tmux/API/stdin 경로는 `smoke:permission`으로 검증했다.
- Android logged-in session 장시간 background, 반복 foreground reconnect, input draft 보존은 수십 분 이상 smoke 증거가 더 필요하다. `/login` surface 60초 background smoke는 통과했고, `smoke:android:foreground`는 `CODEXMUX_ANDROID_BACKGROUND_MS`와 `CODEXMUX_ANDROID_FOREGROUND_ROUNDS`로 강도를 올려 실행할 수 있다.
- Runtime v2는 Phase 2 gate, Electron page-context `/api/v2/terminal` attach/output/reconnect, Android WebView `/api/v2/terminal` foreground reconnect가 통과했다. timeline/status/storage v2 surface 전환 증거는 별도 항목이다.
- 웹페이지의 `다시 연결` 클릭 불가 회귀는 unit helper와 runtime v2 phase2 smoke로 고정했다. 실제 DOM/pointer e2e는 Playwright tooling이 준비됐으므로 다음 browser reconnect spec으로 남긴다.
- Electron은 `build:electron`, live attach smoke, runtime v2 page-context attach/output/reconnect, Mac M1 `pack:electron:dev` 산출물 검증까지 통과했다. SSH 세션의 macOS GUI launch domain 제한 때문에 막힌 Finder 더블클릭 실행/Gatekeeper UX와 packaged OS-level foreground UX는 별도로 확인한다.
- iPad Safari/Home Screen foreground reconnect는 Android와 별도로 확인해야 한다.

## 운영 기준

- live checkout에서 `corepack pnpm build:electron`을 실행한 뒤에는 `.next/standalone`이 다시 만들어질 수 있으므로 `corepack pnpm deploy:local`로 service를 재시작해 cwd를 정상화한다.
- Android native bridge를 바꾸지 않은 React/server reconnect 수정은 APK 재배포 없이 live server build/restart로 반영된다.
- Android native file, `android-web/` launcher asset, version metadata를 바꾸면 debug/release APK를 다시 빌드해 설치한다.
