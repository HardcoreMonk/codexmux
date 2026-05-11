# Electron과 Windows 패키징

codexmux Electron 앱은 Next.js UI를 데스크톱 shell 안에서 실행합니다. 현재 제품 전환 기준에서는 Windows desktop shell, NSIS installer, updater smoke가 primary path입니다.

## 명령

```bash
corepack pnpm dev:electron
corepack pnpm dev:electron:attach
corepack pnpm build:electron
corepack pnpm pack:electron:dev
corepack pnpm pack:electron
```

Windows smoke:

```bash
corepack pnpm smoke:windows:electron-env
corepack pnpm smoke:windows:electron-packaging
corepack pnpm smoke:windows:zip-artifact
corepack pnpm smoke:windows:update-metadata
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:packaged-runtime-v2
corepack pnpm smoke:windows:installer-install
corepack pnpm smoke:windows:installer-runtime-v2
corepack pnpm smoke:windows:updater-local-feed
corepack pnpm smoke:windows:updater-published-channel
corepack pnpm smoke:windows:updater-published-install
corepack pnpm smoke:windows:package-gate
```

Legacy macOS packaging:

```bash
corepack pnpm pack:electron:mac:dev
corepack pnpm pack:electron:mac
```

## 주요 파일

| 파일 | 역할 |
| --- | --- |
| `electron/main.ts` | BrowserWindow, menu, local/remote server mode, updater |
| `electron/app-server-protocol.ts` | local/remote app-server URL 정규화와 active server label contract |
| `electron/preload.ts` | renderer IPC bridge |
| `electron/browser-bridge.ts` | Electron browser panel bridge |
| `electron/runtime-env.ts` | platform별 PATH와 `NODE_PATH` 처리 |
| `scripts/dev-electron.mjs` | dev server 자동 실행과 Electron attach |
| `scripts/pack-electron-windows.mjs` | Windows electron-builder wrapper |
| `electron-builder.yml` | Windows NSIS/zip packaging, publish metadata |

Electron 설정은 `~/.codexmux/config.json`을 공유합니다. Server mode는 `server.mode`, `server.remoteUrl`로 관리합니다.

## 서버 모드

로컬 서버:

- 앱 실행 시 내부 codexmux server를 시작합니다.
- 기본 포트는 현재 저장소 기준 `8122`이고, 사용 중이면 fallback port를 사용합니다.
- 앱 종료 시 server shutdown과 Electron storage flush를 수행합니다.
- Windows에서는 POSIX PATH 보정을 적용하지 않고 현재 Windows `PATH`를 유지합니다.
- Packaged local server의 `NODE_PATH`는 Windows에서 `;` 구분자를 사용합니다.

원격 서버:

- 설정한 URL을 `~/.codexmux/config.json`에 저장합니다.
- URL scheme이 없으면 `http://`를 붙입니다.
- 허용 scheme은 `http://`, `https://`입니다.
- 잘못 저장된 remote URL이나 지원하지 않는 scheme은 local mode로 fallback합니다.

## Windows 패키징 계약

`pack:electron`은 Windows release package를 생성합니다.

| 명령 | 산출물 |
| --- | --- |
| `build:electron` | `dist/`, `dist-electron/`, `.next/standalone/` |
| `pack:electron:dev` | `release/win-unpacked/` |
| `pack:electron` | Windows NSIS installer, zip, updater metadata |

Windows wrapper는 electron-builder를 직접 호출하지 않고 `scripts/pack-electron-windows.mjs`를 사용합니다.

- electron-builder node-module collector를 위해 임시 `pnpm` shim을 만듭니다.
- `--config.npmRebuild=false`를 전달합니다.
- packaged runtime native binding은 standalone bundle에서 공급합니다.
- `dist/workers/**`는 worker fork를 위해 unpacked 상태를 유지합니다.
- NSIS `runAfterFinish`는 silent install smoke를 위해 disabled 상태를 유지합니다.
- NSIS `artifactName`은 `${productName}-Setup-${version}.${ext}` 형태를 유지합니다.

`latest.yml`, installer exe, matching `.blockmap`은 같은 updater-visible artifact name을 가져야 합니다.

## 업데이트 smoke

Local feed smoke:

```bash
corepack pnpm smoke:windows:updater-local-feed
```

이 smoke는 생성된 `latest.yml`을 template으로 사용하고 temp local feed에서 patch version만 올립니다. 기존 installer artifact를 localhost에서 제공한 뒤 download, `update-downloaded`, `quitAndInstall`, app exit, post-install launch, uninstall을 확인합니다.

Published channel smoke:

```bash
corepack pnpm smoke:windows:updater-published-channel
```

이 smoke는 설치나 update를 수행하지 않습니다. `electron-builder.yml`의 GitHub publish owner/repo에서 published release channel을 read-only로 확인합니다. 최신 published release에 `latest.yml`, installer, matching `.blockmap`, newer semver, download URL이 없으면 blocker로 실패합니다.

Prerelease asset 검증이 필요하면 다음 환경 값을 함께 사용합니다.

```bash
CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INCLUDE_PRERELEASE=1 \
CODEXMUX_WINDOWS_UPDATER_CURRENT_VERSION=0.4.2 \
corepack pnpm smoke:windows:updater-published-channel
```

Published install smoke:

```bash
corepack pnpm smoke:windows:updater-published-install
```

이 smoke는 설치된 낮은 버전 앱에서 GitHub-hosted release로 update apply를 시도합니다. `v0.4.3` prerelease evidence에서는 read-only metadata는 통과했지만 NSIS `--updated` installer hang 때문에 stable/default channel 승격을 보류합니다.

## Electron 런타임 v2 smoke

Electron은 웹/PWA와 같은 React runtime v2 terminal hook을 사용합니다.

```bash
corepack pnpm smoke:electron:runtime-v2
corepack pnpm smoke:windows:packaged-runtime-v2
corepack pnpm smoke:windows:installer-runtime-v2
```

검증 항목:

- existing session cookie로 `/api/v2/terminal` attach
- marker command output
- page reload/reconnect
- packaged local server health
- runtime startup diagnostics
- blocking console 0건

## 알림

- 작업 완료 상태는 foreground toast와 Electron native notification으로 표시할 수 있습니다.
- `soundOnCompleteEnabled=false`이면 completion sound를 재생하지 않고 native notification도 silent로 요청합니다.
- notification 설정은 웹/PWA와 같은 `config.json` 값을 공유합니다.

## 릴리스 전 확인

- Windows package가 실제로 빌드되었는지 확인합니다.
- `release/latest.yml`, installer exe, `.blockmap` asset이 일치하는지 확인합니다.
- 설치된 앱에서 published update apply evidence를 남깁니다. `quitAndInstall`/NSIS `--updated` 경로가 멈추면 stable channel로 승격하지 않습니다.
- 내부 전용 배포에서는 public code signing certificate trust와 SmartScreen reputation을 release blocker로 보지 않습니다.
- 설치 경고나 내부 신뢰 절차는 release note와 설치 안내에 기록합니다.
- 장시간 실제 workspace 사용을 내부 사용자 3~5명으로 검증합니다.
