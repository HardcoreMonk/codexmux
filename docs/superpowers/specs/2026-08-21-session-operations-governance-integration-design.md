# 세션 운영·프로젝트 거버넌스 통합 설계

- 작성일: 2026-08-21
- 상태: Approved — writing-plans
- 대상: codexmux Linux 단일 엔진 호스트
- 원본 기능: `codex-dashboard`, `codex-project-mgmt`

## 문제

Codex 세션 실행과 실시간 상태는 codexmux가 제공하지만, 전체 세션 검색·복기와
프로젝트 거버넌스는 별도 애플리케이션과 Linux 중심 스크립트에 분산되어 있습니다.
사용자는 실행 중인 세션, 과거 기록, 사용량, 프로젝트 규칙, lifecycle 상태를 서로 다른
도구에서 확인해야 합니다.

두 원본 프로젝트를 그대로 포함하면 Python/FastAPI, 독립 Bash entrypoint, zone 경로,
별도 인증과 별도 저장소가 codexmux 안에 중복됩니다. 목표는 서비스를 묶는 것이 아니라 검증된
기능을 codexmux의 TypeScript, Pages Router, custom server, Runtime v2 경계로 이식하는
것입니다.

## 목표

- 현재 세션과 과거 세션을 하나의 Codex 중심 운영 흐름으로 연결합니다.
- 전체 메시지 검색, 세션 복기, 관계·사용량 분석을 기존 timeline/status/stats 위에
  구현합니다.
- Linux 엔진 호스트에 등록한 프로젝트의 guidance, knowledge, lifecycle, audit 상태를
  codexmux UI에서 확인합니다.
- 프로젝트 파일을 바꾸는 작업은 preview, 명시적 확인, allowlist, sanitized audit을
  거칩니다.
- Codex CLI 원본과 프로젝트별 lifecycle 산출물의 source-of-truth 경계를 보존합니다.

## 제품 원칙

1. `codexmux`는 범용 dashboard가 아니라 Codex session 운영 surface입니다.
2. 원본 저장소의 UI와 프레임워크는 이전 대상이 아닙니다. 사용자 가치와 검증된 규칙만
   TypeScript 모듈로 이식합니다.
3. `~/.codex`는 계속 읽기 전용입니다. 원본 세션 삭제 기능은 제공하지 않습니다.
4. 세션 index와 lifecycle run JSON은 계산 가능한 projection입니다.
5. project-local spec, plan, review, handoff와 ADR이 lifecycle의 기준입니다.
6. Linux path, symlink containment, file lock, systemd user service 검증이 1급 요구사항입니다.

## 확정 토폴로지

1차 통합은 **Linux 단일 엔진 호스트**로 고정합니다.

- 한 대의 Linux 호스트가 codexmux custom server, Runtime v2 worker, Codex CLI, tmux,
  Codex JSONL, app-owned DB와 Managed Project filesystem을 소유합니다.
- Browser는 primary client이며, Electron이나 다른 OS의 browser는 이 호스트에 접속할 수
  있지만 session source, worker 또는 project writer가 되지 않습니다.
- 원격 node, collector, multi-engine federation과 central governance는 Phase 5 전까지
  runtime contract에 포함하지 않습니다.
- 기존 Windows package와 updater 근거는 삭제하지 않습니다. 최종 설계 승인에 따라 기존
  ADR-023은 구현 전 ADR lifecycle에서 archive하고 Linux 단일 엔진 결정을 새 ADR로
  기록합니다.

## 현재 codexmux 자산

| 영역 | 재사용할 구현 |
| --- | --- |
| 세션 발견 | `src/lib/session-index.ts`, Runtime v2 Timeline Worker |
| 세션 복기 | `src/lib/codex-session-parser.ts`, timeline WebSocket과 UI |
| 실시간 상태 | Status Worker, status state machine, approval queue, notification |
| 사용량 | `src/lib/stats/`, Codex `token_count`와 model parsing |
| 관계 | `agentSessionId`, agent session relationship projection |
| 앱 상태 | Runtime v2 Storage Worker와 `runtime-v2/state.db` |
| 실행 안전성 | named action allowlist, exact confirmation, sanitized JSONL audit |
| UI | Pages Router, page shell, sidebar built-in item, shadcn/ui, ko/en locale |

