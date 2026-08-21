# Windows release/update smoke 반복 체크리스트

이 체크리스트는 다음 버전마다 반복합니다. `codexmux`와 `codexwinmux`는 repository,
artifact name, product identity만 다르고 검증 순서는 같습니다.

## Release 전

Tag workflow의 `WINDOWS_BASELINE_TAG`, `WINDOWS_BASELINE_VERSION`,
`WINDOWS_BASELINE_SHA256`를 직전 stable Windows installer에 맞게 갱신합니다. SHA-256은 GitHub
Release에서 다시 내려받은 asset으로 확인합니다. Release script는 `package.json`과 README의
현재 버전만 갱신하며 과거 증거 문서를 기계적으로 덮어쓰지 않습니다. Push 시 현재 branch
이름을 사용하지 않고 `HEAD:main`을 명시하며, remote `main`이 현재 HEAD의 ancestor가 아니면
중단합니다. Tag workflow도 tagged commit이 default branch에 포함됐는지 다시 확인합니다.
`.github/release-notes/v<version>.md`에는 unsigned internal installer 경고, 내부 신뢰 절차,
주요 변경과 운영 rollback을 기록합니다. 파일이 없으면 prerelease 게시를 중단합니다.

```powershell
corepack pnpm lint --quiet
corepack pnpm exec tsc --noEmit --pretty false
corepack pnpm test
corepack pnpm pack:electron
$env:CODEXMUX_SMOKE_ARTIFACT_DIR = "C:\artifacts\codexmux-smoke"
$env:CODEXMUX_WINDOWS_UPDATER_LOCAL_FEED_BASE_INSTALLER_PATH = "C:\artifacts\codexmux-Setup-<previous-version>.exe"
corepack pnpm smoke:windows:update-metadata
corepack pnpm smoke:windows:package-gate
corepack pnpm smoke:windows:release-gate
corepack pnpm check:smoke-artifacts -- $env:CODEXMUX_SMOKE_ARTIFACT_DIR
```

확인 기준:

- `release/latest.yml` version이 package version과 일치합니다.
- `latest.yml`이 참조하는 installer가 `release/`에 있습니다.
- matching `.blockmap`이 있습니다.
- package gate는 현재 version보다 낮은 실제 baseline installer를 사용합니다. Synthetic
  local-feed는 release evidence로 인정하지 않습니다.
- `CODEXMUX_SMOKE_ARTIFACT_DIR`에 sanitized gate artifact가 생성됩니다.
- Artifact privacy scanner가 금지 key/value를 찾지 않고 통과합니다. 실패한 artifact는
  업로드하거나 stable promotion 근거로 사용하지 않습니다.
- packaged runtime v2와 installer runtime v2 smoke가 Phase 6 gate를 통과합니다.

## GitHub Release 게시 후

`<previous-version>`과 `<target-version>`을 실제 직전 stable과 candidate version으로
바꿉니다. Windows candidate gate가 통과한 asset은 먼저 prerelease로 게시합니다.

```powershell
$env:CODEXMUX_WINDOWS_UPDATER_CURRENT_VERSION = "<previous-version>"
$env:CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INCLUDE_PRERELEASE = "1"
$env:CODEXMUX_WINDOWS_UPDATER_PUBLISHED_TAG = "v<target-version>"
corepack pnpm smoke:windows:updater-published-channel
```

```powershell
$env:CODEXMUX_WINDOWS_PUBLISHED_BASE_INSTALLER_PATH = "release\codexmux-Setup-<previous-version>.exe"
$env:CODEXMUX_WINDOWS_UPDATER_PUBLISHED_GENERIC_FEED = "1"
corepack pnpm smoke:windows:updater-published-install
corepack pnpm check:smoke-artifacts -- $env:CODEXMUX_SMOKE_ARTIFACT_DIR
```

확인 기준:

- published channel이 새 semver를 감지합니다.
- GitHub Release asset에 `latest.yml`, installer, `.blockmap`이 모두 있습니다.
- installed baseline에서 `quitAndInstall`이 실행됩니다.
- installer process가 settle됩니다.
- post-update `/api/health.version`이 새 버전입니다.
- 위 target-tag channel/install smoke가 모두 통과한 뒤에만 prerelease를 stable/latest로
  승격합니다.
- Prerelease 게시 전 실패는 Release와 asset을 만들지 않습니다. 게시 후 실패는 candidate를
  prerelease로 유지하며, 같은 tag를 이동하거나 asset을 바꿔 우회하지 않습니다.

## Runtime/사용 환경 증거

```powershell
corepack pnpm smoke:windows:runtime-v2-rollback-drill
```

```powershell
$env:CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_DURATION_MS = "300000"
$env:CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_MAX_ROUNDS = "24"
corepack pnpm smoke:windows:installed-observation
```

확인 기준:

- runtime v2 `on -> off -> restored` drill이 통과합니다.
- off 상태는 인증 후 `404 runtime-v2-disabled`입니다.
- restored 상태는 Phase 6 gate를 다시 통과합니다.
- 설치 관찰은 모든 round에서 같은 version/commit과 Phase 6 gate를 확인합니다.

## 기록 위치

결과는 `docs/operations/YYYY-MM-DD-<topic>-handoff.md`에 기록하고,
`docs/FOLLOW-UP.md`의 남은 차단 항목을 함께 갱신합니다.

2026-05-12 현재 재확인:

