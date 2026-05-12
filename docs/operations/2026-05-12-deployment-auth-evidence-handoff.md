# 2026-05-12 배포/인증/사용 환경 증거 handoff

## 범위

- 실제 GitHub Release 자산 배포 여부를 확인했다.
- GitHub CLI 인증 상태와 repository 접근 권한을 확인했다.
- Windows installer 설치, packaged launch, `/api/health` 사용 환경 증거를 확인했다.
- 내부 전용 앱 조건에 따라 public code signing certificate와 SmartScreen reputation은 release blocker에서 제외했다.
- 자동 업데이트 적용 경로는 `v0.4.15 -> v0.4.16` published installer baseline smoke로 실제 적용까지 확인했다.

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

## 자동 업데이트 blocker 처리

상태: resolved.

원인:

- NSIS assisted installer의 silent `--updated` update apply가 install file 교체 뒤
  process settle까지 오래 걸렸다.
- smoke가 updater installer settle을 120초만 기다려 실제 완료 전에 blocked로
  판단했다.
- cleanup 단계에서 uninstaller를 직접 실행하면 Windows 파일 잠금/EPERM에 걸릴 수
  있어 반복 실행성이 낮았다.

처리:

- `build-resources/installer.nsh`를 추가하고 `electron-builder.yml`의
  `nsis.include`로 연결했다.
- silent `--updated` install section 뒤 `quitSuccess`를 명시해 assisted installer가
  성공 종료를 반환하도록 했다.
- updater install smoke는 짧은 isolated 설치 경로를 기본값으로 사용하고,
  installer settle timeout을 300초로 늘렸다.
- update smoke cleanup은 uninstaller 실행 대신 registry key와 isolated install
  directory를 직접 정리한다. uninstaller 자체 검증은
  `smoke:windows:installer-install`에서 담당한다.

검증:

| 명령 | 결과 |
| --- | --- |
| `corepack pnpm vitest run tests/unit/electron/updater-smoke.test.ts tests/unit/scripts/windows-installer-smoke-lib.test.ts tests/unit/scripts/windows-updater-local-feed-smoke-lib.test.ts tests/unit/scripts/windows-electron-packaging-smoke-lib.test.ts` | passed, `29 passed` |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm pack:electron` | passed, 새 `codexmux-Setup-0.4.8.exe` 생성 |
| `corepack pnpm smoke:windows:update-metadata` | passed, `latestVersion=0.4.8`, `codexmux-Setup-0.4.8.exe` metadata 확인 |
| `CODEXMUX_WINDOWS_UPDATER_LOCAL_FEED_BASE_INSTALLER_PATH=release\\codexmux-Setup-0.4.2.exe corepack pnpm smoke:windows:updater-local-feed` | passed, `0.4.2 -> 0.4.8` updater apply, installer settle, post-update launch, cleanup 확인 |
| `corepack pnpm smoke:windows:package-gate` | passed, zip/update metadata/local updater/packaged launch/runtime v2/installer runtime v2 전체 통과 |

## 후속 작업

- `v0.4.16`을 최신 Windows 내부 배포 기준 release로 사용한다.
- 실제 장시간 workspace 사용은 내부 사용자 3~5명으로 별도 observation window를 둔다.
- Runtime v2 live rollback drill은 Windows service/tray 운영 경계가 정해진 뒤 수행한다.

## 최종 published updater 증거

중간 진단:

- `v0.4.8`, `v0.4.9`, `v0.4.10`은 published updater 경로를 진단하기 위한
  release였다.
- Electron 프로세스 내부 HTTPS 요청이 현재 Windows 세션에서 timeout되어
  Windows updater HTTP executor를 PowerShell `Invoke-WebRequest` 기반으로
  교체했다.
- zip baseline은 NSIS installed state가 아니어서 post-update version 검증에
  부적합했다. smoke에 `/api/health.version` 검증을 추가해 false-positive를 막았다.
- stale `codexmux.exe` tasklist 항목이 NSIS process-name scan을 막아
  `build-resources/installer.nsh`에서 내부 updater가 관리하는 silent install path의
  process scan을 우회했다.

최종 배포 자산:

| Release | URL | Commit | 역할 |
| --- | --- | --- | --- |
| `v0.4.15` | <https://github.com/HardcoreMonk/codexmux/releases/tag/v0.4.15> | `13dc1429` | 실제 installer baseline |
| `v0.4.16` | <https://github.com/HardcoreMonk/codexmux/releases/tag/v0.4.16> | `13fe69ba` | 최신 published updater target |

최종 검증:

| 명령 | 결과 |
| --- | --- |
| clean env `corepack pnpm test` | passed, `145 passed / 1 skipped`, `718 passed / 1 skipped` |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint --quiet` | passed |
| `corepack pnpm pack:electron` | passed, `0.4.16`, build-info commit `13fe69ba` |
| `corepack pnpm smoke:windows:update-metadata` | passed, `latestVersion=0.4.16`, `codexmux-Setup-0.4.16.exe` |
| `corepack pnpm smoke:windows:packaged-runtime-v2` | passed, health `version=0.4.16`, `commit=13fe69ba`, runtime v2 terminal 확인 |
| `corepack pnpm smoke:windows:installer-install` | passed, stale tasklist가 있는 세션에서 silent install, launch, uninstall 확인 |
| `CODEXMUX_WINDOWS_PUBLISHED_BASE_INSTALLER_PATH=release\\codexmux-Setup-0.4.15.exe CODEXMUX_WINDOWS_UPDATER_PUBLISHED_GENERIC_FEED=1 corepack pnpm smoke:windows:updater-published-install` | passed, `0.4.15 -> 0.4.16`, GitHub Release asset download, `quitAndInstall`, installer settle, post-update health `version=0.4.16`, `commit=13fe69ba`, cleanup 확인 |

인증/사용 환경 판단:

- GitHub CLI `repo` scope 인증으로 release/tag/asset push가 완료됐다.
- 내부 전용 앱이므로 public code signing certificate와 SmartScreen reputation은 계속
  release blocker가 아니다.
- packaged/installer launch smoke는 isolated Windows user dirs에서 local server
  health, Electron bridge, login surface, runtime v2 terminal을 확인했다.

후속 자동 처리 증거:

| 명령 | 결과 |
| --- | --- |
| `corepack pnpm smoke:windows:runtime-v2-rollback-drill` | passed, 설치 앱 silent install 후 runtime v2 `on -> off -> restored` 전환. off 상태는 인증 후 `/api/v2/runtime/health` `404 runtime-v2-disabled`, 복구 후 Phase 6 gate 통과 |
| `CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_DURATION_MS=300000 CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_MAX_ROUNDS=24 corepack pnpm smoke:windows:installed-observation` | passed, `0.4.16` 설치본 302,808ms 관찰, 23회 반복 실행, 모든 round `version=0.4.16`, `commit=13fe69ba`, Phase 6 gate 통과, silent uninstall 확인 |
| `corepack pnpm perf:timeline-jsonl` | passed, synthetic 2,500 turns / 5,000 entries, parse `19.67ms`, virtualization `recommended` |

제품명/app id/data dir 결정:

- 현 `codexmux` release line은 published updater와 기존 data dir 증거를 보존하기 위해
  `productName=codexmux`, `appId=com.hardcoremonk.codexmux`, `~/.codexmux`를 유지한다.
- `codexwinmux` 명칭은 별도 제품 line 또는 data migration ADR이 준비될 때 전환한다.
