# Electron Development

codexmux의 Electron 앱은 Next.js UI를 데스크톱 shell 안에서 실행합니다. 로컬 모드는 앱이 내부 Node 서버를 띄우고, 원격 모드는 이미 실행 중인 codexmux 서버 URL로 연결합니다.

## Commands

```bash
corepack pnpm dev:electron
corepack pnpm dev:electron:attach
corepack pnpm build:electron
corepack pnpm smoke:electron:attach
corepack pnpm smoke:electron:runtime-v2
corepack pnpm pack:electron:dev
corepack pnpm pack:electron
```

- `dev:electron`: 필요하면 `corepack pnpm dev` 서버를 자동으로 띄운 뒤 Electron을 연결합니다.
- `dev:electron:attach`: 이미 실행 중인 `http://localhost:8122` 서버에 Electron만 붙입니다.
- `build:electron`: Next.js standalone, custom server, Electron main/preload를 빌드합니다.
- `smoke:electron:attach`: Electron shell을 remote debugging port로 실행해 live server attach, preload bridge, page reload, blocking console 오류를 확인합니다.
- `smoke:electron:runtime-v2`: temp HOME/DB runtime v2 서버와 Electron shell을 띄운 뒤 page context에서 existing session cookie로 `/api/v2/terminal` WebSocket attach, marker output, 기본 2회 page reload/reconnect를 확인합니다.
- `pack:electron:dev`: 로컬 macOS 패키징 검증용입니다. signing과 notarize를 끕니다.
- `pack:electron`: 릴리스 패키징입니다. signing/notarize 환경이 필요합니다.

## Runtime

주요 파일:

| File | Purpose |
| --- | --- |
| `electron/main.ts` | BrowserWindow, 메뉴, local/remote 서버 모드, updater |
| `electron/preload.ts` | 안전한 renderer IPC bridge |
| `electron/browser-bridge.ts` | Electron webview 기반 browser panel bridge |
| `scripts/dev-electron.mjs` | dev server 자동 실행 + Electron attach |
| `electron-builder.yml` | macOS 패키징 설정 |

앱 설정은 `~/.codexmux/config.json`에 저장합니다. Electron 전용 설정도 같은 파일을 사용하며, 서버 모드는 `server.mode`과 `server.remoteUrl`로 관리합니다.

Electron renderer는 웹/PWA와 같은 terminal input 정책을 사용합니다. 터미널이나 Codex 입력창에 포커스가 있으면 `Ctrl+D`는 앱 단축키가 아니라 Codex CLI/shell EOF(`0x04`)로 전달되고, macOS pane 분할은 `⌘D`를 사용합니다.

## Attach Smoke

`corepack pnpm smoke:electron:attach`는 현재 build된 `dist-electron/main.js`를 사용해 Electron을 실제로 실행하고 `ELECTRON_DEV_URL` 또는 `CODEXMUX_ELECTRON_SMOKE_URL` 서버에 붙입니다. Chromium remote debugging port로 page target을 찾아 reload 후 다음을 확인합니다.

- live server origin 로드
- `window.electronAPI` preload bridge 주입
- login 또는 app page ready state
- blocking console event 0건

Linux smoke에서는 Electron SUID sandbox 설정이 없는 개발 checkout에서도 실행되도록 Chromium `--no-sandbox`를 붙입니다. 이 smoke는 `.app/.dmg` 패키징을 대체하지 않고, desktop shell attach/preload 회귀를 빠르게 잡는 용도입니다.

## Notifications

- 작업 완료 상태는 foreground toast와 Electron native notification으로 표시할 수 있습니다.
- `soundOnCompleteEnabled=false`이면 completion sound를 재생하지 않고 native notification도 silent로 요청합니다.
- notification 설정은 웹/PWA와 같은 `~/.codexmux/config.json` 값을 공유합니다.

## Server Modes

로컬 서버:

