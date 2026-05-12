# codexwinmux 제품 line 분리와 migration 기준

이 문서는 `codexmux` 기반을 Windows 설치형 제품인 `codexwinmux`로 분리할 때의
운영 기준입니다. 현재 결정은 in-place rename이 아니라 별도 제품 line입니다.

## 결정

| 항목 | `codexmux` line | `codexwinmux` line |
| --- | --- | --- |
| 저장소 | `HardcoreMonk/codexmux` | `HardcoreMonk/codexwinmux` |
| 역할 | 원본 기반, architecture 기준, smoke 증거 보존 | Windows 내부 배포 제품 기준 |
| productName | `codexmux` 유지 | `codexwinmux` 권장 |
| appId | `com.hardcoremonk.codexmux` 유지 | `com.hardcoremonk.codexwinmux` 권장 |
| data dir | `~/.codexmux` 유지 | `~/.codexwinmux` 또는 Windows product-local equivalent 권장 |
| updater channel | `codexmux` GitHub Release | `codexwinmux` GitHub Release |

`codexmux`에서 `productName`, `appId`, data dir을 직접 바꾸지 않습니다. 기존
published update evidence와 내부 사용자 data ownership을 보존하기 위해서입니다.

## Migration 원칙

- side-by-side 설치를 기본값으로 둡니다.
- `codexwinmux`는 `codexmux` updater channel에서 자동으로 넘어오지 않습니다.
- 기존 `~/.codexmux`는 삭제하지 않습니다.
- `~/.codex`는 Codex CLI 소유 영역이므로 계속 read-only로 참조합니다.
- auth token, push subscription, trace token, raw prompt, terminal output은 migration하지 않습니다.
- workspace 목록, UI 설정, runtime v2 state는 schema version이 맞을 때만 명시적 importer로 이동합니다.
- importer는 dry-run summary, copied/skipped count, rollback 안내를 출력해야 합니다.

## 권장 migration 순서

1. `codexwinmux` repo에서 package/app identity를 고정합니다.
2. 새 data dir을 정하고 ADR에 기록합니다.
3. 빈 data dir으로 first-run smoke를 통과시킵니다.
4. `~/.codexmux/config.json`과 `workspaces.json`의 sanitized field만 dry-run import합니다.
5. runtime v2 SQLite는 schema version과 migration checksum이 일치할 때만 import합니다.
6. import 후 `smoke:windows:packaged-runtime-v2`, installer smoke, rollback drill을 실행합니다.
7. old data dir 삭제는 운영자 수동 작업으로만 안내합니다.

## Release blocker

- `latest.yml`, NSIS installer, `.blockmap`, zip asset이 같은 release에 있어야 합니다.
- published channel smoke가 이전 버전에서 새 버전을 감지해야 합니다.
- published install smoke가 `quitAndInstall`, installer settle, post-update health를 확인해야 합니다.
- installed observation smoke와 runtime v2 rollback drill이 통과해야 합니다.
- 내부 전용 앱이므로 public code signing certificate와 SmartScreen reputation은 blocker가 아닙니다.

## Rollback

`codexwinmux` migration 실패 시 `codexmux` data dir을 건드리지 않았다는 점이 rollback
경계입니다. 운영자는 `codexwinmux`를 제거하고 기존 `codexmux` 설치본 또는 원본 repo
기준 smoke로 되돌릴 수 있어야 합니다.
