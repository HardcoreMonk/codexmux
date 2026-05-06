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

status update를 codex-ai-bridge external trace로 전달하는 경로를 바꾸면 다음 focused test를
기본 검증에 추가한다.

```bash
corepack pnpm test tests/unit/lib/bridge-trace-forwarder.test.ts
corepack pnpm tsc --noEmit
```

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

Timeline live shadow unit coverage:

```bash
corepack pnpm test tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/timeline-mode.test.ts tests/unit/lib/runtime/timeline-shadow-compare.test.ts tests/unit/lib/runtime/timeline-live-shadow.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts
```

이 검증은 `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=shadow`에서 legacy `/api/timeline`이 계속
client-facing인 상태로 Timeline Worker live subscription을 시작하고, 초기 init reply와
append event를 sanitized metadata로 비교하는 경로를 확인한다. 별도 long JSONL append smoke와
timeline WebSocket default 전환 검증은 `smoke:runtime-v2:timeline-websocket-default`에서 확인한다.

Timeline default-read route unit coverage:

```bash
corepack pnpm test tests/unit/lib/runtime/timeline-mode.test.ts tests/unit/pages/timeline-sessions.test.ts tests/unit/pages/timeline-read-default.test.ts
```

이 검증은 `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`에서 기존 `/api/timeline/sessions`,
`/api/timeline/entries`, `/api/timeline/message-counts` HTTP URL이 Timeline Worker read
command로 route되는지 확인한다. `/api/timeline` WebSocket delivery는 별도
`timeline-ws.test.ts`와 `smoke:runtime-v2:timeline-websocket-default`에서 검증한다.

Timeline live shadow long append smoke:

```bash
corepack pnpm smoke:runtime-v2:timeline-live-shadow
```

이 smoke는 temp HOME/server에서 tmux pane 안에 `codex`로 감지되는 장기 프로세스를 띄우고,
allowed Codex JSONL fixture를 active session처럼 감지시킨다. Legacy `/api/timeline`
WebSocket이 `timeline:init`과 24개 append entry를 받는지, assistant append id가 중복되지
않는지, `runtime_v2.timeline_shadow.*` perf counter에서 init/append match가 기록되고
mismatch/error가 0인지 확인한다. 출력에는 prompt, assistant text, cwd, JSONL path, terminal
output을 포함하지 않는다.

Timeline resume safety smoke:

```bash
corepack pnpm smoke:runtime-v2:timeline-resume-safety
```

이 smoke는 temp HOME/server에서 `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`를 켠 뒤
foreground process가 shell이 아닌 tmux pane에 `/api/timeline` WebSocket으로 resume을 보내
`timeline:resume-blocked`와 `reason="process-running"`을 확인한다. WebSocket default 전환 후에도
runtime bridge가 기존 process-safety guard를 유지하는 rollback evidence로 사용하며, 출력에는 prompt, assistant text, cwd,
JSONL path, terminal output, token을 포함하지 않는다.

Timeline session-changed smoke:

```bash
corepack pnpm smoke:runtime-v2:timeline-session-changed
```

이 smoke는 temp HOME/server에서 `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`를 켠 뒤
Codex process가 먼저 감지되고 JSONL이 나중에 생성되는 상황을 만든다. Legacy `/api/timeline`
WebSocket이 빈 init 이후 `timeline:session-changed` with `reason="new-session-started"`를
먼저 보내고, 그 다음 새 JSONL의 `timeline:init`을 보내는지 확인한다. 출력에는 prompt,
assistant text, cwd, JSONL path, terminal output, token을 포함하지 않는다.

Timeline WebSocket default smoke:

```bash
corepack pnpm smoke:runtime-v2:timeline-websocket-default
```

이 smoke는 temp HOME/server에서 `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`를 켠 뒤
Codex process와 allowed Codex JSONL fixture가 있는 상태로 legacy `/api/timeline`
WebSocket을 연다. `timeline:init` 이후 JSONL에 entry 하나를 append하고
`timeline:append`를 받은 다음 `/api/debug/perf`에서
`runtime_v2.timeline_ws.default.init`과 `runtime_v2.timeline_ws.default.append` counter가
기록됐는지 확인한다. 출력에는 prompt, assistant text, cwd, JSONL path, tmux output,
auth cookie, token을 포함하지 않는다.

Timeline session watcher contract unit coverage:

```bash
corepack pnpm test tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts
```

이 검증은 Timeline Worker의 `timeline.session-watch-subscribe`/`timeline.session-watch-unsubscribe`
IPC payload, subscriber-scoped `timeline.session-changed` event schema, Worker watcher stop
cleanup, Supervisor event fan-out을 확인한다. 이 unit coverage는 내부 contract 검증이며
client-facing `/api/timeline` WebSocket ownership은 `tests/unit/lib/runtime/timeline-ws.test.ts`와
default WebSocket smoke에서 별도로 검증한다.

