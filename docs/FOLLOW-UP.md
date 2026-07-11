# 후속 작업

이 문서는 release 전 확인, 내부 배포 단계, post-MVP backlog를 추적합니다. 2026-07-12
`v0.4.21` stable/latest 기준으로 열린 stable release blocker는 없습니다. 현재 release는
unsigned 내부 배포물이며, public signing이나 외부 배포 준비 완료를 의미하지 않습니다.

## 완료된 범위

- Runtime v2 terminal/storage/timeline/status 전환 기반
- Windows platform script blocker audit
- Windows terminal runtime adapter
- Windows process inspector
- Windows Codex session detection smoke
- Windows preflight
- Windows service host baseline과 host diagnostics
- Windows Electron bootstrap env
- Windows packaging contract
- Windows release gate artifact
- Windows packaged launch/installer smoke 계열
- `~/.codex/state_*.sqlite` read-only schema/count probe 기반
- Approval queue Web Push outcome의 sanitized JSONL audit 기록
- Mobile lock-screen approval copy의 locale-aware title/body
- Provider 추가 전 `IAgentProvider` registry contract test
- Electron app-server local/remote URL protocol helper
- Status Web Push payload 생성 순수 helper 분리
- 대형 JSONL 기준 timeline perf snapshot helper와 virtualization 판단 기준
- Codex CLI JSONL schema fixture 기반 parser 회귀 테스트
- Codex resume 실패 원인 code/recoverable 분류
- Status JSONL tail scan 순수 helper 분리
- Timeline init meta 계산 순수 helper 분리
- Provider adapter status behavior contract와 runtime worker IPC 반영
- Runtime v2 rollback dry-run의 명시적 `rollbackEnv` 출력과 unit test
- 내부 전용 배포 조건 확정: public code signing certificate와 SmartScreen reputation은 release blocker가 아님
- Runtime v2 live rollback drill: 설치 앱에서 `on -> off -> restored` 전환 확인
- 설치 앱 장시간 관찰 smoke: `0.4.16` 설치본 302.8초, 23회 반복 실행, Phase 6 gate 확인
- `codexwinmux` 별도 제품 line ADR과 migration runbook
- 다음 버전 release/update smoke 반복 체크리스트
- Pre-auth bootstrap loopback exposure, strict setup claim, typed install admission/lease와 dev/prod 공격 smoke
- Production dependency audit 0건과 outer-owned streaming upload ingress의 Linux dev/prod/memory/Electron gate
- `v0.4.20` fresh Windows package/release gate와 packaged upload integrity exact checks
- `v0.4.16 -> v0.4.20` exact target-tag published updater apply와 stable promotion
- `v0.4.21`에서 같은 Windows gate와 `v0.4.20 -> v0.4.21` updater apply 반복
- Browser/package/published-updater evidence의 upload 전 privacy scanner와 stable promotion 차단

## 릴리스 전 확인

공통 및 Linux에서 확보하는 필수 검증:

```bash
corepack pnpm check:project-design
corepack pnpm build:landing
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm audit --prod
CODEXMUX_PREAUTH_SMOKE_MODE=development corepack pnpm smoke:pre-auth-bootstrap
corepack pnpm build
CODEXMUX_PREAUTH_SMOKE_MODE=production corepack pnpm smoke:pre-auth-bootstrap
corepack pnpm check:upload-memory
CODEXMUX_UPLOAD_SMOKE_MODE=development corepack pnpm smoke:upload-integrity
CODEXMUX_UPLOAD_SMOKE_MODE=production corepack pnpm smoke:upload-integrity
corepack pnpm smoke:browser-reconnect
corepack pnpm build:electron
xvfb-run -a corepack pnpm smoke:electron:runtime-v2
```

Electron development smoke는 Linux GUI/display 경로입니다. Headless Linux에서는 위와 같이
Xvfb를 사용하고 GUI가 있는 Linux desktop에서는 직접 실행할 수 있습니다. Windows runtime
증거는 `smoke:windows:packaged-runtime-v2`와 installer/package gate로 확인합니다.