## 기능 이전 분류

### `codex-dashboard`

| 원본 기능 | 처리 | 이유 |
| --- | --- | --- |
| JSONL 수집과 세션 목록 | Adapt | 기존 Timeline Worker와 session index를 확장해 중복 watcher를 피함 |
| 메시지 전문 검색 | Adopt | app-owned rebuildable search projection 필요 |
| 세션 replay와 대화 viewer | Merge | 현재 rich timeline을 canonical presentation으로 사용 |
| 실시간 4단계 상태 | Replace | codexmux Status Worker의 typed state를 사용하고 원본 payload 결함을 이식하지 않음 |
| token/model/cost 분석 | Replace | codexmux의 실제 `token_count` parser와 stats cache를 사용 |
| 전역 timeline·agent 분석 | Adapt | 기존 timeline/session relationship 위에 cross-session projection 추가 |
| pin, tag, export | Adopt | annotation은 app state, export는 sanitized view에서 생성 |
| 세션 삭제·retention | Reject | Codex 소유 `~/.codex` read-only 정책과 충돌 |
| DB backup·compact | Adapt | app-owned DB만 대상으로 제한 |
| 원격 collector와 node | Defer | Linux 단일 엔진 범위 밖이며 별도 topology 설계 필요 |
| Governance UI | Merge | 아래 Project Governance context의 UI로 통합 |

### `codex-project-mgmt`

| 원본 기능 | 처리 | 이유 |
| --- | --- | --- |
| `projects.yaml` registry | Adapt | Managed Project catalog로 import하고 Linux canonical path를 사용 |
| project auto-register | Adapt | 사용자가 승인한 root만 bounded scan |
| AGENTS/DESIGN/docs scaffold | Adopt | template version과 preview diff를 포함한 TypeScript service로 이식 |
| raw/wiki sync | Adapt | 중복 raw tree 대신 project-local 문서를 읽는 Knowledge Index를 기본값으로 사용 |
| wiki/frontmatter/link check | Adopt | cross-platform validator로 이식 |
| zone audit | Adapt | Git/guidance/drift/secret 후보를 sanitized project audit로 변환 |
| lifecycle draft와 lint | Adopt | project-local artifact 기준, preview 기본값과 draft metadata 유지 |
| GSD CLI | Defer | 원본 구현이 아직 미커밋 상태이며 core lifecycle 이후 검토 |
| systemd timer/path unit | Adapt | 기존 Linux user service와 worker-owned scheduler/watch 경계에 통합 |
| 외부 skill installer | Reject | 문서·template 계약만 이식하고 installer/hook은 실행하지 않음 |

## 제안 아키텍처

```text
Browser / optional remote Electron
  -> Linux Single Engine Host
      -> Next.js Pages API
          -> Runtime v2 Supervisor
              -> Timeline Worker
                  -> Codex JSONL read/watch
                  -> Session Catalog + Search Projection
              -> Status Worker
                  -> Live Codex state / approval / notification
              -> Storage Worker
                  -> Workspace state
                  -> Managed Project / Session Annotation / Audit
              -> Governance Worker (new)
                  -> Project discovery / knowledge index
                  -> Check / audit / lifecycle preview and lint
                  -> Confirmed allowlisted file actions
```

원본 Python 서비스와 Bash entrypoint는 runtime dependency로 포함하지 않습니다.
기능별 fixture와 acceptance behavior를 먼저 고정한 뒤 TypeScript로 옮깁니다.

Worker ownership은 다음처럼 단일 writer로 고정합니다.