- 앱 실행 시 내부 codexmux 서버를 시작합니다.
- 기본 포트는 `8122`이고, 사용 중이면 임의 포트로 fallback합니다.
- 앱 종료 시 server shutdown과 Electron storage flush를 수행합니다.

원격 서버:

- 메뉴에서 원격 서버 URL을 입력하면 `~/.codexmux/config.json`에 저장합니다.
- URL scheme이 없으면 `http://`를 붙입니다.
- 허용 scheme은 `http://`와 `https://`입니다.

## Runtime v2 Smoke

Electron은 웹/PWA와 같은 React runtime v2 terminal hook을 사용한다. runtime v2
terminal smoke는 먼저 서버 script로 검증하고, Electron에서는 같은 app surface의
existing session cookie로 `/api/v2/terminal` attach가 되는지 확인한다.

1. app-surface Phase 2 gate smoke를 먼저 실행한다. 이 명령은 temp HOME/DB 서버를
   직접 띄워 normal session cookie로 browser reload, server restart, mode-off rollback을
   확인한다.

```bash
corepack pnpm smoke:runtime-v2:phase2
```

2. Electron에서 붙을 서버를 runtime v2 new-tabs mode로 실행한다.

```bash
CODEXMUX_RUNTIME_V2=1 CODEXMUX_RUNTIME_TERMINAL_V2_MODE=new-tabs PORT=8132 corepack pnpm dev
```

3. low-level runtime terminal smoke도 통과시킨다.

```bash
corepack pnpm smoke:runtime-v2
```

4. 자동 Electron page-context smoke를 실행한다. 이 명령은 temp runtime v2
   server/HOME/DB를 띄우고, Electron page에 login cookie를 주입한 뒤
   `/api/v2/terminal` WebSocket으로 marker command 출력이 돌아오는지 확인한다.
   기본값은 initial attach 후 2회 page reload/reconnect이며,
   `CODEXMUX_ELECTRON_RUNTIME_V2_RECONNECT_ROUNDS`로 반복 횟수를 조정한다.

```bash
corepack pnpm smoke:electron:runtime-v2
```

5. packaged Electron 또는 OS window foreground까지 포함한 smoke는 macOS에서
   `.app` bundle을 직접 지정해 실행한다. `.app` 경로를 주면 smoke script가
   `Contents/MacOS/*` 실행 파일을 직접 띄워 DevTools port를 붙인다.
   `CODEXMUX_ELECTRON_WINDOW_FOREGROUND_CYCLES`는 runtime v2 smoke 안에서
   window foreground probe 후 `/api/v2/terminal` marker output을 다시 확인한다.
   Electron/Chromium이 `Browser.*` CDP domain을 노출하면 window minimize/restore를
   사용하고, 그렇지 않으면 `Target.activateTarget`/`Page.bringToFront` fallback을
   사용한다. 실제 사용된 method는 `electron-window-foreground-*-...` check로 출력된다.

```bash
CODEXMUX_ELECTRON_APP_PATH=release/mac-arm64/codexmux.app \
  corepack pnpm smoke:electron:attach

CODEXMUX_ELECTRON_APP_PATH=release/mac-arm64/codexmux.app \
CODEXMUX_ELECTRON_WINDOW_FOREGROUND_CYCLES=1 \
  corepack pnpm smoke:electron:runtime-v2
```

6. Finder 더블클릭, Gatekeeper prompt, Dock/Finder launch domain 환경까지 확인해야 하면
   Electron remote/local shell에서 기존 app workspace 화면을 열고 plain terminal tab을 생성한다.
7. 새 tab이 기존 app surface에 남아 있고 terminal output에 `pwd` 결과가 보이는지 확인한다.
8. Electron shell의 existing session cookie로 `/api/v2/terminal` WebSocket이 열리는지
   확인한다. 별도 query-string token은 사용하지 않는다.
9. Electron 창을 background로 보냈다가 foreground로 되돌린 뒤 같은 tab에서 다시
   attach한다.
