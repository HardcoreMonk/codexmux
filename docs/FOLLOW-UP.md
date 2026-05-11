# 후속 작업

이 문서는 release 전 확인, 내부 배포 단계, post-MVP backlog를 추적합니다. 현재 우선순위는 Windows-only 내부 배포 가능 상태를 만드는 것입니다.

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

## 릴리스 전 확인

필수 검증:

```bash
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm pack:electron
corepack pnpm smoke:windows:package-gate
```

Published update 검증:

- GitHub Release에 `latest.yml`을 올립니다.
- 같은 release에 `codexmux-Setup-<version>.exe`를 올립니다.
- matching `.blockmap` asset을 올립니다.
- 설치된 낮은 버전 앱 기준 published channel metadata를 확인합니다.
- `quitAndInstall` 후 새 앱 launch와 `/api/health`를 확인합니다. published install
  기준 `0.4.15 -> 0.4.16` updater apply가 통과했으며, post-update health는
  `version=0.4.16`, `commit=13fe69ba`입니다.
- 내부 전용 배포이므로 public code signing certificate와 SmartScreen reputation은 필수 검증에서 제외합니다.
- 설치 경고나 내부 신뢰 절차가 있으면 release note와 설치 안내에 기록합니다.

## 내부 배포 단계

1. 내부 release note를 작성합니다.
2. 설치/업데이트 안내를 배포합니다.
3. 3~5명이 실제 workspace로 장시간 사용합니다.
4. Terminal 생성, workspace 생성, Codex session mapping, updater, 종료/재실행을 확인합니다.
5. 문제가 없으면 내부 전체 배포로 확장합니다.

## 남은 차단 항목

| 항목 | 상태 |
| --- | --- |
| GitHub-hosted release asset과 published metadata | 완료: 최신 기준 `v0.4.16`, `latest.yml`, NSIS installer, `.blockmap`, zip asset 확인 |
| 실제 설치된 낮은 버전 앱에서 GitHub-hosted 최신 버전으로 `quitAndInstall` | 완료: `v0.4.15` installer baseline에서 `v0.4.16` published release로 apply, post-update health `version=0.4.16` 확인 |
| Long-running installed app session | 대기 |
| 제품명/app id/data dir의 codexwinmux 전환 여부 결정 | 대기 |
| Runtime v2 live rollback drill evidence | dry-run 완료, live drill 대기 |
| 측정 기반 perf tuning | synthetic perf snapshot 완료, 실제 workspace trace 대기 |
| Phase 6 closeout | 대기 |

## 비차단 항목

| 항목 | 결정 |
| --- | --- |
| Public code signing certificate trust | 내부 전용 앱이라 release blocker가 아님 |
| SmartScreen reputation | 내부 전용 앱이라 release blocker가 아님 |

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