- Timeline Worker는 Session Catalog를 위한 raw JSONL read/watch와
  `session-catalog/index.db` write/query를 소유합니다. Rebuild는 checkpoint가 있는 bounded
  batch로 실행하고 live timeline 처리를 우선합니다.
- 기존 Stats parser의 read-only history scan은 Usage Insights 경계에 남길 수 있지만 별도
  watcher나 Session Catalog DB writer가 될 수 없습니다.
- Storage Worker만 `runtime-v2/state.db`를 씁니다. Governance Worker는 catalog snapshot과
  mutation을 Supervisor IPC를 통해 Storage Worker에 요청합니다.
- Governance Worker는 등록된 project filesystem의 유일한 reader이며, Phase 3부터 유일한
  governed writer가 됩니다. Next API route는 project filesystem을 직접 읽거나 쓰지 않습니다.

## Bounded Context

### Session Operations

Local Codex Session의 검색, 복기, 관계, annotation, export를 담당합니다.

- `Codex Session Source`: `~/.codex/sessions/**/*.jsonl`, read-only
- `Session Catalog`: session metadata와 search projection
- `Session Annotation`: pin, tag, saved filter 등 app-owned durable state
- `Session Replay`: 기존 rich timeline presentation

Timeline Worker가 Session Catalog 목적의 원본 JSONL 읽기와 file watch를 계속 단독
소유합니다. 검색을 위해 별도 watcher를 만들지 않습니다. 기존 Usage Insights의 read-only
history scan은 별도 bounded context로 유지하되 live watcher나 search DB writer 역할을
겸하지 않습니다.

### Usage Insights

현재 stats parser와 cache를 기준으로 token, model, project, activity, daily report를
제공합니다. 원본 dashboard의 0 값 cost compatibility pipeline은 이식하지 않습니다.

### Project Governance

`Workspace`와 `Managed Project`를 구분합니다.

- Workspace는 pane/tab/layout을 묶는 실행 aggregate입니다.
- Managed Project는 root path, guidance policy, knowledge source, lifecycle 상태를 묶는
  거버넌스 aggregate입니다.
- Approved Project Root는 사용자가 project 등록·import·scan 전에 명시적으로 승인한 host
  filesystem capability입니다.
- Workspace directory는 Managed Project와 연결될 수 있지만 동일한 entity가 아닙니다.

### Project Lifecycle

Project pipeline은 기존 runtime lifecycle과 다른 도메인입니다. UI와 API에서 다음 용어를
분리합니다.

- `Runtime Operations`: worker mode, health, deploy/restart action
- `Project Lifecycle`: spec, domain architecture, grill, plan, review, release, operate
- `ADR Lifecycle`: Draft, Review, Approved, Implemented, Verified, Archived

### Knowledge Index

Project-local `AGENTS.md`, `CONTEXT.md`, `DESIGN.md`, ADR, architecture docs와 명시적으로
등록된 Wiki root를 탐색합니다. Index는 navigation/search projection이며 사람이 쓴 원본을
대체하지 않습니다.

## 도메인 아키텍처 Pass

이 섹션의 용어와 경계는 Plan Grilling 기준선입니다. 전체 설계 승인 뒤 `CONTEXT.md`와
`docs/ADR.md`의 canonical 용어와 플랫폼 결정을 갱신합니다.

### 기준 용어 후보

| 용어 | 의미 |
| --- | --- |
| Session Operations | 현재·과거 Local Codex Session을 검색, 복기, annotation하는 영역 |
| Session Catalog | Codex JSONL에서 계산한 session metadata와 search projection |
| Session Annotation | pin, tag, saved filter처럼 사용자 소유인 session 부가 상태 |
| Usage Insights | token, model, project, activity, report를 제공하는 기존 stats 영역 |
| Managed Project | 거버넌스 대상 root path와 policy를 가진 project aggregate |
| Approved Project Root | project 등록·import·scan을 허용한 Linux canonical root capability |
| Project Governance | guidance, knowledge, check, audit와 제한된 file action 영역 |
| Knowledge Index | project-local 문서를 탐색하기 위한 재생성 가능한 projection |
| Project Lifecycle | spec부터 operate까지 project artifact로 판단하는 workflow |
| Runtime Operations | runtime worker health, mode, deploy/restart action 영역 |
| Governance Action | allowlist된 project file 작업과 그 preview/confirm/audit 계약 |