Status shadow compare smoke:

```bash
corepack pnpm smoke:runtime-v2:status-shadow
corepack pnpm smoke:runtime-v2:status-default
```

이 smoke는 Status Worker IPC 경로의 hook reducer, Codex state reducer, notification policy,
side-effect intent, ack/dismiss client-event intent 결과를 legacy pure helper 결과와 비교한다.
Side-effect intent는 session history write, Web Push send, JSONL watcher start/stop 같은
boolean decision만 비교하며 payload 본문은 출력하지 않는다. Client-event intent는
ready-for-review dismiss와 needs-input ack acceptance만 비교한다.

`smoke:runtime-v2:status-default`는 temp HOME/server에서 `CODEXMUX_RUNTIME_V2=1`과
`CODEXMUX_RUNTIME_STATUS_V2_MODE=default`를 켜고 기존 permission prompt smoke를 실행한다.
이 gate는 `/api/status` WebSocket이 Status Worker live bridge를 사용해 initial sync,
hook-driven `needs-input`, `status:ack-notification` 후 `busy` 복귀를 유지하는지 확인한다.
default mode에서는 worker process 안의 StatusManager가 polling, JSONL watcher, ack/dismiss,
session history update, Web Push send, rate-limit update를 소유한다.

Runtime v2 Phase 6 default gate:

```bash
corepack pnpm test tests/unit/lib/runtime/terminal-mode.test.ts tests/unit/lib/runtime/storage-mode.test.ts tests/unit/lib/runtime/timeline-mode.test.ts tests/unit/lib/runtime/status-mode.test.ts tests/unit/pages/runtime-v2-api.test.ts
corepack pnpm test tests/unit/scripts/runtime-v2-phase6-gate-lib.test.ts
corepack pnpm smoke:runtime-v2:phase6-default-gate
```

`smoke:runtime-v2:phase6-default-gate`는 기본적으로 live `http://127.0.0.1:8122`를
조회하고, 필요하면 `CODEXMUX_RUNTIME_V2_PHASE6_GATE_URL` 또는
`CODEXMUX_RUNTIME_V2_SMOKE_URL`로 target을 바꾼다. 이 smoke는 `/api/v2/runtime/health`의
terminal `new-tabs`, storage/timeline/status `default`, worker health `ok`와
`/api/debug/perf`의 runtime worker failure/restart/timeout counter 0을 확인한다.
workspace나 terminal을 만들지 않는 read-only gate이며 token, cwd, session name,
JSONL path, prompt, assistant text, terminal output 원문을 출력하지 않는다.
Mode helper unit tests는 raw parser가 unset/invalid를 계속 `off`로 fail-closed하는 것과,
`CODEXMUX_RUNTIME_V2=1`에서 per-surface mode env가 unset일 때 resolved code fallback이
terminal `new-tabs`, storage/timeline/status `default`가 되는 것을 함께 검증한다.

`smoke:runtime-v2:phase2`, `smoke:android:runtime-v2`, `smoke:electron:runtime-v2`는 각각
임시 서버와 Next.js dev runtime을 띄운다. 같은 checkout에서 병렬 실행하면 Next dev lock
때문에 `Another next dev server is already running`으로 실패할 수 있으므로 순차 실행한다.

Runtime v2 reconnect/restart 변경의 최소 검증:

```bash
corepack pnpm test tests/unit/lib/terminal-recovery.test.ts tests/unit/lib/layout-store.test.ts tests/unit/lib/runtime/supervisor.test.ts
corepack pnpm smoke:runtime-v2:phase2
```

Lifecycle Control panel 변경의 최소 검증:

```bash
corepack pnpm test tests/unit/lib/runtime-lifecycle-control.test.ts tests/unit/lib/runtime-lifecycle-actions.test.ts tests/unit/pages/runtime-lifecycle-action-api.test.ts tests/unit/components/lifecycle-control-panel.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
```

이 panel은 `/experimental/runtime`의 운영 evidence surface이자 제한된 action launcher다.
인증된 session에서 page를 열고 release metadata, terminal/storage/timeline/status mode,
24시간 observation gate, worker restart/timeout/failure, perf timing, rollback runbook,
Lifecycle Actions section이 표시되는지 확인한다.
`tests/unit/components/lifecycle-control-panel.test.ts`는 `react-dom/server` 기반 SSR render
test로 import boundary와 hydration-sensitive timestamp formatting을 함께 고정한다.
`/api/debug/perf` 또는 runtime health가 일시 실패해도 가능한 section은 계속 렌더링되어야 하며,
오류 상세나 worker diagnostic이 token, cwd, session name, JSONL path, prompt, assistant text,
terminal output 원문을 노출하지 않는지 함께 확인한다.

