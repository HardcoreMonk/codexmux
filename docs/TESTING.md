# Testing And Smoke Guide

이 문서는 codexmux의 자동 검증, platform smoke, 운영 smoke를 한곳에 묶는다. 개별
platform 세부는 `ANDROID.md`, `ELECTRON.md`, `SYSTEMD.md`, `RUNTIME-V2-CUTOVER.md`를
따르며, 이 문서는 어떤 검증을 언제 실행할지에 집중한다.

## Baseline

일반 코드 변경의 기본 검증:

```bash
corepack pnpm test
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
```

terminal, status, timeline, sync, runtime v2, platform shell을 건드린 변경은 아래
smoke 중 관련 항목을 추가한다. 문서만 바꾼 경우에도 링크와 명령이 맞는지 확인하기 위해
`corepack pnpm lint` 또는 `corepack pnpm build:landing`을 선택적으로 실행한다.

## Browser UI And Playwright

`@playwright/test`는 dev dependency로 설치되어 있으며, Playwright 관리 Chromium은
로컬 cache에 설치된다. 브라우저 바이너리는 git에 커밋하지 않는다.

새 개발 환경에서 Chromium이 없으면 한 번 설치한다.

```bash
corepack pnpm exec playwright install chromium
corepack pnpm exec playwright --version
```

headless Chromium smoke:

```bash
corepack pnpm exec node -e "const { chromium } = require('@playwright/test'); (async () => { const browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto('data:text/html,<title>playwright-ok</title>'); console.log(await page.title()); await browser.close(); })();"
```

웹 UI 회귀가 보고되면 Playwright를 우선 사용해 실제 DOM과 pointer 동작을 확인한다. 예를
들어 `session-not-found` 복구 overlay가 떠 있을 때 floating `ConnectionStatus`의
`다시 연결` 버튼이 화면에 남아 클릭을 가로막는지 확인하는 식이다. 이 조건은
`src/lib/terminal-recovery.ts`의 순수 helper와 `tests/unit/lib/terminal-recovery.test.ts`
로 먼저 고정하고, 실제 Chromium DOM/pointer smoke는 다음 명령으로 확인한다.

```bash
corepack pnpm smoke:browser-reconnect
```

이 smoke는 temp HOME/server/workspace를 만들고, default terminal tab의 tmux session을
제거한 뒤 `session-not-found` overlay 표시, floating `다시 연결` 버튼 부재, `새 터미널로
시작` pointer click 복구를 확인한다.

## PWA And iPad

iPad는 Safari/Home Screen PWA로 사용한다. 실제 iPad 설치/장시간 background는 수동 smoke지만,
서버가 PWA로 설치 가능한 상태인지는 자동으로 먼저 확인한다.

```bash
corepack pnpm smoke:pwa
CODEXMUX_PWA_SMOKE_URL=https://<machine>.<tailnet>.ts.net corepack pnpm smoke:pwa
```

이 smoke는 `/api/manifest`, `/login`의 iOS head metadata, `apple-touch-icon`,
Android/PWA icon, iPad startup image, `/sw.js`, Playwright iPad Pro viewport console을
확인한다. `/sw.js`는 service worker script이므로 auth redirect 없이 public asset으로
내려와야 하고, 로그인 화면에서는 runtime WebSocket/service worker registration을 시작하지
않아야 한다. iPad startup image는 `scripts/generate-splash.js`로 생성하며, 최초
Home Screen 실행 화면에도 `codexmux` branding만 남아야 한다.

## Runtime v2

Runtime v2 low-level terminal smoke:

```bash
corepack pnpm smoke:runtime-v2
```

기본 명령은 temp HOME/DB 서버를 `CODEXMUX_RUNTIME_V2=1`과 surface mode `off`로 띄운 뒤
기존 low-level target smoke를 실행한다. 이미 떠 있는 runtime v2 서버를 직접 검증하려면
target URL을 지정한다.

```bash
CODEXMUX_RUNTIME_V2_SMOKE_URL=http://127.0.0.1:8122 corepack pnpm smoke:runtime-v2
corepack pnpm smoke:runtime-v2:target
```