거부하거나 한정할 표현:

- `dashboard`: 원본 제품명이나 화면 유형 설명 외에는 codexmux 제품 정체성으로 사용하지
  않습니다.
- `lifecycle`: API, type, UI에서 단독으로 쓰지 않고 `project lifecycle` 또는
  `runtime operations`로 한정합니다.
- `workspace project`: Workspace와 Managed Project를 합친 entity를 만들지 않습니다.
- `zone root`: 기존 `projects.yaml` import 문맥 외에는 Linux canonical project root 이름으로
  사용하지 않습니다.
- `tmux backend`: tmux를 도메인 경계로 승격하지 않고 Linux Terminal Runtime의
  infrastructure adapter로 한정합니다.
- `Windows bridge`, `Windows companion integration`: 기존 거부 용어를 유지합니다.

### Aggregate와 Value Object 후보

| 종류 | 후보 | 책임 |
| --- | --- | --- |
| Aggregate | `ManagedProject` | root identity, title, policy, lifecycle/knowledge source 설정 |
| Aggregate | `GovernanceActionRun` | preview digest, confirmation, 실행 상태, audit summary |
| Entity | `ApprovedProjectRoot` | 허용한 canonical root와 승인 evidence |
| Entity | `SessionCatalogEntry` | session id, project, model, timestamps, relationship, index cursor |
| Entity | `SessionAnnotation` | session별 pin, tags, saved metadata |
| Entity | `ProjectDocument` | project-relative path, kind, fingerprint, index status |
| Value Object | `CanonicalProjectPath` | Linux realpath와 allowlisted root 검증 결과 |
| Value Object | `FileFingerprint` | preview와 confirm 사이의 stale write 차단 값 |
| Value Object | `LifecycleEvidence` | artifact path, gate, derived status, warning |
| Value Object | `SanitizedAuditSummary` | 본문·credential을 제외한 action 결과 |

`SessionCatalogEntry`와 `ProjectDocument`는 projection입니다. 원본 JSONL이나 project file을
소유하지 않습니다.

### Folder와 module 후보

```text
src/lib/session-catalog/
  contracts.ts
  index-repository.ts
  indexer.ts
  query-service.ts
  search-policy.ts

src/lib/governance/
  contracts.ts
  project-catalog.ts
  project-path-policy.ts
  knowledge-index.ts
  check-service.ts
  audit-service.ts
  action-service.ts

src/lib/project-lifecycle/
  artifact-discovery.ts
  state-derivation.ts
  draft-plan.ts
  lint-service.ts

src/components/features/session-explorer/
src/components/features/governance/
src/pages/api/sessions/
src/pages/api/governance/
src/workers/governance-worker.ts
```

Timeline Worker 내부의 raw JSONL reader와 watcher는 유지합니다. `session-catalog/indexer.ts`는
그 이벤트를 소비하며 `~/.codex/sessions`를 독립적으로 다시 감시하지 않습니다.

### 공개 계약 후보

- `ISessionCatalogEntry`, `ISessionSearchQuery`, `ISessionSearchPage`
- `ISessionAnnotation`, `IUpdateSessionAnnotationInput`
- `IManagedProject`, `IApprovedProjectRoot`, `IRegisterManagedProjectInput`
- `IProjectGovernanceSummary`, `IProjectDocumentRef`
- `IGovernanceActionPreview`, `IRunGovernanceActionInput`
- `TProjectLifecycleStage`, `TProjectLifecycleState`
- `ILifecycleEvidence`, `ILifecycleLintResult`