Lifecycle action API는 command text를 받지 않고 `phase6-gate`, `restart-service`,
`deploy-local` action id만 허용한다. `restart-service`와 `deploy-local`은 각각
`restart codexmux.service`, `deploy local` exact confirmation이 필요하다. Audit은
`~/.codexmux/lifecycle-actions.jsonl`에 sanitized status event와 failure label만 남기며 stdout/stderr,
env, cwd, prompt, terminal output은 저장하지 않는다. Rollback flag mutation과 systemd
drop-in 편집은 아직 UI action이 아니며 copy-only runbook으로 유지한다.

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
corepack pnpm smoke:android:timeline-foreground
```

- `smoke:android:foreground`: Tailscale Serve HTTPS target, background/foreground 복귀,
  native bridge, `triggerEvent` fallback, blocking console/logcat.
- `smoke:android:recovery`: network, HTTP 4xx, SSL 실패 뒤 launcher 복귀와 저장 서버 재연결. DevTools target lifetime flake를 피하기 위해 failure class별 독립 app start로 검증하며, 기본 HTTP 4xx는 live target의 missing path를 사용한다.
- `smoke:android:runtime-v2`: temp runtime v2 server를 Tailscale IP로 노출하고 Android
  WebView에서 `/api/v2/terminal` attach와 foreground reconnect marker output을 확인.
- `smoke:android:timeline-foreground`: temp runtime v2 server를 Tailscale IP로 노출하고
  Android WebView page context에서 `/api/timeline` WebSocket init을 확인한다. 각 foreground
  round는 background 중 fixture JSONL에 entry를 추가한 뒤 foreground 복귀 후 새 WebSocket
  init의 `totalEntries`가 증가했는지 확인해 stale JSONL reconnect를 잡는다. 종료 cleanup은
  `CODEXMUX_ANDROID_RESTORE_URL` 또는 기본 Tailscale Serve URL로 WebView를 되돌리고
  restore origin의 `readyState=complete`를 확인하지 못하면 실패한다.

강도 조절:

```bash
CODEXMUX_ANDROID_BACKGROUND_MS=60000 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground
CODEXMUX_ANDROID_CLEAR_APP_DATA=1 corepack pnpm smoke:android:foreground
CODEXMUX_ANDROID_RESTART_APP=1 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=0 corepack pnpm smoke:android:foreground
CODEXMUX_ANDROID_RUNTIME_V2_TIMEOUT_MS=60000 corepack pnpm smoke:android:runtime-v2
CODEXMUX_ANDROID_TIMELINE_FOREGROUND_TIMEOUT_MS=60000 corepack pnpm smoke:android:timeline-foreground
```

React/server reconnect 수정은 APK 재빌드 없이 `corepack pnpm deploy:local`로 반영된다.
`CodexmuxAndroid` native bridge, Android manifest, launcher asset, version metadata를 바꾸면
APK를 다시 빌드해 설치한다.

## Smoke Artifact Evidence

Smoke scripts that support release evidence write sanitized JSON when
`CODEXMUX_SMOKE_ARTIFACT_DIR` is set:

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:browser-reconnect
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:electron:runtime-v2
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:android:foreground
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:android:runtime-v2
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:android:timeline-foreground
```

Artifacts preserve pass/fail state, check names, runtime/app/device metadata, reconnect round
counts, and blocking console/logcat counts. They do not preserve token values, temp HOME paths,
session identifiers, target URLs, server stdout/stderr, prompt body, terminal output, or Codex
JSONL paths.

The release workflow runs `smoke:browser-reconnect` on GitHub-hosted Ubuntu and uploads
`smoke-browser-reconnect`. Android and packaged Electron smoke remain manual or self-hosted
because they require a real device or macOS app bundle context.

### Platform smoke artifacts

`Platform Smoke Artifacts` is a manual `workflow_dispatch` workflow for collecting smoke JSON
outside the tag release path. Browser reconnect can run on GitHub-hosted Ubuntu. Electron runtime
v2 can run on GitHub-hosted macOS when the runner supports Electron DevTools. Android
foreground/runtime/timeline smokes require a self-hosted runner labeled `codexmux-android`;
GitHub-hosted runners do not provide the required real device, ADB session, WebView DevTools
target, or Tailscale route.

Local operations batch evidence:

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-ops-smoke corepack pnpm smoke:ops:batch
```

The batch runs browser reconnect automatically and writes an `ops-smoke-batch` artifact. Set
`CODEXMUX_OPS_SMOKE_PWA_URL` or `CODEXMUX_OPS_SMOKE_RUNTIME_URL` to include PWA and runtime Phase 6
target checks. iPad long-background and Mac packaged UX rows stay `manual-required` unless real
device/package evidence is collected outside the runner.

Six-item operations automation batch:

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-ops-automation corepack pnpm ops:automation:batch
```

