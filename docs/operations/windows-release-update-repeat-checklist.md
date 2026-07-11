# Windows release/update smoke 반복 체크리스트

이 체크리스트는 다음 버전마다 반복합니다. `codexmux`와 `codexwinmux`는 repository,
artifact name, product identity만 다르고 검증 순서는 같습니다.

## Release 전

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
```

확인 기준:

- `release/latest.yml` version이 package version과 일치합니다.
- `latest.yml`이 참조하는 installer가 `release/`에 있습니다.
- matching `.blockmap`이 있습니다.
- package gate는 현재 version보다 낮은 실제 baseline installer를 사용합니다. Synthetic
  local-feed는 release evidence로 인정하지 않습니다.
- `CODEXMUX_SMOKE_ARTIFACT_DIR`에 sanitized gate artifact가 생성됩니다.
- packaged runtime v2와 installer runtime v2 smoke가 Phase 6 gate를 통과합니다.

## GitHub Release 게시 후

이전 버전이 `0.4.15`, 새 버전이 `0.4.16`인 예시입니다.

```powershell
$env:CODEXMUX_WINDOWS_UPDATER_CURRENT_VERSION = "0.4.15"
corepack pnpm smoke:windows:updater-published-channel
```

```powershell
$env:CODEXMUX_WINDOWS_PUBLISHED_BASE_INSTALLER_PATH = "release\codexmux-Setup-0.4.15.exe"
$env:CODEXMUX_WINDOWS_UPDATER_PUBLISHED_GENERIC_FEED = "1"
corepack pnpm smoke:windows:updater-published-install
```

확인 기준:

- published channel이 새 semver를 감지합니다.
- GitHub Release asset에 `latest.yml`, installer, `.blockmap`이 모두 있습니다.
- installed baseline에서 `quitAndInstall`이 실행됩니다.
- installer process가 settle됩니다.
- post-update `/api/health.version`이 새 버전입니다.

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