API와 function signature에는 absolute path나 문서 본문을 기본 응답으로 포함하지 않습니다.
Project path는 server-side id로 해석하고, 문서 본문 조회는 등록된 project와 bounded relative
path를 함께 검증하는 별도 endpoint로 제한합니다.

Project root approval, 등록과 import preview만 operator가 입력한 absolute root 문자열을
받을 수 있습니다. Server가 이를 canonicalize하고 명시적 root approval 뒤 project id를
발급합니다. 이후
list/action API는 project id를 사용하며 canonical absolute path는 인증된 detail 요청에서만
필요할 때 반환합니다.

### Adapter와 infrastructure 경계

- Timeline Worker adapter: Codex JSONL read/watch와 Session Catalog projection 전달
- Search repository: app-owned SQLite FTS와 rebuild/compact/health
- Project filesystem adapter: Linux realpath, symlink containment, atomic create/update
- VCS inspector: Git branch/upstream/dirty 상태의 sanitized projection
- Governance template source: bundled, versioned, overwrite 금지 template
- Linux service host: 기존 systemd user service와 worker-owned timer/watch integration
- Export adapter: bounded CSV/JSON/Markdown stream과 redaction

### ADR 검토 결과

Session Catalog ownership, Governance Worker 도입, Managed Project 분리, lifecycle namespace
분리는 되돌리기 어렵고 실제 trade-off가 있으므로 ADR 후보입니다. Linux 단일 엔진
토폴로지는 사용자가 승인했으며 구현 전 ADR-023을 archive하고 새 ADR로 기록합니다. 검색
본문 저장 정책도 ADR에 포함합니다.

## 저장과 Source Of Truth

| 데이터 | 위치 후보 | 성격 |
| --- | --- | --- |
| Codex JSONL | `~/.codex/sessions/` | Codex 소유 canonical, read-only |
| Session search index | `~/.codexmux/session-catalog/index.db` | 삭제·재생성 가능한 projection |
| Knowledge index | `~/.codexmux/governance/index.db` | 삭제·재생성 가능한 projection |
| Approved Project Root | `~/.codexmux/runtime-v2/state.db` | 사용자 승인 durable capability |
| Managed Project | `~/.codexmux/runtime-v2/state.db` | 사용자 소유 durable canonical state |
| Session annotation | Runtime v2 app state | 사용자 소유 durable state |
| Governance audit | Runtime v2 app state 또는 sanitized JSONL | durable operation evidence |
| Project lifecycle | `<project>/docs/superpowers`, `docs/operations`, ADR | project-local canonical |
| Lifecycle run JSON | `<project>/docs/lifecycle/runs/` | 계산된 snapshot/index |

Session search index는 사용자 입력과 Assistant 응답의 text body만 저장합니다. 각 item은
정규화·redaction 뒤 UTF-8 64KiB로 제한하고, 검색 snippet은 최대 512자로 같은 저장 본문
경계 안에서만 생성합니다. Raw tool input/output, reasoning, image·attachment payload, terminal
byte stream은 검색 대상과 DB 저장 대상에서 제외합니다. Index DB와 WAL/SHM은 Linux user만
읽을 수 있는 권한으로 생성하고 전체 reset/rebuild를 지원합니다. Redaction은 방어 계층이며
원본에 secret이 없다는 보장을 의미하지 않습니다.

Managed Project catalog는 Runtime v2 Storage Worker가 단독으로 쓰는 app-owned SQLite를
기준 저장소로 사용합니다. 기존 `projects.yaml`은 명시적 preview와 확인을 거치는 반복 가능한
단방향 import source입니다. Import는 Linux `realpath`를 project identity로 정규화해 중복을
병합하고 source와 import 시각을 기록합니다. YAML에는 write-back하지 않으며, 재import 때
사라진 entry도 자동 삭제하거나 archive하지 않습니다. 기존 catalog 값과 충돌하는 변경은
preview에서 분리해 사용자가 선택한 field만 갱신합니다.

## API와 Worker 경계

