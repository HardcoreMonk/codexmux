# Windows-only platform 전환 설계

## 목표

codexmux를 Windows 전용 서비스/제품으로 전환하기 위한 architecture 기준을 고정합니다. 이 설계는 frontend/backend skill refactoring이 아니라 platform/runtime/host 전환 설계입니다.

## 맥락

기존 codexmux는 macOS/Linux tmux server와 Electron/Android shell을 중심으로 성장했습니다. 사용자 목표는 이 기반을 Windows-only 제품으로 전환해 설치, 실행, 업데이트, 내부 배포까지 가능하게 만드는 것입니다.

이 작업은 ADR에서 제거한 Windows companion integration을 복구하지 않습니다.

## 승인된 제품 형태

- Windows desktop app이 primary surface입니다.
- Core/backend engine은 app window lifecycle과 분리되어야 합니다.
- 초기 host 모델은 tray-first engine host가 적합합니다.
- Windows Service는 elevation, installer ownership, rollback 기준이 정리된 뒤 검토합니다.
- Android/Linux/macOS path는 legacy/reference로 보존합니다.

## 범위

- Windows terminal runtime
- Windows process inspector
- Windows Codex session detection과 JSONL mapping
- Windows preflight
- Windows service/tray host baseline
- Electron Windows packaging
- Installer install smoke
- Updater local/published channel smoke
- Windows release gate와 artifact evidence
- 한국어 canonical documentation

## 제외 범위

- 제거된 Windows remote sync/terminal bridge 복구
- FE/React/Vercel skill refactoring
- BE/FastAPI skill refactoring
- UI 전체 rewrite
- 외부 guide installer, hook, package manager, plugin manifest 실행
- 승인 없는 cross-project `AGENTS.md` rollout

## 도메인 아키텍처 pass

표준 용어:

| 용어 | 의미 |
| --- | --- |
| Windows-only product | 지원 실행 타깃을 Windows로 고정하는 제품 전환 |
| Windows terminal runtime | Windows local shell과 Codex session을 유지하는 runtime |
| Windows service host | engine lifecycle을 관리하는 host boundary |
| Runtime adapter | terminal/process/service 구현을 OS별로 분리하는 adapter |
| Local Codex session | local JSONL과 running process를 연결한 projection |

거부 용어:

- Windows companion integration
- Windows bridge
- macOS/Linux server를 새 제품 기준으로 부르는 표현
- Android primary client
- tmux backend를 canonical runtime으로 부르는 표현

Bounded context 후보:

- Terminal Runtime
- Process Inspection
- Host Operations
- Platform Shell
- Local Session Index
- Release Verification

## 런타임 경계

Terminal runtime은 `ITerminalRuntimeAdapter` 뒤에 둡니다.

필수 behavior:

- create
- attach
- write
- resize
- detach
- kill
- presence
- metadata projection

Process inspection은 Codex-specific policy와 분리합니다. Windows에서는 CIM/PowerShell 기반 process inspector를 사용하고, POSIX helper를 새 code path에 직접 추가하지 않습니다.

## Host, install, packaging 기준

Windows host는 다음 단계를 따릅니다.

1. Tray-first local engine host
2. Packaged app launch smoke
3. Installer install smoke
4. Updater local feed smoke
5. Published channel smoke
6. Installed app long-running workspace smoke
7. Service-capable host 검토

Installer와 updater는 `latest.yml`, NSIS installer, matching `.blockmap` asset이 같은 release에 존재해야 합니다.

## 테스트, 릴리스, 운영

Release gate:

```bash
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm pack:electron
corepack pnpm smoke:windows:package-gate
```

Published update evidence:

- 기존 설치 버전보다 높은 GitHub Release가 있어야 합니다.
- `latest.yml`, installer exe, blockmap이 일치해야 합니다.
- download, install, `quitAndInstall`, relaunch를 확인해야 합니다.

Operate:

- 내부 release note 작성
- 설치/업데이트 안내 배포
- 3~5명 장시간 실제 workspace 사용
- 문제 없으면 내부 전체 배포

## Improve codebase architecture 후보

허용 후보:

- terminal runtime adapter 주변 shallow module 정리
- process inspector와 session detection policy 분리
- Windows host path/log path helper 정리
- runtime v2 testability friction 제거
- domain language와 충돌하는 naming 정리

금지:

- unrelated module cleanup
- framework-specific skill rewrite
- 승인 없는 sub-agent dispatch

## 검토 메모 기준

`plan-design-review`는 information architecture, gate clarity, operator error prevention, discoverability를 봅니다.

`plan-eng-review`는 module boundary, data flow, test strategy, rollback path를 봅니다.

## 인수 기준

- Windows-only target이 ADR과 docs에 고정됩니다.
- Windows runtime/process/host/package smoke가 release gate로 묶입니다.
- Legacy Android/Linux/macOS 문서는 primary path와 구분됩니다.
- Published update evidence 전에는 내부 전체 배포를 완료로 주장하지 않습니다.

## 자체 검토

- Windows companion 복구와 Windows-only 제품 전환을 구분했습니다.
- Runtime adapter와 process inspector boundary를 명시했습니다.
- Installer/updater evidence를 release blocker로 유지했습니다.
- FE/BE skill refactoring은 범위에서 제외했습니다.