10. `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off`로 서버를 재시작하면 새 plain terminal tab은
   legacy로 생성되고 기존 v2 tab은 삭제되지 않으며 runtime v2 disabled diagnostic을 표시하는지 확인한다.
11. terminal output이 fresh attach 후 계속 들어오고 rollback diagnostic이 명확하면 Electron runtime v2 smoke가 통과한
   상태다.

## Build Output

`corepack pnpm build:electron`은 실행 가능한 Electron main/preload bundle과 Next.js standalone server bundle을 생성하지만 `.app` 또는 `.dmg`를 만들지는 않습니다.

| 명령 | 산출물 |
| --- | --- |
| `corepack pnpm build:electron` | `dist/`, `dist-electron/`, `.next/standalone/` |
| `corepack pnpm pack:electron:dev` | `release/` 아래 unsigned local macOS package |
| `corepack pnpm pack:electron` | `release/` 아래 signed/notarized release package |

macOS에서 앱을 실제로 설치하려면 `release/*.dmg` 또는 `release/*/*.app` 산출물이 필요합니다. 현재 repository checkout에 `release/`가 없으면 아직 macOS 앱 패키징을 실행하지 않은 상태입니다.

macOS DMG target은 `dmg-license`와 Darwin native `iconv-corefoundation`을 사용한다. `dmg-license`는 pnpm node linker에서 electron-builder의 runtime `require()`가 항상 해석되도록 direct devDependency로 고정한다. Linux에서는 `corepack pnpm build:electron`까지를 release smoke로 보고, `corepack pnpm pack:electron:dev`/`pack:electron`은 Mac M1 같은 macOS host에서 실행한다.

2026-05-03 P0/P1 pass 기준 `corepack pnpm build:electron`, `corepack pnpm smoke:electron:attach`, `corepack pnpm smoke:electron:runtime-v2`는 통과했다. runtime v2 smoke는 initial attach와 2회 page reload/reconnect 뒤 `/api/v2/terminal` marker output과 console-clean을 확인했다. Linux에서 `corepack pnpm pack:electron:dev`는 macOS DMG target의 Darwin-only optional dependency 때문에 중단됐지만, Mac M1 서버(`Darwin arm64`)에서는 같은 명령이 통과해 `release/codexmux-0.3.3-arm64.dmg`, `release/codexmux-0.3.3-arm64-mac.zip`, `release/codexmux-0.3.3.dmg`, `release/codexmux-0.3.3-mac.zip`을 생성했다. `node scripts/verify-runtime-native-bindings.mjs --electron`, `lipo -archs`, `Info.plist`, `hdiutil verify`도 통과했다. `CODEXMUX_ELECTRON_APP_PATH=<release/.../codexmux.app>`를 주면 attach/runtime-v2 smoke가 packaged `.app` 실행 파일을 직접 띄울 수 있고, `CODEXMUX_ELECTRON_WINDOW_FOREGROUND_CYCLES=1`로 CDP foreground probe 뒤 terminal attach를 반복 확인할 수 있다. Linux Electron 41 smoke에서는 `Browser.*` window bounds가 없어 `target-activate` fallback으로 통과했다. SSH 세션에서는 macOS GUI launch domain 권한 때문에 Finder-style `.app` 실행 smoke가 막히므로, 실제 더블클릭 실행과 Gatekeeper UX는 Mac 화면 세션에서 확인한다. live checkout에서 Electron build/packaging을 실행한 뒤에는 `.next/standalone`이 다시 만들어지므로 Linux user service는 `corepack pnpm deploy:local`로 재시작해 cwd를 정상화한다.

## Packaging Notes

현재 패키징 metadata는 `com.hardcoremonk.codexmux`와 `HardcoreMonk/codexmux`를 기준으로 맞춰져 있습니다.

릴리스 패키징 전에 확인할 항목:

- macOS signing certificate
- Apple notarize credentials
- GitHub release publish 권한
- `node-pty` native binary가 `asarUnpack`에 포함되는지 확인