- Browser는 path, command text, shell 문자열을 조립하지 않습니다.
- 신규 API는 `/api/sessions/*`와 `/api/governance/*` 아래의 bounded request만 받습니다.
- 파괴적이거나 파일을 쓰는 API는 named action id, preview token, exact confirmation을
  요구합니다.
- Worker IPC는 기존 typed envelope와 Zod schema를 확장합니다.
- Next API route는 DB 파일이나 project file을 직접 변경하지 않습니다.
- Governance action은 project별 단일 writer lock과 timeout을 사용합니다.
- Audit에는 action, target project id, status, duration, summary만 저장하고 prompt, 문서
  본문, stdout/stderr, credential은 저장하지 않습니다.
- 모든 browser API와 WebSocket은 기존 configured auth와 same-authority Origin 정책을
  재사용합니다. Fresh setup은 loopback에 머물며 remote browser 접속은 configured 상태에서
  명시적으로 허용한 listener를 restart한 뒤에만 가능합니다.

## UI 정보 구조

마케팅형 dashboard를 만들지 않고 기존 page shell 안에 조밀한 운영 화면을 추가합니다.

| Surface | 역할 |
| --- | --- |
| Session Explorer | 검색, 필터, pin/tag, 관계, replay 진입 |
| Stats | 기존 token/model/project/activity 분석을 확장 |
| Project Governance | project catalog, guidance/knowledge/check/audit 상태 |
| Project Lifecycle | artifact-derived stage, preview, lint, confirmed draft generation |
| Runtime Operations | 기존 runtime health/action 화면. Project Lifecycle과 분리 |

Linux 엔진에 접속하는 browser를 primary로 설계하고 한국어·영어 locale, keyboard focus,
`focus-visible`, dense table, bounded preview를 유지합니다. Electron은 동일한 server 계약을
사용하는 선택 client로 둡니다.

화면은 현재 연결한 engine label, Session Catalog index 상태와 last indexed time,
Governance의 read-only/Phase 3 enabled 상태를 명시합니다. Phase 2에서 project write action을
실행 가능한 control처럼 노출하지 않으며, 후속 기능임을 설명하는 disabled 상태 또는 read-only
badge를 사용합니다. Index reset/rebuild는 원본 삭제가 아니라 projection 복구 작업임을
확인 문구에서 구분합니다.

## 보안과 파일 변경

- 프로젝트 root는 scan/import 전에 Approved Project Root로 명시적으로 승인하고 등록 시
  canonical path로 정규화해 승인 root 밖 접근을 막습니다.
- symlink, bind mount와 `..` 경로 탈출을 Linux 실기 테스트로 검증합니다.
- scan은 `.git`, dependency, build, cache, worktree directory를 제외합니다.
- 기존 문서는 자동 overwrite하지 않습니다. 생성 또는 marker-owned block update만 허용합니다.
- write 전에 preview digest와 현재 file fingerprint를 발급하고 confirm 시 다시 검증합니다.
- secret scan 결과는 후보 위치와 분류만 노출하고 secret 원문은 응답·audit에 저장하지 않습니다.
- Codex 원본 세션, auth/config, terminal output을 export나 Knowledge Index에 포함하지 않습니다.

## 복구와 Rollback

- Session Catalog가 corrupt하거나 schema upgrade에 실패하면 search만 degraded로 전환하고
  terminal, status와 기존 timeline은 계속 동작합니다. DB, WAL, SHM을 격리한 뒤 원본
  JSONL에서 rebuild할 수 있습니다.
- Runtime v2 schema 변경은 additive migration과 migration 전 backup을 사용합니다. 실패 시
  새 catalog/governance 기능만 비활성화하고 기존 workspace state를 이전 schema reader로
  임의 downgrade하지 않습니다.
- Governance Worker 실패는 project read model만 degraded로 만들며 terminal/session runtime을
  재시작하지 않습니다.