[Issue #16](https://github.com/HardcoreMonk/codexmux/issues/16)의 acceptance를 충족한
fresh Windows 검증:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm pack:electron
$env:CODEXMUX_SMOKE_ARTIFACT_DIR = "C:\artifacts\codexmux-smoke"
$env:CODEXMUX_WINDOWS_UPDATER_LOCAL_FEED_BASE_INSTALLER_PATH = "C:\artifacts\codexmux-Setup-<previous-version>.exe"
corepack pnpm smoke:windows:updater-local-feed
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:upload-integrity
corepack pnpm smoke:windows:package-gate
corepack pnpm smoke:windows:release-gate
corepack pnpm check:smoke-artifacts -- $env:CODEXMUX_SMOKE_ARTIFACT_DIR
```

Baseline installer는 현재 version보다 낮은 실제 release artifact여야 합니다.
`CODEXMUX_WINDOWS_UPDATER_LOCAL_FEED_ALLOW_SYNTHETIC=1`과 Non-Windows의
`{ skipped: true }`는 ADR-027의 Windows release 증거가 아닙니다.

Tag workflow는 고정된 baseline tag/SHA-256, fresh Windows package/release gate, prerelease
게시, exact target-tag published update apply, stable 승격을 순서대로 수행합니다. Prerelease
게시 전에 실패하면 Release와 asset을 만들지 않고, 게시 후 실패하면 candidate를 prerelease로
남깁니다. Browser, Windows package, published updater artifact는 privacy scanner를 통과해야
업로드되며 scanner 실패도 stable promotion을 차단합니다.

`v0.4.20`은 [workflow 29161183240](https://github.com/HardcoreMonk/codexmux/actions/runs/29161183240)에서
fresh Windows package/upload와 published updater 기능 경로를 최초 완료했습니다. 후속
재감사에서 published-updater JSON 2개를 privacy-safe evidence에서 제외했고 token이나
credential은 발견하지 않았습니다.

현재 기준 `v0.4.21`은
[workflow 29162818458](https://github.com/HardcoreMonk/codexmux/actions/runs/29162818458)에서
실제 `v0.4.20` installer와 SHA-256
`b98943708c2b0608fd5e5a49fc42aa21f59981ce3e78396de43bf89f5484936b`을 baseline으로
package/release gate, exact target-tag published channel/install과 세 privacy scan을
통과했습니다. Release tag commit은
`3818a28dd28fc9590f7ad2d0cc9521b6e6a567a7`이며 post-update health는
`version=0.4.21`, `commit=3818a28`입니다. Privacy-safe artifact는
`smoke-browser-reconnect`, `smoke-windows-package-v0.4.21`,
`smoke-windows-published-update-v0.4.21`입니다. 상세 기록은
[v0.4.21 Windows release handoff](operations/2026-07-12-v0.4.21-windows-release-handoff.md)에
있습니다.

Published update 검증:

- GitHub Release에 `latest.yml`을 올립니다.
- 같은 release에 `codexmux-Setup-<version>.exe`를 올립니다.
- matching `.blockmap` asset을 올립니다.
- 설치된 낮은 버전 앱 기준 published channel metadata를 확인합니다.
- `quitAndInstall` 후 새 앱 launch와 `/api/health`를 확인합니다. published install
  최초 기준 `0.4.15 -> 0.4.16`, 기능 기준 `0.4.16 -> 0.4.20`과 현재 privacy-safe 기준
  `0.4.20 -> 0.4.21` updater apply가 통과했습니다. 현재 post-update health는
  `version=0.4.21`, `commit=3818a28`입니다.
- 내부 전용 배포이므로 public code signing certificate와 SmartScreen reputation은 필수 검증에서 제외합니다.
- 설치 경고나 내부 신뢰 절차가 있으면 release note와 설치 안내에 기록합니다.

## 내부 배포 단계

1. 내부 release note를 작성합니다.
2. 설치/업데이트 안내를 배포합니다.
3. 3~5명이 실제 workspace로 장시간 사용합니다.
4. Terminal 생성, workspace 생성, Codex session mapping, updater, 종료/재실행을 확인합니다.
5. 문제가 없으면 내부 전체 배포로 확장합니다.

## 릴리스 검증 현황

열린 stable release blocker는 없습니다. 다음 표의 장시간 관찰은 기존 `v0.4.16` 근거를
보존하며, 현재 release gate 근거는 `v0.4.21`입니다.

| 항목 | 상태 |
| --- | --- |
| GitHub-hosted release asset과 published metadata | 완료: stable/latest `v0.4.21`의 `latest.yml`, NSIS installer, matching `.blockmap`, Windows zip 정확한 네 asset 확인 |
| 실제 설치된 낮은 버전 앱에서 GitHub-hosted 최신 버전으로 `quitAndInstall` | 완료: 실제 `v0.4.20` installer baseline에서 exact target tag `v0.4.21`로 apply, post-update health `version=0.4.21`, `commit=3818a28` 확인. 기존 기능 근거도 보존 |
| Long-running installed app session | 완료: `CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_DURATION_MS=300000`, 302,808ms 관찰, 23회 반복 실행, 모든 round `version=0.4.16`, `commit=13fe69ba`, Phase 6 gate 통과, silent uninstall 확인 |
| 제품명/app id/data dir의 codexwinmux 전환 여부 결정 | 완료: ADR-024와 `docs/operations/codexwinmux-product-line-migration.md`에 분리 기준 기록. `codexmux` line은 기존 identity를 유지하고, `codexwinmux`는 별도 productName/appId/data dir/updater channel을 소유합니다. |
| 다음 버전 release/update smoke 반복 | 완료: `docs/operations/windows-release-update-repeat-checklist.md`에 2026-07-12 `v0.4.20 -> v0.4.21` package/local/published update와 privacy 재검사 기록. 2026-05-12 초기 반복 근거도 보존 |
| Runtime v2 live rollback drill evidence | 완료: 설치 앱에서 runtime v2 `on -> CODEXMUX_RUNTIME_V2=0 -> restored` 전환, disabled health `404 runtime-v2-disabled`, 복구 후 Phase 6 gate 통과 |
| 측정 기반 perf tuning | 완료/비차단: `corepack pnpm perf:timeline-jsonl` synthetic 5,000 entries parse `18.57ms`, virtualization 권고 유지. session list cold index refresh는 비차단 응답으로 조정했고 package/installed runtime v2 worker counter는 Phase 6 gate에서 clean 확인 |
| Phase 6 closeout | 완료: packaged runtime v2 smoke, 설치 관찰 smoke, rollback drill에 Phase 6 health/perf gate 반영 |
| [Issue #16: Production upload fresh Windows evidence](https://github.com/HardcoreMonk/codexmux/issues/16) | 완료: `v0.4.20` 기능 검증과 `v0.4.21` privacy-safe 재검증, ADR-027/028 `Verified` |

## 비차단 항목

| 항목 | 결정 |
| --- | --- |
| Public code signing certificate trust | 내부 전용 앱이라 release blocker가 아님 |
| SmartScreen reputation | 내부 전용 앱이라 release blocker가 아님 |
| Artifact scanner enumeration hardening | 현재 writer는 lowercase regular `.json`만 생성합니다. 대소문자 확장자와 symlink를 명시적으로 거부하는 방어 강화는 후속 비차단 작업입니다. |

## Codex lifecycle 기준

- `domain-architecture` pass를 `superpowers:brainstorming / writing-spec` 뒤, `grill-me` 앞에 둡니다.
- `writing-spec`은 brainstorming의 설계 산출물로 취급하고 별도 gate로 보지 않습니다.
- `plan-design-review`는 non-UI workflow에서도 information architecture, gate clarity, operator error prevention, discoverability를 봅니다.
- `plan-eng-review`는 domain architecture pass가 module boundary, data flow, test strategy, rollback path에 미치는 영향을 검토합니다.

## Approval workflow 기준

- Approval queue metadata는 sanitized projection입니다.
- Durable audit은 `approval-audit.jsonl`의 enum/action/push outcome 중심 log로 제한합니다.
- Raw command, prompt body, full path, terminal output은 장기 저장하지 않습니다.

## App-server adapter 기준

- Windows app close와 backend lifecycle을 분리해야 합니다.
- 권장 방향은 tray-first engine host입니다.
- App shell의 local/remote server URL 해석은 `electron/app-server-protocol.ts` contract를 따릅니다.
- 창 닫기는 window hide, 명시적 종료는 engine shutdown으로 구분합니다.
- Windows Service는 내부 배포 안정화 후 elevation/installer ownership과 함께 검토합니다.

## 모바일 앱

Android는 legacy/reference surface입니다. Windows-only 제품 전환 중 새 primary feature 기준으로 확장하지 않습니다.

## 아키텍처 모듈화

- Terminal runtime adapter 경계를 유지합니다.
- Process inspector와 Codex session detection policy를 분리합니다.
- Host operation은 service/tray/installer boundary로 격리합니다.
- Open-ended cleanup이 아니라 accepted plan에 포함된 후보만 refactor합니다.

## 성능

- Runtime v2 worker counter와 `/api/debug/perf` snapshot으로 측정합니다.
- 긴 대화/대형 JSONL은 `corepack pnpm perf:timeline-jsonl` snapshot으로 먼저 분류합니다.
- Package smoke와 실제 installed app 장시간 사용 evidence를 우선합니다.

## 문서와 운영

- Canonical 문서는 한국어로 유지합니다.
- 실제 release/smoke 결과는 `docs/operations/` handoff에 추가합니다.
- 과거 logs/specs는 기록 보존을 위해 재작성하지 않습니다.
- 2026-05-07 이후 100% closeout 배치는 CODEX panel timeline hotfix 회귀도 자동 row로 포함합니다. 권장 closeout 명령은 `CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1 CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-complete corepack pnpm ops:backlog:complete`입니다.