- `corepack pnpm smoke:windows:update-metadata`: passed, `latestVersion=0.4.16`
- `CODEXMUX_WINDOWS_UPDATER_CURRENT_VERSION=0.4.15 corepack pnpm smoke:windows:updater-published-channel`: passed, `0.4.15 -> 0.4.16`
- `CODEXMUX_WINDOWS_PUBLISHED_BASE_INSTALLER_PATH=release\\codexmux-Setup-0.4.15.exe CODEXMUX_WINDOWS_UPDATER_PUBLISHED_GENERIC_FEED=1 corepack pnpm smoke:windows:updater-published-install`: passed, `quitAndInstall`, installer settle, post-update health `version=0.4.16`, `commit=13fe69ba`

2026-07-12 `v0.4.20` 최초 기능 검증:

- Workflow [29161183240](https://github.com/HardcoreMonk/codexmux/actions/runs/29161183240): fresh `windows-2025` package/release gate, prerelease 게시, published updater apply, stable/latest 승격 통과
- Baseline: 실제 `v0.4.16` installer, SHA-256 `7933b764ad95642fcf9a7507e464a5de6e2bed5b5e2c6209c7ed43ca1b31da80`
- Upload integrity: exact size/SHA, same-directory publish, abort/aged-stage cleanup, committed `.part` 보존, 동일 exe kill switch 통과
- Published install: `v0.4.16 -> v0.4.20`, post-update health `version=0.4.20`, `commit=efffbed`
- Stable asset: `latest.yml`, installer, matching blockmap, Windows zip 정확한 네 개
- 운영 근거: `docs/operations/2026-07-12-v0.4.20-windows-release-handoff.md`

Release 후 재감사에서 `smoke-windows-published-update-v0.4.20`의 JSON 2개는 privacy-safe
evidence에서 제외했습니다. Package/upload와 실제 updater 적용 기능 결과는 유효하며 token이나
credential은 발견하지 않았습니다.

2026-07-12 `v0.4.21` privacy-safe release 재확인:

- Workflow [29162818458](https://github.com/HardcoreMonk/codexmux/actions/runs/29162818458): 모든 job과 stable/latest 승격 통과
- Baseline: 실제 `v0.4.20` installer, SHA-256 `b98943708c2b0608fd5e5a49fc42aa21f59981ce3e78396de43bf89f5484936b`
- Package gate: `411634ms`; upload integrity `11341ms`; release gate `16312ms`
- Updater: local `257386ms`, published `244973ms`, post-update health `version=0.4.21`, `commit=3818a28`
- Privacy: browser/package/published-updater upload 전 검사와 workflow 중·직후 확보한 다운로드본 16개 JSON의 stable 승격 후 독립 검사 통과
- Stable asset: `latest.yml`, installer, matching blockmap, Windows zip 정확한 네 개
- 운영 근거: `docs/operations/2026-07-12-v0.4.21-windows-release-handoff.md`

2026-07-13 `v0.4.22` candidate 준비:

- Baseline tag/version: `v0.4.21` / `0.4.21`
- GitHub Release에서 다시 내려받은 `codexmux-Setup-0.4.21.exe` SHA-256:
  `0e54fafe6465474e0092228a128755fdb04eba3698d8f2daf00327ad7bb24aaa`
- Release 범위: Purplemux/Codexmux same-host browser cookie namespace 격리, 1회 재로그인 전환,
  HTTP/WebSocket/install/upload 인증 회귀
- Stable 승격 전 필수 증거: fresh Windows package/release gate, `v0.4.21 -> v0.4.22`
  local/published updater apply, post-update health, browser/package/published-updater privacy scan

2026-07-13 `v0.4.22` stable 반복 검증:

- Release: [v0.4.22](https://github.com/HardcoreMonk/codexmux/releases/tag/v0.4.22), tag
  `4af022090aa74ef3b2d7a01c9a8fd5bfe504f89a`, stable/latest
- Workflow [29219010240](https://github.com/HardcoreMonk/codexmux/actions/runs/29219010240):
  attempt 3에서 모든 job 통과. Attempt 1 Windows job `86720930232`와 attempt 2 job
  `86722515155`는 각각 GitHub Actions 내부 오류로 취소됐고 release asset은 만들지 않았음
- Baseline: 실제 `v0.4.21` installer, SHA-256
  `0e54fafe6465474e0092228a128755fdb04eba3698d8f2daf00327ad7bb24aaa`
- Windows: package gate `394584ms`, upload integrity `11724ms`, local updater `240046ms`,
  release gate `17878ms`
- Published updater: `v0.4.21 -> v0.4.22`, `254840ms`, post-update launch와
  health `version=0.4.22`, `commit=4af0220` 확인
- Privacy: browser/package/published-updater artifact 16개 JSON을 stable 승격 후 다시 내려받아
  독립 검사, `fileCount=16` 통과
- Stable asset SHA-256: zip
  `a7711fe3b5757c23fff337b27bec156216cf52869179943f3bbf84925f61d75c`, installer
  `84d0480b227113a776c5cd92f94ebe007171aef474be138e88f095ce0e0cdd35`, blockmap
  `33aad79a443feb83713f1765f883179122724d2bc366cf88cb0624d6001b78ca`, `latest.yml`
  `69fbccf4b5fb92bff17c71fdc67fe48f1c063fd4b120f33a90ea56ddf29797e7`
- 운영 근거: `docs/operations/2026-07-13-v0.4.22-windows-release-handoff.md`

CI의 browser와 updater smoke는 isolated/fresh profile을 사용합니다. 기존 `v0.4.21` Electron
profile을 보존한 채 Codexmux 1회 재로그인, 필요한 경우 Purplemux 재로그인, 기존 Runtime v2
WebSocket와 session-authenticated upload 재연결을 확인하는 작업은 ADR-029의 후속 조건입니다.