- Phase 3 project write는 기능 gate를 별도로 두고 실패 시 자동 재실행하지 않습니다.
  Partial write는 atomic publish 또는 marker-owned block 단위로 복구하며 audit에 sanitized
  failure만 남깁니다.
- 원격 collector나 Python/Bash 서비스로 fallback하지 않습니다.

## 단계적 제공

### Phase 1 — Session Operations

- Session Catalog와 search projection
- 전체 세션 검색·필터·replay
- pin/tag/saved filter
- 기존 stats와 관계 분석 연결

### Phase 2 — Governance Read Model

- Managed Project 등록과 기존 `projects.yaml` import
- guidance/ADR/architecture/lifecycle 상태 조회
- Knowledge Index와 project audit preview
- 첫 release 경계: project filesystem은 read-only이며 app-owned catalog/index/audit state만
  변경

### Phase 3 — Governed Actions

- scaffold/sync/check/audit의 TypeScript 구현
- lifecycle draft preview/write/lint
- exact confirmation, fingerprint, audit, recovery

### Phase 4 — Operations Consolidation

- app-owned DB backup/compact/rebuild
- unified audit read model
- systemd user service, worker scheduler와 Linux host smoke

### Phase 5 — Optional Topologies

- remote node/collector
- central multi-host project governance
- GSD orchestration UI

## 제외 범위

- FastAPI와 Python collector를 codexmux에 내장
- 원본 Bash governance script를 browser command 또는 runtime dependency로 직접 실행
- Codex CLI 원본 세션 삭제 또는 migration
- Wiki나 lifecycle snapshot을 source of truth로 승격
- 일반 shell command 실행 UI
- UI 전체 rewrite
- App Router 전환

## ADR 후보

1. Session Catalog는 Codex JSONL의 rebuildable projection이며 Timeline Worker가 원본 읽기를
   단독 소유합니다.
2. Project Governance는 새 worker boundary로 분리하고 file mutation은 typed allowlisted
   action으로만 수행합니다.
3. Managed Project는 Workspace와 별도 aggregate입니다.
4. Project Lifecycle과 Runtime Operations의 용어·상태·API namespace를 분리합니다.
5. Linux 단일 엔진 호스트가 session, worker, project write를 단독 소유하며 원격
   collector와 multi-engine topology는 기본 runtime에 포함하지 않습니다.

## 성공 기준 초안

- 사용자가 과거 Codex 메시지를 검색하고 기존 rich timeline으로 복기할 수 있습니다.
- 현재 status와 과거 session projection이 같은 session id/relationship 계약을 사용합니다.
- token/model/cost 값은 codexmux parser 결과를 사용하고 의미 없는 0 호환 데이터를 만들지
  않습니다.
- 등록한 Linux project의 guidance, ADR, lifecycle 상태를 한 화면에서 확인할 수 있습니다.
- Phase 1~2는 project filesystem에 쓰지 않으며, Phase 3의 모든 project write는 preview,
  confirmation, file fingerprint, audit을 통과합니다.
- `~/.codex`에는 어떤 기능도 쓰지 않습니다.
- app-owned index를 삭제해도 Codex 원본과 project lifecycle 산출물에서 복구할 수 있습니다.
- Linux host에서 worker, tmux, SQLite, realpath boundary, systemd service, backup/rebuild
  smoke가 통과합니다.

## 열린 결정

Plan Grilling에서 사용자 결정이 필요한 제품 선택은 모두 확정했습니다. 구현 전 ADR
documentation gate에서 ADR-023을 archive하고 Linux 단일 엔진 결정을 새 ADR로 기록합니다.

## Plan Design Review

