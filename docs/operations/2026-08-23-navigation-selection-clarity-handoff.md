# Navigation Selection Clarity 운영 handoff

## 범위

- 일자: 2026-08-23 KST
- Lifecycle: `intake -> writing-spec -> domain-architecture -> grill-me -> plan-design-review -> writing-plans -> plan-eng-review -> implement -> code-review -> release -> operate`
- 대상: Workspace, Sessions, Governance 1차 영역 탐색과 entity selection 명료화
- Release 경계: Linux user service source 배포, restart, commit과 branch push
- 제외: version bump, npm publish, tag와 GitHub Release

## 구현 결과

- desktop expanded/rail과 mobile bottom/sheet가 고정된 Workspace, Sessions, Governance 순서를 공유합니다.
- current route, selected entity, expanded disclosure와 keyboard focus를 별도 ARIA·시각 상태로 표현합니다.
- Workspace 내부 live panel 이름을 Activity로 교정하고 legacy `sidebar-tab=sessions`를 normalize합니다.
- Session result와 Managed Project selection에 neutral marker와 listbox semantics를 적용합니다.
- utility surface와 active webview에서는 core app area를 current로 잘못 표시하지 않습니다.

Release preflight에서 등록 project의 lifecycle evidence 235개가 Runtime IPC 상한 200개를 넘어
Governance lifecycle API가 `500 command-failed`를 반환하는 운영 blocker를 발견했습니다. 사용자 승인
뒤 snapshot maximum을 project document response와 같은 2,000개로 확장했고 2,001개 이상은 계속
거부합니다. Durable schema, write path와 project discovery 범위는 변경하지 않았습니다.

## 배포 결과

| 항목 | 결과 |
| --- | --- |
| UI commit | `ce2d07b4` |
| live build/hotfix commit | `a6a495883e7849712350110e1bf9668b918abf05` |
| branch | `codex/session-catalog-annotation-release-0.4.24` |
| service | `codexmux.service`, `active/running`, PID `3047` → `88057` |
| restart | 2026-08-23 22:57:01 KST, restart count `0` |
| listener | authenticated `0.0.0.0:8122` |
| public health | version `0.4.24`, commit `a6a49588` |
| build time | `2026-08-23T13:56:47.185Z` |
| governance | `state=ready`, `writeState=ready`, refresh 1/1 |
| lifecycle | HTTP 200, stage `operate`, evidence 236개 |
| backup | `runtime-v2-storage-20260823T135639Z`, 5 files |
| permissions | backup directory `0700`, DB/WAL/SHM `0600` |
| journal | restart 이후 warning 이상 entry 없음 |

## 검증 evidence

| Gate | 결과 |
| --- | --- |
| focused Governance contract/IPC/worker | 3 files, 24 tests passed |
| full unit | 270 files passed, 1 skipped; 1,689 tests passed, 3 skipped |
| TypeScript | `corepack pnpm tsc --noEmit` passed |
| lint | 0 errors, existing Next navigation warnings 6개 |
| project design | passed |
| production build | Next Pages Router, custom server와 5개 worker bundle passed |
| live terminal/reconnect | 10 checks passed, temporary Workspace/Tab cleanup passed |
| live Phase 6 | 12 checks passed, worker counters clean |
| live Governance lifecycle | 236 evidence, HTTP 200, no command failure |
| live browser | desktop 3 route current state, mobile Governance current/48px targets, selected project passed |
| browser console | errors 0 |

## 운영 진입과 rollback

Live service는 build `a6a49588`로 운영에 진입했습니다. 문제가 생기면 service를 중지하고 직전 live
source build `322ccfb7`로 되돌린 뒤 restart합니다. Durable state 복원이 필요한 경우 service가 중지된
상태에서 `runtime-v2-storage-20260823T135639Z`의 DB/WAL/SHM과 workspace state 5개를 한 세트로
복원합니다.

Lifecycle evidence가 다시 2,000개에 접근하면 상한을 재확장하지 않고 pagination 또는 summarized
evidence contract를 별도 설계합니다. Governance write 장애에서는 기존
`CODEXMUX_GOVERNANCE_WRITES=1` drop-in을 제거해 새 write를 먼저 차단합니다.
