# 2026-05-12 배포/인증/사용 환경 증거 handoff

## 범위

- 실제 GitHub Release 자산 배포 여부를 확인했다.
- GitHub CLI 인증 상태와 repository 접근 권한을 확인했다.
- Windows installer 설치, packaged launch, `/api/health` 사용 환경 증거를 확인했다.
- 내부 전용 앱 조건에 따라 public code signing certificate와 SmartScreen reputation은 release blocker에서 제외했다.
- 자동 업데이트 적용 경로는 NSIS `--updated` installer hang으로 stable/default channel 승격을 보류했다.

## 배포 증거

| 항목 | 결과 |
| --- | --- |
| GitHub Release | `v0.4.3` prerelease 생성 |
| Release URL | <https://github.com/HardcoreMonk/codexmux/releases/tag/v0.4.3> |
| Tag target | `51667879` |
| Asset | `latest.yml`, `codexmux-Setup-0.4.3.exe`, `codexmux-Setup-0.4.3.exe.blockmap`, `codexmux-0.4.3-win.zip` |
| Release publishedAt | `2026-05-11T16:44:11Z` |

`gh release view v0.4.3 --json assets`에서 확인한 주요 asset:

| Asset | Size | SHA-256 digest |
| --- | ---: | --- |
| `codexmux-Setup-0.4.3.exe` | `152986466` | `e0d7f1f888f7c3e22b4dc7a9061e146655496265aaef87174f723d8b7e3cc199` |
| `codexmux-Setup-0.4.3.exe.blockmap` | `159191` | `999c708c92145efac30479939fb4241a53a76f2af3117f77d069d04773f4250a` |
| `codexmux-0.4.3-win.zip` | `200351636` | `e5762be5fa2a55dacf79020674b35d768892ebc0b23716abf44607ee8155a26a` |
| `latest.yml` | `345` | `1d95b39babee5d62068cb6a93b353e703a602ab83defad08b4c2f167bb940a82` |

## 인증 증거

`gh auth status`:

- account: `HardcoreMonk`
- protocol: `https`
- token scopes: `gist`, `read:org`, `repo`
- release create와 asset upload가 성공했다.

내부 전용 앱 기준:

- public code signing certificate trust: release blocker 아님
- SmartScreen reputation: release blocker 아님
- 단, installer warning과 내부 신뢰 절차는 배포 안내에 남겨야 한다.

## 사용 환경 증거

| 명령 | 결과 |
| --- | --- |
| `corepack pnpm lint` | passed |
| `corepack pnpm tsc --noEmit` | passed |
| clean env `corepack pnpm test` | passed, `144 passed / 1 skipped`, `701 passed / 1 skipped` |
| `corepack pnpm pack:electron` | passed, build-info `0.4.3`, commit `51667879` |
| `corepack pnpm smoke:windows:update-metadata` | passed, `latestVersion=0.4.3`, installer/blockmap/app-update.yml 정합성 확인 |
| `corepack pnpm smoke:windows:installer-install` | passed, silent install, installed app launch, `/api/health` `version=0.4.3`, `commit=51667879`, silent uninstall |
| `CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INCLUDE_PRERELEASE=1 CODEXMUX_WINDOWS_UPDATER_CURRENT_VERSION=0.4.2 corepack pnpm smoke:windows:updater-published-channel` | passed, prerelease channel에서 `0.4.2 -> 0.4.3` metadata 확인 |
| `corepack pnpm lifecycle:rollback-dry-run` | passed, `rollbackEnv` 출력, mutation 없음 |
| `corepack pnpm perf:timeline-jsonl` | passed, synthetic 5,000 entries parse `19.29ms`, virtualization recommended |

스모크 후 cleanup 확인:

- `codexmux.exe`, `codexmux-Setup-*.exe`, `old-uninstaller.exe` 잔여 프로세스 없음
- HKCU uninstall registry에 `codexmux` 잔여 entry 없음

## 자동 업데이트 blocker

`corepack pnpm smoke:windows:package-gate`는 `windows-updater-local-feed` 단계에서 blocked.

재현 증거:

- `0.4.2` baseline installer 설치는 성공했다.
- updater는 local feed 또는 GitHub release metadata에서 `0.4.3`을 감지하고 download했다.
- `update-downloaded`와 `quit-and-install-started` event는 발생했다.
- NSIS installer가 `codexmux-Setup-0.4.3.exe --updated /S /D=<installDir>` 상태로 종료되지 않았다.
- 앱 실행 없이 수동으로 `0.4.2` 설치 후 `0.4.3 --updated /S /D=<installDir>`를 실행해도 90초 이상 종료되지 않았다.

판단:

- GitHub Release asset publication과 read-only update metadata는 완료.
- 실제 installed app의 default updater channel 승격은 보류.
- `v0.4.3`은 prerelease로 유지한다. Stable/latest channel 승격은 NSIS `--updated` 적용 경로를 고친 뒤 수행한다.

## 후속 작업

- Windows NSIS assisted installer와 `electron-updater` `quitAndInstall` 조합의 `--updated` hang을 별도 bugfix로 처리한다.
- 처리 전에는 `v0.4.3` prerelease를 stable release로 승격하지 않는다.
- 실제 장시간 workspace 사용은 내부 사용자 3~5명으로 별도 observation window를 둔다.
- Runtime v2 live rollback drill은 Windows service/tray 운영 경계가 정해진 뒤 수행한다.