| 평가 항목 | 결과 | 보완 내용 |
| --- | ---: | --- |
| Information architecture | 9/10 | Session Explorer, Governance, Project Lifecycle, Runtime Operations를 분리했습니다. |
| Ownership와 data flow | 9/10 | Timeline, Storage, Governance worker의 source와 single-writer 경계를 고정했습니다. |
| 상태·gate 명확성 | 9/10 | Phase 2 read-only와 Phase 3 write enabled 상태를 UI/API/release gate에서 분리했습니다. |
| Operator error prevention | 9/10 | project id, server canonicalization, preview/confirm과 index reset 의미를 명시했습니다. |
| Privacy와 access | 8/10 | bounded/redacted FTS, user-only DB 권한, 기존 auth/Origin 정책을 고정했습니다. |
| Recovery와 rollback | 9/10 | projection rebuild, additive migration, worker degradation과 no-fallback을 분리했습니다. |
| Locale와 accessibility | 9/10 | ko/en, dense operations UI, focus-visible과 read-only 상태 copy를 요구합니다. |

Overall design score는 9/10입니다. 설계 차단 이슈는 없습니다. 기존 ADR-023/ADR-030,
`AGENTS.md`, `CONTEXT.md`의 Windows 기준을 Linux 단일 엔진 목표와 정합화하는 작업은
구현 전 documentation/ADR gate이며 열린 제품 선택은 아닙니다. Full-output search, remote
collector와 Phase 3 file write는 각각 별도 acceptance gate를 통과하기 전 활성화하지 않습니다.

## 문서 영향

설계 승인 뒤 writing plan은 최소한 다음 문서 갱신을 포함해야 합니다.

- `AGENTS.md`, `CONTEXT.md`, `docs/agents/domain.md`: Linux 단일 엔진 기준 용어와 제품 목표
- `docs/ADR.md`: ADR-023/ADR-030 정합성, Session Catalog와 Governance ownership
- `docs/PROJECT-DESIGN.md`, `docs/ARCHITECTURE-LOGIC.md`: worker와 API data flow
- `docs/DATA-DIR.md`: Session Catalog, Managed Project, Knowledge Index와 reset/rebuild
- `docs/SYSTEMD.md`, `docs/TMUX.md`: Linux service host와 terminal runtime acceptance
- `docs/TESTING.md`: search privacy, realpath containment, worker degradation, migration/rollback
- `docs/WINDOWS-ONLY-GAP-AUDIT.md`: 기존 Windows 근거의 역사적 범위와 새 Linux 기준의 관계
- `docs/README.md`: 신규 spec, plan과 운영 handoff 문서 맵

## Spec Freeze Snapshot

- 상태: 승인 완료 — writing-plans 입력
- Problem: 세션 운영과 프로젝트 거버넌스가 세 제품에 분산되어 있음
- Users / actors: Linux codexmux 엔진 운영자, browser 사용자, Codex agent
- Approved domain terms: Session Operations, Session Catalog, Session Annotation, Usage Insights,
  Approved Project Root, Managed Project, Project Governance, Knowledge Index, Project Lifecycle,
  Runtime Operations, Governance Action
- Architecture boundaries: Linux 단일 엔진, Timeline Worker Session Catalog raw JSONL
  reader/watcher와 search DB 단독 writer, Storage Worker durable app state 단독 writer,
  Governance Worker project read model/action owner
- Requirements: 위 목표와 성공 기준 초안
- Non-goals: 원본 서비스 내장, Codex 원본 write, general shell UI
- Decisions from grill-me: 1차 topology는 Linux 단일 엔진 호스트; 검색 index는 bounded,
  redacted user/Assistant text만 저장; Managed Project는 Runtime v2 SQLite canonical,
  `projects.yaml`은 preview 기반 단방향 import; 첫 release의 project filesystem은 read-only
- Decisions from plan-design-review: worker single-writer와 IPC 경계, 64KiB message/512자 snippet,
  기존 auth/Origin 재사용, read-only UI state, projection/migration/worker rollback 계약
- Environment assumptions: Linux engine host, browser primary, Pages Router, Runtime v2, tmux,
  systemd user service
- Open risks: platform ADR 문서 전파, redaction 검증, Phase 3 project file write safety
- Writing-plans input: `docs/superpowers/plans/2026-08-21-session-operations-governance-integration.md`
