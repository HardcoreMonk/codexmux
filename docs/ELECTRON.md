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
- NSIS assisted installer는 `build-resources/installer.nsh`를 include합니다. silent
  `--updated` update apply에서는 install section 이후 명시적으로 `quitSuccess`를
  호출해 updater installer process가 settle되도록 합니다.
- 내부 updater가 앱 종료를 제어하므로 NSIS process-name scan은 우회합니다. 이는
  장시간 자동화 세션에서 stale `codexmux.exe` tasklist 항목이 silent install/update를
  막는 문제를 피하기 위한 Windows 내부 배포 계약입니다.

`latest.yml`, installer exe, matching `.blockmap`은 같은 updater-visible artifact name을 가져야 합니다.

## 업데이트 smoke

Local feed smoke:

```bash
corepack pnpm smoke:windows:updater-local-feed
```

이 smoke는 생성된 `latest.yml`과 직전 Windows installer를 사용해 isolated 짧은
설치 경로에서 실제 updater apply를 수행합니다. localhost feed에서 download,
`update-downloaded`, `quitAndInstall`, app exit, updater installer settle,
post-install launch, registry/directory cleanup을 확인합니다.

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

이 smoke는 설치된 낮은 버전 앱에서 GitHub-hosted release로 update apply를
시도합니다. published release가 prerelease이면
`CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INCLUDE_PRERELEASE=1`을 함께 지정합니다.
현재 Windows updater는 Electron 프로세스 내부 HTTPS timeout을 피하기 위해
PowerShell `Invoke-WebRequest` 기반 HTTP executor를 사용합니다. 최종 published
install evidence는 다음 경로로 확보했습니다.

```bash
CODEXMUX_WINDOWS_PUBLISHED_BASE_INSTALLER_PATH=release\\codexmux-Setup-0.4.15.exe \
CODEXMUX_WINDOWS_UPDATER_PUBLISHED_GENERIC_FEED=1 \
corepack pnpm smoke:windows:updater-published-install
```

이 검증은 GitHub Release `v0.4.16`의 `latest.yml`과
`codexmux-Setup-0.4.16.exe`를 실제로 다운로드하고, `quitAndInstall`, installer
settle, post-update `/api/health.version=0.4.16`까지 확인합니다.

## Electron 런타임 v2 smoke

Electron은 웹/PWA와 같은 React runtime v2 terminal hook을 사용합니다.

```bash
corepack pnpm smoke:electron:runtime-v2
corepack pnpm smoke:windows:packaged-runtime-v2
corepack pnpm smoke:windows:installer-runtime-v2
corepack pnpm smoke:windows:runtime-v2-rollback-drill
```

검증 항목:

- existing session cookie로 `/api/v2/terminal` attach
- marker command output
- page reload/reconnect
- packaged local server health
- runtime startup diagnostics
- runtime v2 Phase 6 health/perf gate
- blocking console 0건

설치 관찰 smoke:

```bash
CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_DURATION_MS=300000 \
CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_MAX_ROUNDS=24 \
corepack pnpm smoke:windows:installed-observation
```

이 smoke는 최신 NSIS installer를 임시 위치에 silent install하고, 같은 isolated
Windows user dir에서 packaged launch/runtime v2 terminal/Phase 6 gate를 반복 실행한
뒤 silent uninstall까지 확인합니다. 2026-05-12 기준 `0.4.16` 설치본으로 302,808ms
관찰, 23회 반복 실행, 모든 round `version=0.4.16`, `commit=13fe69ba`가 통과했습니다.

Runtime v2 rollback drill은 설치 앱에서 `on -> CODEXMUX_RUNTIME_V2=0 -> restored`
순서를 확인합니다. off 상태는 인증 후 `/api/v2/runtime/health`가
`404 runtime-v2-disabled`를 반환해야 하며, restored 상태는 다시 Phase 6 gate를
통과해야 합니다.

## 알림

- 작업 완료 상태는 foreground toast와 Electron native notification으로 표시할 수 있습니다.
- `soundOnCompleteEnabled=false`이면 completion sound를 재생하지 않고 native notification도 silent로 요청합니다.
- notification 설정은 웹/PWA와 같은 `config.json` 값을 공유합니다.

## 릴리스 전 확인

- Windows package가 실제로 빌드되었는지 확인합니다.
- `release/latest.yml`, installer exe, `.blockmap` asset이 일치하는지 확인합니다.
- 설치된 앱에서 published update apply evidence를 남깁니다. 현재 기준 증거는
  `v0.4.15 -> v0.4.16` published installer baseline smoke입니다.
- 내부 전용 배포에서는 public code signing certificate trust와 SmartScreen reputation을 release blocker로 보지 않습니다.
- 설치 경고나 내부 신뢰 절차는 release note와 설치 안내에 기록합니다.
- 장시간 실제 workspace 사용을 내부 사용자 3~5명으로 검증합니다.