This higher-level batch records rows for the approved 1~6 operations items: release/CI artifact
workflow contract, live perf snapshot and stats reuse counters, approval queue focused tests,
lifecycle rollback dry-run evidence, local long/external smoke evidence, and Post-MVP backlog
deferral docs. It uses the local `~/.codexmux/cli-token` or `CODEXMUX_TOKEN` for authenticated
perf/stats calls and writes an `ops-automation-batch` artifact. Hardware-only iPad and packaged
Mac checks remain `manual-required` through the nested `smoke:ops:batch` row.

Full backlog batch plan:

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-plan corepack pnpm ops:backlog:batch-plan
```

This read-only planner turns the remaining backlog into eight stable batch lanes:
release operations, platform/external devices, runtime/lifecycle, approval workflow,
performance, Codex provider lifecycle, app-server adapter, and architecture/docs. Each row is
classified as `automated`, `conditional`, `manual-required`, or `spec-required`, with explicit
`corepack pnpm ...` commands where a local command exists. The planner writes an
`ops-backlog-batch-plan` artifact and does not run release mutations, service restarts, hardware
smokes, or undefined Post-MVP implementation work.

Full backlog automated batch runner:

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-run corepack pnpm ops:backlog:batch-run
```

The runner consumes the backlog plan, runs only `automated` rows by default, deduplicates repeated
`corepack pnpm ...` commands, writes an `ops-backlog-batch-run` artifact, and records
`conditional`, `manual-required`, and `spec-required` rows as skipped. It stops on the first failed
command unless `CODEXMUX_BACKLOG_BATCH_CONTINUE_ON_FAILURE=1` is set. Use
`CODEXMUX_BACKLOG_BATCH_DRY_RUN=1` to print and artifact the plan without running commands. Use
`CODEXMUX_BACKLOG_BATCH_INCLUDE_CONDITIONAL=1` only in an explicit release/device window; that mode
can include release mutation or Android-device commands and is not the default.

## Permission, Stats, Timeline

```bash
corepack pnpm smoke:permission
```

이 smoke는 임시 server/HOME/tmux tab에서 permission prompt option parsing, stdin 선택 전달,
`needs-input` 전환, `status:ack-notification` 후 `busy` 복귀를 확인한다.
`tests/unit/lib/permission-prompt.test.ts`는 Codex resume working directory prompt를
입력 선택지로 파싱하는지 검증하고, `tests/unit/lib/codex-pane-state.test.ts`는 JSONL
interrupt marker 없이 남은 `Conversation interrupted` 입력 프롬프트를 감지하는지 검증한다.
실제 live Codex prompt 회귀는 notification panel에서 선택지가 보이고 `/api/tmux/permission-options`
가 동일한 option list를 반환하는지 확인한다.

Approval queue metadata 변경의 최소 검증:

```bash
corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts tests/unit/lib/approval-queue.test.ts tests/unit/lib/push-deep-link.test.ts tests/unit/lib/approval-audit-store.test.ts tests/unit/pages/permission-options-api.test.ts tests/unit/pages/approval-audit-api.test.ts
corepack pnpm smoke:permission
```

이 검증은 command/file/permission/resume/conversation prompt metadata, 민감정보 비노출,
기존 option index 선택, push click deep link fallback, approval audit JSONL redaction,
`needs-input -> busy` ack 전이를 확인한다.

통계와 daily report는 live 또는 temp 서버에서 `/api/stats/*`와 daily report generate route가
200을 반환하는지 확인한다. timeline 중복 회귀는 browser reload 후 같은 assistant text가
`event_msg.agent_message`와 paired `response_item.message`로 남은 JSONL에서도 한 번만
표시되는지 확인한다.

Bridge trace forwarding은 env-gated optional path이므로 unit test로 payload boundary를 먼저
고정한다.

```bash
corepack pnpm vitest run tests/unit/lib/bridge-trace-forwarder.test.ts
```

이 검증은 `CODEXMUX_BRIDGE_TRACE_URL`/`CODEXMUX_BRIDGE_TRACE_TOKEN`이 없으면 fetch를
호출하지 않고, 설정된 경우 bearer auth로 summary-only status payload를 보내며 같은 tab의
동일 state/action 조합을 dedupe하는지 확인한다. Discord token, raw transcript, terminal
stdout, auth cookie를 payload에 추가하는 변경은 이 테스트와 `docs/ADR.md`를 함께 갱신해야
한다.

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
