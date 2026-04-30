# Electron Development

codexmux의 Electron 앱은 Next.js UI를 데스크톱 shell 안에서 실행합니다. 로컬 모드는 앱이 내부 Node 서버를 띄우고, 원격 모드는 이미 실행 중인 codexmux 서버 URL로 연결합니다.

## Commands

```bash
corepack pnpm dev:electron
corepack pnpm dev:electron:attach
corepack pnpm build:electron
corepack pnpm pack:electron:dev
corepack pnpm pack:electron
```

- `dev:electron`: 필요하면 `corepack pnpm dev` 서버를 자동으로 띄운 뒤 Electron을 연결합니다.
- `dev:electron:attach`: 이미 실행 중인 `http://localhost:8022` 서버에 Electron만 붙입니다.
- `build:electron`: Next.js standalone, custom server, Electron main/preload를 빌드합니다.
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

## Notifications

- 작업 완료 상태는 foreground toast와 Electron native notification으로 표시할 수 있습니다.
- `soundOnCompleteEnabled=false`이면 completion sound를 재생하지 않고 native notification도 silent로 요청합니다.
- notification 설정은 웹/PWA와 같은 `~/.codexmux/config.json` 값을 공유합니다.

## Server Modes

로컬 서버:

- 앱 실행 시 내부 codexmux 서버를 시작합니다.
- 기본 포트는 `8022`이고, 사용 중이면 임의 포트로 fallback합니다.
- 앱 종료 시 server shutdown과 Electron storage flush를 수행합니다.

원격 서버:

- 메뉴에서 원격 서버 URL을 입력하면 `~/.codexmux/config.json`에 저장합니다.
- URL scheme이 없으면 `http://`를 붙입니다.
- 허용 scheme은 `http://`와 `https://`입니다.

## Build Output

`corepack pnpm build:electron`은 실행 가능한 Electron main/preload bundle과 Next.js standalone server bundle을 생성하지만 `.app` 또는 `.dmg`를 만들지는 않습니다.

| 명령 | 산출물 |
| --- | --- |
| `corepack pnpm build:electron` | `dist/`, `dist-electron/`, `.next/standalone/` |
| `corepack pnpm pack:electron:dev` | `release/` 아래 unsigned local macOS package |
| `corepack pnpm pack:electron` | `release/` 아래 signed/notarized release package |

macOS에서 앱을 실제로 설치하려면 `release/*.dmg` 또는 `release/*/*.app` 산출물이 필요합니다. 현재 repository checkout에 `release/`가 없으면 아직 macOS 앱 패키징을 실행하지 않은 상태입니다.

## Packaging Notes

현재 패키징 metadata는 `com.hardcoremonk.codexmux`와 `HardcoreMonk/codexmux`를 기준으로 맞춰져 있습니다.

릴리스 패키징 전에 확인할 항목:

- macOS signing certificate
- Apple notarize credentials
- GitHub release publish 권한
- `node-pty` native binary가 `asarUnpack`에 포함되는지 확인