Phase 2 app-surface gate:

```bash
corepack pnpm smoke:runtime-v2:phase2
```

이 gate는 temp HOME/DB 서버에서 cookie login, workspace 생성, runtime v2 plain terminal
tab 생성, browser reload reattach, server restart reattach, terminal mode rollback을 확인한다.

Storage dry-run and backup manifest:

```bash
corepack pnpm smoke:runtime-v2:storage-dry-run
corepack pnpm runtime-v2:storage-dry-run
corepack pnpm smoke:runtime-v2:storage-backup
corepack pnpm runtime-v2:storage-backup
corepack pnpm smoke:runtime-v2:storage-import
corepack pnpm runtime-v2:storage-import
corepack pnpm smoke:runtime-v2:storage-write
corepack pnpm smoke:runtime-v2:storage-default-read
```

`smoke:runtime-v2:storage-dry-run`은 fixture에서 workspace group, split layout, legacy tab,
status metadata blocker를 만들고, report가 cwd/workspace name/session name/prompt를 노출하지
않는지 확인한다. `runtime-v2:storage-dry-run`은 실제 `~/.codexmux`의 `workspaces.json`과
workspace별 `layout.json`을 read-only로 검사하고, `runtime-v2/state.db` 전환 전에 필요한
상대 backup manifest와 blocker code를 출력한다. 이 명령은 migration/import를 수행하지 않는다.
`smoke:runtime-v2:storage-backup`은 temp data dir에서 JSON store와 SQLite 파일을 실제로
복사하고, command result가 원문 cwd/session/content를 노출하지 않는지 확인한다.
`runtime-v2:storage-backup`은 live data dir에서 `~/.codexmux/backups/runtime-v2-storage-{timestamp}/`
로 `workspaces.json`, `workspaces/**.json`, `runtime-v2/state.db*`를 복사한다.
`smoke:runtime-v2:storage-import`는 grouped workspace, split layout, message history,
legacy terminal tab, runtime v2 terminal tab, web tab, status metadata를 temp SQLite DB로 import하고, legacy
`pt-` session이 runtime v2 attach/cleanup 대상에 노출되지 않는지 확인한다.
`runtime-v2:storage-import`는 live `~/.codexmux` JSON snapshot을 `runtime-v2/state.db`로
import하지만 production source-of-truth를 바꾸지는 않는다.
`smoke:runtime-v2:storage-write`는 `CODEXMUX_RUNTIME_STORAGE_V2_MODE=write`에서 legacy
layout JSON write 직후 SQLite projection과 status metadata mirror가 갱신되는지 temp
HOME/DB로 확인한다.
`smoke:runtime-v2:storage-default-read`는 `CODEXMUX_RUNTIME_STORAGE_V2_MODE=default`에서
workspace/layout/message-history read가 SQLite projection을 우선 사용하고, legacy JSON write와
`updateActive()` 이후 mirror된 SQLite 값을 다시 읽으며 message-history JSON fallback mirror가
유지되는지 temp HOME/DB로 확인한다.

Storage shadow compare smoke:

```bash
corepack pnpm smoke:runtime-v2:storage-shadow
```

이 smoke는 temp HOME/DB 서버에서 legacy workspace/layout route로 workspace를 만들고 runtime
v2 plain terminal tab을 생성한 뒤, legacy JSON layout에 mirror된 `runtimeVersion: 2` tab과
SQLite runtime layout projection을 read-only로 비교한다. 이 first slice는 v2 tab subset의
상대 순서를 비교하며, cwd 값은 mismatch output에 직접 출력하지 않는다.

Timeline shadow compare smoke:

```bash
corepack pnpm smoke:runtime-v2:timeline-shadow
```

이 smoke는 temp HOME의 allowed Codex JSONL fixture를 만들고 legacy `/api/timeline/*` read
endpoint와 runtime v2 `/api/v2/timeline/*` read endpoint의 message counts와 entries-before
metadata를 비교한다. entry 본문은 mismatch output에 포함하지 않는다.

