---
title: 설치
description: Windows Electron package와 source 실행, package smoke, legacy tmux 설치 경계.
eyebrow: 시작하기
permalink: /docs/installation/index.html
---
{% from "docs/callouts.njk" import callout %}

현재 primary 전환 경로는 Windows Runtime v2를 사용하는 Electron desktop package입니다. 이 저장소는 기존 `codexmux` product identity와 release evidence를 유지하고, Windows 설치형 제품 마감은 별도 [codexwinmux 저장소](https://github.com/HardcoreMonk/codexwinmux)에서 진행합니다.

{% call callout('warning', '검증된 내부 Windows release') %}
v0.4.21은 fresh Windows packaged upload, package/release gate, v0.4.20에서 v0.4.21로의 published update와 artifact privacy gate를 통과했습니다. 다만 public code signing이 없는 내부 release이므로 일반 공개 지원 package로 확대 해석하지 않습니다.
{% endcall %}

## Windows package

현재 `electron-builder.yml`의 Windows target은 x64 NSIS installer와 zip입니다.

| artifact | 용도 |
|---|---|
| `codexmux-Setup-<version>.exe` | per-user NSIS 설치 |
| `codexmux-<version>-win.zip` 계열 | 압축 해제형 package |
| `latest.yml`, `.blockmap` | Electron updater metadata |

조직에서 승인한 내부 배포에는 [codexmux Releases](https://github.com/HardcoreMonk/codexmux/releases/latest)의 exact 네 artifact를 사용하고 version을 함께 확인하세요. Public code signing/SmartScreen reputation은 내부 배포 기준의 blocker가 아니지만 조직의 실행 정책은 별도로 따라야 합니다.

## Windows source 실행

요구사항:

- Windows x64
- Node.js 20.9 이상
- Git과 Codex CLI
- Corepack/pnpm

PowerShell에서:

```powershell
git clone https://github.com/HardcoreMonk/codexmux.git
Set-Location codexmux
corepack enable
corepack pnpm install

$env:CODEXMUX_RUNTIME_V2 = "1"
$env:CODEXMUX_RUNTIME_TERMINAL_ADAPTER = "windows"
$env:CODEXMUX_PROCESS_INSPECTOR_ADAPTER = "windows"
$env:PORT = "8122"
corepack pnpm dev:electron
```

`dev:electron`은 `HOST`가 없으면 `localhost`를 주입하고 선택한 `PORT`만 poll합니다. 따라서 source dev의 network access는 config보다 localhost가 우선하며, `8122`가 비어 있지 않다면 실행 전에 다른 free port를 지정해야 합니다.

이미 `8122`에서 dev server가 실행 중이면 Electron만 연결할 수 있습니다.

```powershell
$env:ELECTRON_DEV_URL = "http://localhost:8122"
corepack pnpm exec electron .
```

## Windows package 생성

Windows host에서 repository wrapper를 사용합니다. `electron-builder`를 직접 호출하지 않습니다.

```powershell
corepack pnpm pack:electron:dev
corepack pnpm pack:electron
```

| 명령 | 산출물 |
|---|---|
| `pack:electron:dev` | `release/win-unpacked/` |
| `pack:electron` | NSIS installer, zip, updater metadata |

Fresh package 검증 순서:

```powershell
$env:CODEXMUX_SMOKE_ARTIFACT_DIR = "C:\artifacts\codexmux-smoke"
$env:CODEXMUX_WINDOWS_UPDATER_LOCAL_FEED_BASE_INSTALLER_PATH = "C:\artifacts\codexmux-Setup-<previous-version>.exe"
corepack pnpm smoke:windows:preflight
corepack pnpm smoke:windows:electron-env
corepack pnpm smoke:windows:electron-packaging
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:upload-integrity
corepack pnpm smoke:windows:package-gate
corepack pnpm smoke:windows:release-gate
```

`package-gate`는 updater local-feed 단계를 포함합니다. Fresh runner의 `release/`에는 이전 installer가 없으므로 현재 version보다 낮은 실제 installer를 위 환경 변수로 전달해야 합니다. `CODEXMUX_WINDOWS_UPDATER_LOCAL_FEED_ALLOW_SYNTHETIC=1`은 개발 fallback일 뿐 release acceptance evidence로 인정하지 않습니다.

`v0.4.21`은 [Issue #16](https://github.com/HardcoreMonk/codexmux/issues/16)의 조건대로 fresh Windows runner, 새 package와 실제 `v0.4.20` installer로 통과했습니다. 이후 stable release도 명령의 존재가 아니라 같은 실제 evidence를 남겨야 합니다.

## Port와 최초 설정

외부 server port 기본값은 `8122`입니다. **Packaged Electron local server**는 이 port로 시작하지 못하면 port `0`으로 다시 시작해 빈 port를 선택하고 실제 값을 `~/.codexmux/port`에 기록합니다.

반면 `dev:electron` wrapper는 처음 선택한 `PORT`의 health URL만 poll하므로 fallback port를 따라가지 않습니다. Source dev에서는 `8122`를 비우거나 시작 전에 free port를 지정합니다.

```powershell
$env:PORT = "9000"
corepack pnpm dev:electron
```

Fresh setup process는 `HOST`를 지정해도 loopback에만 bind합니다. Packaged Electron은 setup 후 restart부터 저장된 config의 network access를 사용합니다. Source `dev:electron`은 `HOST` 미지정 시 `localhost`를 주입하므로 외부 access가 필요하면 restart 전에 `$env:HOST="localhost,tailscale"`처럼 명시해야 합니다.

## Update와 제거

Packaged Electron은 GitHub release metadata를 사용하는 updater를 포함합니다. Update acceptance는 matching `latest.yml`, installer, `.blockmap`과 published install smoke가 함께 확인된 version만 대상으로 합니다.

Windows 앱 제거는 **설정 → 앱 → 설치된 앱**에서 처리합니다. App 제거는 `~/.codexmux/` data를 자동으로 지우지 않습니다. 전체 data를 삭제하려면 app/server를 종료하고 별도로 실행합니다.

```powershell
Remove-Item -Recurse -Force (Join-Path $HOME ".codexmux")
```

이 작업은 workspace, runtime DB, 인증, log, upload를 모두 삭제하지만 Codex CLI 소유의 `~/.codex/`는 삭제하지 않습니다. 세부 구조는 [데이터 디렉터리](/codexmux/docs/data-directory/)를 참고하세요.

## Legacy/reference 설치

`npx`, global npm/pnpm, macOS package, Linux systemd, tmux server는 기존 macOS/Linux line을 재현하는 reference입니다. Windows Runtime v2 primary 설치 방법이 아닙니다.

```bash
npx codexmux
# 또는
pnpm add -g codexmux
codexmux
```

이 경로에는 tmux 3.0 이상이 필요합니다. Legacy macOS package 명령과 Linux service 운영은 repository의 [Electron 문서](https://github.com/HardcoreMonk/codexmux/blob/main/docs/ELECTRON.md)와 [systemd 문서](https://github.com/HardcoreMonk/codexmux/blob/main/docs/SYSTEMD.md)에 기록으로 남아 있습니다.

## 다음으로

- **[빠른 시작](/codexmux/docs/quickstart/)** — Windows source 실행과 setup
- **[포트 & 환경 변수](/codexmux/docs/ports-env-vars/)** — runtime/network 변수
- **[문제 해결](/codexmux/docs/troubleshooting/)** — package, Runtime v2, port 진단