Status shadow compare smoke:

```bash
corepack pnpm smoke:runtime-v2:status-shadow
```

이 smoke는 Status Worker IPC 경로의 hook reducer, Codex state reducer, notification policy
결과를 legacy pure helper 결과와 비교한다. Status Worker가 polling, ack/dismiss, Web Push,
session history side effect를 소유한다는 의미는 아니다.

`smoke:runtime-v2:phase2`, `smoke:android:runtime-v2`, `smoke:electron:runtime-v2`는 각각
임시 서버와 Next.js dev runtime을 띄운다. 같은 checkout에서 병렬 실행하면 Next dev lock
때문에 `Another next dev server is already running`으로 실패할 수 있으므로 순차 실행한다.

Runtime v2 reconnect/restart 변경의 최소 검증:

```bash
corepack pnpm test tests/unit/lib/terminal-recovery.test.ts tests/unit/lib/layout-store.test.ts tests/unit/lib/runtime/supervisor.test.ts
corepack pnpm smoke:runtime-v2:phase2
```

## Electron

```bash
corepack pnpm build:electron
corepack pnpm smoke:electron:attach
corepack pnpm smoke:electron:runtime-v2
```

- `smoke:electron:attach`: live server attach, preload bridge, reload, blocking console 0건.
- `smoke:electron:runtime-v2`: temp runtime v2 server, Electron page context cookie auth,
  `/api/v2/terminal` marker output, 기본 2회 reload/reconnect.

macOS packaging smoke:

```bash
corepack pnpm pack:electron:dev
```

Packaged app attach/runtime v2 smoke on macOS:

```bash
CODEXMUX_ELECTRON_APP_PATH=release/mac-arm64/codexmux.app \
  corepack pnpm smoke:electron:attach

CODEXMUX_ELECTRON_APP_PATH=release/mac-arm64/codexmux.app \
CODEXMUX_ELECTRON_WINDOW_FOREGROUND_CYCLES=1 \
  corepack pnpm smoke:electron:runtime-v2
```

x64 build는 `CODEXMUX_ELECTRON_APP_PATH=release/mac/codexmux.app`를 사용한다.
`CODEXMUX_ELECTRON_RUNTIME_V2_APP_PATH`는 runtime v2 smoke에만 적용되는
override이고, `CODEXMUX_ELECTRON_WINDOW_FOREGROUND_CYCLES`는 0-5회
foreground probe로 clamp된다. CDP `Browser.*` window bounds가 있으면
minimize/restore를 쓰고, 없으면 `Target.activateTarget`/`Page.bringToFront`
fallback을 쓰며 실제 method는 smoke JSON의 checks에 남는다.

Linux checkout에서는 `corepack pnpm build:electron`까지를 Electron bundle smoke로 본다.
macOS DMG/zip packaging은 Darwin native dependency 때문에 macOS host에서 실행한다.
Electron build나 packaging smoke 뒤에는 `.next/standalone`이 다시 만들어질 수 있으므로
live user service는 `corepack pnpm deploy:local`로 재시작한다.

## Android

```bash
corepack pnpm android:build:debug
corepack pnpm android:install
corepack pnpm smoke:android:install
corepack pnpm smoke:android:foreground
corepack pnpm smoke:android:recovery
corepack pnpm smoke:android:runtime-v2
```

- `smoke:android:foreground`: Tailscale Serve HTTPS target, background/foreground 복귀,
  native bridge, `triggerEvent` fallback, blocking console/logcat.
- `smoke:android:recovery`: network, HTTP 4xx, SSL 실패 뒤 launcher 복귀와 저장 서버 재연결. DevTools target lifetime flake를 피하기 위해 failure class별 독립 app start로 검증하며, 기본 HTTP 4xx는 live target의 missing path를 사용한다.
- `smoke:android:runtime-v2`: temp runtime v2 server를 Tailscale IP로 노출하고 Android
  WebView에서 `/api/v2/terminal` attach와 foreground reconnect marker output을 확인.

강도 조절:

```bash
CODEXMUX_ANDROID_BACKGROUND_MS=60000 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground
CODEXMUX_ANDROID_CLEAR_APP_DATA=1 corepack pnpm smoke:android:foreground
CODEXMUX_ANDROID_RESTART_APP=1 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=0 corepack pnpm smoke:android:foreground
CODEXMUX_ANDROID_RUNTIME_V2_TIMEOUT_MS=60000 corepack pnpm smoke:android:runtime-v2
```

React/server reconnect 수정은 APK 재빌드 없이 `corepack pnpm deploy:local`로 반영된다.
`CodexmuxAndroid` native bridge, Android manifest, launcher asset, version metadata를 바꾸면
APK를 다시 빌드해 설치한다.

## Permission, Stats, Timeline

```bash
corepack pnpm smoke:permission
```

이 smoke는 임시 server/HOME/tmux tab에서 permission prompt option parsing, stdin 선택 전달,
`needs-input` 전환, `status:ack-notification` 후 `busy` 복귀를 확인한다.

통계와 daily report는 live 또는 temp 서버에서 `/api/stats/*`와 daily report generate route가
200을 반환하는지 확인한다. timeline 중복 회귀는 browser reload 후 같은 assistant text가
`event_msg.agent_message`와 paired `response_item.message`로 남은 JSONL에서도 한 번만
표시되는지 확인한다.

## Systemd And Live Deploy

```bash
corepack pnpm deploy:local
curl -fsS http://127.0.0.1:8122/api/health
systemctl --user show codexmux.service --property=ActiveState,SubState,ExecMainPID,Result,NRestarts,WorkingDirectory
journalctl --user -u codexmux.service --since '10 minutes ago' -p warning --no-pager
```

Tailscale Serve HTTPS smoke:

```bash
curl -fsS https://<machine>.<tailnet>.ts.net/api/health
```

`/api/health.commit`은 현재 배포된 build의 source commit이다. docs-only commit을 push했지만
deploy하지 않은 경우 live health commit이 main HEAD보다 뒤에 있을 수 있다.

## Windows Sync

Temp server에서 Windows companion upload 경로를 자동 검증:

```bash
corepack pnpm smoke:windows-sync
```

이 smoke는 임시 HOME/server와 Windows-like Codex JSONL fixture를 만들고,
`scripts/windows-codex-sync.mjs`의 `--once --dry-run`, 실제 upload, local offset state
resume, `/api/remote/codex/sources`, `/api/timeline/sessions?source=remote` 노출을 확인한다.

Linux에서 server 대상 dry-run:

```powershell
node .\scripts\windows-codex-sync.mjs `
  --server http://<codexmux-server>:8122 `
  --token-file "$env:USERPROFILE\.codexmux\cli-token" `
  --source-id win11-main `
  --shell pwsh `
  --once `
  --dry-run
```

실제 운영 smoke는 Windows 현재 사용자 Scheduled Task의 `Install -RunNow`, `Status`,
`RunOnce`와 live `/api/remote/codex/sources`,
`/api/timeline/sessions?source=remote&sourceId=<sourceId>` 200 응답 확인까지 포함한다.
장시간 task restart result, log rotation 필요성, token file 권한은 운영 관찰로 이어간다.

## Windows Terminal Bridge

서버 단위 검증:

```bash
corepack pnpm vitest run tests/unit/lib/remote-terminal-store.test.ts tests/unit/lib/terminal-websocket-url.test.ts
```

Windows 실기기 smoke:

```powershell
$env:CMUX_URL = "http://<codexmux-server>:8122"
$env:CMUX_TOKEN = "<server ~/.codexmux/cli-token content>"
corepack pnpm windows:terminal-bridge -- --source-id "win11-main"
```

Browser에서 `/windows-terminal?sourceId=win11-main`을 열고 `pwd`, `Get-Location`,
`node --version` 같은 짧은 command의 입력/출력, resize 반응, browser reload 후
recent output snapshot과 reconnect 상태를 확인한다.
`/api/remote/terminal/sources`가 200과 terminal status를 반환해야 한다.
