# 세션 운영·프로젝트 거버넌스 통합 구현 계획

**상태:** Approved design — plan engineering review 통과

**작성일:** 2026-08-21

**Spec:** `docs/superpowers/specs/2026-08-21-session-operations-governance-integration-design.md`

**Grill-me:** `docs/superpowers/grill-me/2026-08-21-session-operations-governance-integration.md`

**Engineering review:**
`docs/superpowers/reviews/2026-08-21-session-operations-governance-integration-eng-review.md`

## 목표

Linux 단일 엔진 호스트에서 현재·과거 Codex 세션의 검색·복기·annotation을 제공하고,
등록된 프로젝트의 guidance, knowledge, lifecycle, audit 상태를 읽기 전용으로 통합합니다.
기존 Python/FastAPI 서비스, Bash entrypoint와 별도 인증·DB를 runtime dependency로 넣지
않습니다.

## 이번 계획의 release 범위

포함:

- Phase 1 Session Operations
- Phase 2 Governance Read Model
- 첫 release에 필요한 index rebuild, backup, health, Linux smoke와 운영 문서
- app-owned SQLite의 Managed Project, approved root, session annotation, saved filter, sanitized
  audit state

제외:

- 프로젝트 filesystem을 변경하는 scaffold, sync, lifecycle draft write
- Phase 3 Governance Action의 preview/write/recovery 구현
- 원격 collector, remote node, multi-engine federation
- GSD orchestration, FastAPI, Python collector, 원본 Bash 실행
- Codex JSONL 삭제·retention·migration
- Windows package 기능 parity 또는 새 Windows release gate

Phase 3는 별도 writing-spec, domain pass, Plan Grilling과 plan review를 거쳐야 합니다. 이번
계획에는 실행 가능한 project-write API나 숨겨진 shell command를 추가하지 않습니다.

## 고정 아키텍처

- Linux 한 호스트가 server, worker, tmux, Codex JSONL, app DB와 project read를 소유합니다.
- Timeline Worker는 Session Catalog 목적의 JSONL reader/watcher와
  `~/.codexmux/session-catalog/index.db` 단독 writer입니다.
- Storage Worker만 `~/.codexmux/runtime-v2/state.db`를 씁니다.
- Governance Worker는 등록된 project filesystem과
  `~/.codexmux/governance/index.db`를 소유하지만 첫 release에서는 project file을 쓰지
  않습니다.
- Next API route는 DB나 project file을 직접 열지 않고 Supervisor IPC만 사용합니다.
- Browser는 session id와 project id를 사용합니다. JSONL absolute path는 Session Explorer
  응답에 노출하지 않습니다.
- 기존 Stats parser의 read-only scan은 유지하되 새 watcher나 Session Catalog writer가 되지
  않습니다.

## 실행 규칙

- 각 task는 실패 test를 먼저 추가하고 focused RED/GREEN을 확인합니다.
- API/page 코드를 작성하기 전에 현재 설치된 Next 문서의 다음 파일을 다시 읽습니다.
  - `node_modules/next/dist/docs/02-pages/03-building-your-application/01-routing/01-pages-and-layouts.md`
  - `node_modules/next/dist/docs/02-pages/03-building-your-application/01-routing/07-api-routes.md`
  - `node_modules/next/dist/docs/02-pages/03-building-your-application/03-data-fetching/03-get-server-side-props.md`
- 실제 `~/.codex`, `~/.codexmux`와 project root를 test에서 사용하지 않습니다. 모든 fixture는
  임시 HOME과 임시 root를 사용합니다.
- 기존 dirty worktree의 사용자 변경을 보존합니다.
- 사용자가 요청하지 않았으므로 issue, commit, push, publish, service restart는 수행하지
  않습니다.

## Task 0: Linux 단일 엔진 기준 문서와 ADR 정합화

**Files:** `AGENTS.md`, `CONTEXT.md`, `docs/agents/domain.md`, `docs/ADR.md`,
`docs/PROJECT-DESIGN.md`, `docs/WINDOWS-ONLY-GAP-AUDIT.md`, `docs/README.md`

- [x] ADR-023을 `Archived`로 전환하고 역사적 Windows 전환 근거와 새 ADR reference를
  보존합니다.
- [x] Linux 단일 엔진 호스트를 active product/runtime target으로 승인한 새 ADR을 추가합니다.
- [x] ADR-030의 Windows installer/npm 분리 근거는 보존하되 새 기능 acceptance가 Linux 엔진을
  기준으로 한다는 점을 기록합니다.
- [x] Linux 단일 엔진, Session Catalog, Managed Project, Project Governance, Knowledge Index와
  Project Lifecycle 용어를 canonical 문서에 반영합니다.
- [x] Windows package/update 증거를 삭제하거나 Linux acceptance로 재해석하지 않습니다.
- [x] `docs/WINDOWS-ONLY-GAP-AUDIT.md`를 역사적 Windows release evidence로 명확히 표시합니다.

**검증:**

```bash
git diff --check
corepack pnpm check:project-design
```

## Task 1: 도메인 계약과 sanitized source fixture 고정

**Files:**

- `src/lib/session-catalog/contracts.ts`
- `src/lib/governance/contracts.ts`
- `tests/fixtures/session-catalog/session-basic.jsonl`
- `tests/fixtures/session-catalog/session-tool-agent.jsonl`
- `tests/fixtures/session-catalog/session-sensitive-large.jsonl`
- `tests/fixtures/governance/projects.yaml`
- `tests/fixtures/governance/projects/**`
- `tests/unit/lib/session-catalog/contracts.test.ts`
- `tests/unit/lib/governance/contracts.test.ts`

- [x] `ISessionCatalogEntry`, `ISessionSearchQuery`, `ISessionSearchPage`,
  `ISessionAnnotation`, `ISavedSessionFilter`를 정의합니다.
- [x] `IManagedProject`, `IApprovedProjectRoot`, `IProjectGovernanceSummary`,
  `IProjectDocumentRef`, `ILifecycleEvidence`, `ILifecycleLintResult`를 정의합니다.
- [x] Session id, project id, tag, cursor, relative document path의 길이와 허용 문자를 Zod
  schema로 고정합니다.
- [x] `codex-dashboard/tests/fixtures/codex/*.jsonl`의 behavior만 참고해 credential과 실제 path가
  없는 codexmux fixture를 만듭니다.
- [x] `projects.yaml` fixture는 zone registry의 scalar-only subset, duplicate path, invalid line,
  symlink root와 lifecycle artifact 사례를 포함합니다.
- [x] Public contract에 raw JSONL path, raw tool payload, reasoning, terminal bytes와 full document
  body가 포함되지 않는 test를 추가합니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/session-catalog/contracts.test.ts tests/unit/lib/governance/contracts.test.ts
```

## Task 2: Session Catalog projection과 검색 정책

**Files:**

- `src/lib/session-catalog/jsonl-projector.ts`
- `src/lib/session-catalog/search-policy.ts`
- `tests/unit/lib/session-catalog/jsonl-projector.test.ts`
- `tests/unit/lib/session-catalog/search-policy.test.ts`

- [x] JSONL line을 `user | assistant | ignored` 검색 record로 투영하는 pure parser를 test-first로
  구현합니다.
- [x] user message와 Assistant message text만 허용하고 tool input/output, reasoning,
  encrypted content, image/attachment와 malformed line은 제외합니다.
- [x] control character 제거, 공통 credential pattern redaction, Unicode-safe UTF-8 64KiB
  truncation과 512자 snippet 경계를 고정합니다.
- [x] model, cwd-derived project label, timestamps, turn count와 agent relationship metadata를
  session entry로 투영합니다.
- [x] redaction 전후 원문과 secret 후보가 error, metric, audit에 들어가지 않는 failure test를
  추가합니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/session-catalog/jsonl-projector.test.ts tests/unit/lib/session-catalog/search-policy.test.ts
```

## Task 3: Session Catalog SQLite와 incremental indexer

**Files:**

- `src/lib/session-catalog/schema.ts`
- `src/lib/session-catalog/index-repository.ts`
- `src/lib/session-catalog/indexer.ts`
- `src/lib/session-catalog/query-service.ts`
- `tests/unit/lib/session-catalog/schema.test.ts`
- `tests/unit/lib/session-catalog/index-repository.test.ts`
- `tests/unit/lib/session-catalog/indexer.test.ts`
- `tests/unit/lib/session-catalog/query-service.test.ts`

- [x] 별도 SQLite schema에 session metadata, message content, FTS5 index, file cursor와 index
  health를 둡니다.
- [x] 파일 identity는 canonical path를 API로 노출하지 않는 내부 key로만 사용하고 session id를
  public identity로 사용합니다.
- [x] mtime/size/cursor가 같은 파일은 건너뛰고 append는 마지막 안전 byte부터 처리하며 truncate,
  replacement, malformed tail은 해당 파일만 재투영합니다.
- [x] Search query는 parameter binding과 bounded FTS expression parser를 사용하고 wildcard,
  quote, control input과 pathological query를 fail closed합니다.
- [x] page size는 기본 50, 최대 200으로 두고 opaque cursor를 사용합니다.
- [x] directory는 `0700`, DB/WAL/SHM은 `0600`을 유지합니다.
- [x] reset은 DB/WAL/SHM을 timestamped quarantine으로 이동한 뒤 새 DB를 만들고, compact는
  active index transaction과 직렬화합니다.
- [x] rebuild는 checkpoint, cancellation, bounded batch와 live-event 우선순위를 가집니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/session-catalog/schema.test.ts tests/unit/lib/session-catalog/index-repository.test.ts tests/unit/lib/session-catalog/indexer.test.ts tests/unit/lib/session-catalog/query-service.test.ts
```

## Task 4: Timeline Worker와 Supervisor Session Catalog 경계

**Files:**

- `src/lib/runtime/contracts.ts`
- `src/lib/runtime/ipc.ts`
- `src/lib/runtime/timeline/worker-service.ts`
- `src/lib/runtime/session-catalog-mode.ts`
- `src/lib/runtime/supervisor.ts`
- `src/workers/timeline-worker.ts`
- `tests/unit/lib/runtime/ipc.test.ts`
- `tests/unit/lib/runtime/timeline-worker-service.test.ts`
- `tests/unit/lib/runtime/supervisor.test.ts`
- `tests/unit/lib/runtime/session-catalog-mode.test.ts`

- [x] `timeline.catalog-health`, `timeline.catalog-search`,
  `timeline.catalog-read-entries`, `timeline.catalog-rebuild` command와 strict reply schema를
  추가합니다.
- [x] Session replay는 session id를 worker에서 JSONL path로 해석하고 기존 timeline parser를
  사용합니다. Browser/API reply에는 JSONL path를 포함하지 않습니다.
- [x] 기존 session-index metadata와 shadow 비교 가능한 mode를 추가하고 mismatch는 count와
  sanitized category만 기록합니다.
- [x] Catalog startup/rebuild가 live timeline subscription을 굶기지 않도록 bounded queue와
  event-loop yield를 test합니다.
- [x] Catalog failure는 health를 degraded로 만들되 기존 timeline/status/terminal을 종료하지
  않습니다.
- [x] Supervisor가 모든 catalog call의 유일한 API-facing facade가 되도록 합니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/session-catalog-mode.test.ts
```

## Task 5: Session annotation과 migration-safe app state

**Files:**

- `src/lib/runtime/storage/schema.ts`
- `src/lib/runtime/storage/repository.ts`
- `src/lib/runtime/storage/worker-service.ts`
- `src/lib/runtime/contracts.ts`
- `src/lib/runtime/ipc.ts`
- `src/lib/runtime/storage-backup.ts`
- `src/lib/runtime/supervisor.ts`
- `tests/unit/lib/runtime/storage-repository.test.ts`
- `tests/unit/lib/runtime/storage-worker-service.test.ts`
- `tests/unit/lib/runtime/storage-backup.test.ts`
- `tests/unit/lib/runtime/supervisor.test.ts`

- [x] Additive schema migration에 `session_annotations`와 `session_saved_filters`를 추가합니다.
- [x] Migration 전 state.db/WAL/SHM backup을 만들고 backup 실패 시 schema write를 시작하지
  않습니다.
- [x] pin, unique normalized tags, saved filter CRUD를 Storage Worker command로만 제공합니다.
- [x] Session Catalog search 결과와 annotation 병합은 Supervisor가 두 worker reply를 조합해
  처리합니다.
- [x] unknown session annotation, concurrent update, too-new schema와 corrupt JSON을 fail closed로
  test합니다.
- [x] 기존 workspace/layout/message history migration과 backup smoke를 회귀 검증합니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts tests/unit/lib/runtime/storage-backup.test.ts tests/unit/lib/runtime/supervisor.test.ts
corepack pnpm smoke:runtime-v2:storage-backup
```

## Task 6: Session Operations API와 Session Explorer UI

**Files:**

- `src/lib/runtime/api-auth.ts`
- `src/lib/runtime/api-handler.ts`
- `src/lib/session-catalog/api-schema.ts`
- `src/pages/api/sessions/search.ts`
- `src/pages/api/sessions/health.ts`
- `src/pages/api/sessions/rebuild.ts`
- `src/pages/api/sessions/saved-filters.ts`
- `src/pages/api/sessions/[sessionId]/annotation.ts`
- `src/pages/api/sessions/[sessionId]/entries.ts`
- `src/hooks/use-session-catalog.ts`
- `src/pages/sessions.tsx`
- `src/components/features/session-explorer/**`
- `src/lib/sidebar-items-store.ts`
- `src/components/layout/sidebar.tsx`
- `src/lib/message-namespaces.ts`
- `messages/ko/sessionExplorer.json`
- `messages/en/sessionExplorer.json`
- `messages/ko/sidebar.json`
- `messages/en/sidebar.json`
- `tests/unit/lib/runtime/api-auth.test.ts`
- `tests/unit/pages/session-catalog-api.test.ts`
- `tests/unit/components/session-explorer.test.ts`
- `tests/unit/lib/sidebar-items-store.test.ts`

- [x] Runtime API auth가 credential kind를 구분하도록 확장하고 cookie mutation에는 single
  Host와 same-authority Origin을 요구합니다. CLI token은 Origin 생략을 허용하되 query
  credential은 계속 거부합니다.
- [x] API는 Zod로 query/body를 제한하고 stable 400/401/403/404/409/503 code를 반환합니다.
- [x] Search, filter, pin/tag, saved filter, health와 rebuild API를 Supervisor facade 위에
  구현합니다.
- [x] Session Explorer는 dense result list, model/project/date/tag filter, relationship badge,
  index health와 last indexed time을 표시합니다.
- [x] Result 선택 시 session id 기반 API로 기존 rich timeline presentation을 재사용해 replay
  drawer를 엽니다. Resume나 shell command는 실행하지 않습니다.
- [x] Rebuild confirmation은 Codex 원본 삭제가 아닌 projection 복구임을 ko/en으로 설명합니다.
- [x] `builtin-session-explorer`를 sidebar와 mobile navigation에 추가하고 builtin label을 locale에
  맞게 표시합니다.
- [x] keyboard focus, Arrow navigation, 44px mobile target, `focus-visible`, empty/loading/degraded
  상태를 SSR/static markup test와 browser smoke 대상으로 둡니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/runtime/api-auth.test.ts tests/unit/pages/session-catalog-api.test.ts tests/unit/components/session-explorer.test.ts tests/unit/lib/sidebar-items-store.test.ts
```

## Task 7: Approved Project Root와 `projects.yaml` import 정책

**Files:**

- `src/lib/governance/project-path-policy.ts`
- `src/lib/governance/projects-yaml.ts`
- `src/lib/governance/import-preview.ts`
- `tests/unit/lib/governance/project-path-policy.test.ts`
- `tests/unit/lib/governance/projects-yaml.test.ts`
- `tests/unit/lib/governance/import-preview.test.ts`

- [x] Approved Project Root를 project scan/import보다 먼저 승인해야 하는 host capability로
  구현합니다. 기존 Workspace cwd는 후보일 뿐 자동 승인하지 않습니다.
- [x] Root/project path는 `realpath`, directory type, containment를 확인하고 `..`, symlink escape,
  magic link와 approved root 아래의 nested bind mount를 거부합니다. Approved root 자체가 mount
  point인 것은 허용합니다.
- [x] `/proc/self/mountinfo` parser를 dependency injection 가능하게 분리해 unit test하고 Linux
  smoke에서 실제 fixture root를 검증합니다.
- [x] `projects.yaml`은 top-level `projects` list와 scalar key/value, boolean만 허용하는 기존
  subset을 dependency 없이 strict parse합니다.
- [x] Input은 최대 1MiB, 최대 2,000 entries, field별 길이 제한을 적용하고 duplicate id/path와
  unsupported line을 전체 preview failure로 처리합니다.
- [x] Preview는 digest, source fingerprint, add/update/conflict/unchanged count와 10분 TTL을
  가집니다. Token에 absolute path나 project content를 넣지 않습니다.
- [x] Confirm 시 source fingerprint와 approved root를 다시 확인하고 missing source entry를
  delete/archive로 해석하지 않습니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/governance/project-path-policy.test.ts tests/unit/lib/governance/projects-yaml.test.ts tests/unit/lib/governance/import-preview.test.ts
```

## Task 8: Managed Project catalog와 Storage Worker ownership

**Files:**

- `src/lib/runtime/storage/schema.ts`
- `src/lib/runtime/storage/repository.ts`
- `src/lib/runtime/storage/worker-service.ts`
- `src/lib/runtime/contracts.ts`
- `src/lib/runtime/ipc.ts`
- `src/lib/runtime/supervisor.ts`
- `tests/unit/lib/runtime/storage-repository.test.ts`
- `tests/unit/lib/runtime/storage-worker-service.test.ts`
- `tests/unit/lib/runtime/supervisor.test.ts`

- [x] Additive migration에 `approved_project_roots`, `managed_projects`,
  `managed_project_imports`, `governance_audit_events`를 추가합니다.
- [x] Managed Project id는 app-generated stable id로 두고 canonical path에 unique constraint를
  적용합니다. Imported external id와 source metadata는 별도 field로 보존합니다.
- [x] Register/import mutation은 Storage Worker transaction 하나에서 project와 sanitized audit을
  함께 commit합니다.
- [x] Reimport는 unchanged/add/update/conflict를 구분하고 preview에서 선택한 field만 갱신합니다.
- [x] YAML write-back, 누락 entry 자동 삭제, project file write command가 IPC registry에 없음을
  contract test로 고정합니다.
- [x] Storage snapshot/backup/import 경로가 새 durable table을 보존하는지 검증합니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts
corepack pnpm smoke:runtime-v2:storage-write
corepack pnpm smoke:runtime-v2:storage-backup
```

## Task 9: Governance Worker와 Knowledge Index read model

**Files:**

- `src/lib/governance/document-discovery.ts`
- `src/lib/governance/knowledge-index.ts`
- `src/lib/governance/check-service.ts`
- `src/lib/governance/audit-service.ts`
- `src/lib/governance/vcs-inspector.ts`
- `src/lib/project-lifecycle/artifact-discovery.ts`
- `src/lib/project-lifecycle/state-derivation.ts`
- `src/lib/project-lifecycle/lint-service.ts`
- `src/lib/runtime/governance/worker-service.ts`
- `src/lib/runtime/contracts.ts`
- `src/lib/runtime/ipc.ts`
- `src/lib/runtime/worker-paths.ts`
- `src/lib/runtime/supervisor.ts`
- `src/workers/governance-worker.ts`
- `tsup.config.ts`
- `tests/unit/lib/governance/document-discovery.test.ts`
- `tests/unit/lib/governance/knowledge-index.test.ts`
- `tests/unit/lib/governance/audit-service.test.ts`
- `tests/unit/lib/project-lifecycle/state-derivation.test.ts`
- `tests/unit/lib/project-lifecycle/lint-service.test.ts`
- `tests/unit/lib/runtime/governance-worker-service.test.ts`
- `tests/unit/lib/runtime/worker-paths.test.ts`
- `tests/unit/lib/runtime/supervisor.test.ts`

- [x] `governance-worker`를 dev/production worker resolution, build entry, Supervisor health와
  shutdown에 추가합니다.
- [x] Supervisor가 Storage Worker에서 project snapshot을 읽어 Governance command payload로
  전달하고 Governance Worker가 state.db를 직접 열지 못하게 합니다.
- [x] Document discovery는 AGENTS, CONTEXT, DESIGN, ADR, architecture, spec/plan/review/handoff와
  등록된 wiki root만 분류합니다.
- [x] `.git`, dependency, build, cache, nested worktree와 binary를 제외하고 file count, per-file
  byte, total byte, depth와 timeout quota를 적용합니다.
- [x] Knowledge Index DB에는 relative path, kind, title/headings, fingerprint, link edge와 lint
  status만 저장합니다. Full document body와 secret candidate text는 저장하지 않습니다.
- [x] Lifecycle state는 project-local artifact evidence로 계산하고 ADR state와 project pipeline
  state를 합치지 않습니다.
- [x] Git inspection은 fixed argv와 cwd를 사용하는 기존 helper 경계를 재사용하고 shell string을
  만들지 않습니다.
- [x] Worker failure는 governance health만 degraded로 만들고 terminal, timeline, status와
  Storage Worker를 재시작하지 않습니다.
- [x] 첫 release IPC registry에 project filesystem mutation command가 없음을 test합니다.

**검증:**

```bash
corepack pnpm test tests/unit/lib/governance tests/unit/lib/project-lifecycle tests/unit/lib/runtime/governance-worker-service.test.ts tests/unit/lib/runtime/worker-paths.test.ts tests/unit/lib/runtime/supervisor.test.ts
corepack pnpm build:server
```

## Task 10: Governance API와 운영 중심 UI

**Files:**

- `src/lib/governance/api-schema.ts`
- `src/pages/api/governance/roots/preview.ts`
- `src/pages/api/governance/roots/confirm.ts`
- `src/pages/api/governance/import/preview.ts`
- `src/pages/api/governance/import/confirm.ts`
- `src/pages/api/governance/projects/index.ts`
- `src/pages/api/governance/projects/[projectId]/summary.ts`
- `src/pages/api/governance/projects/[projectId]/documents.ts`
- `src/pages/api/governance/projects/[projectId]/lifecycle.ts`
- `src/pages/api/governance/projects/[projectId]/audit.ts`
- `src/hooks/use-managed-projects.ts`
- `src/pages/governance.tsx`
- `src/components/features/governance/**`
- `src/lib/sidebar-items-store.ts`
- `src/lib/message-namespaces.ts`
- `messages/ko/governance.json`
- `messages/en/governance.json`
- `messages/ko/sidebar.json`
- `messages/en/sidebar.json`
- `tests/unit/pages/governance-api.test.ts`
- `tests/unit/components/governance-read-model.test.ts`
- `tests/unit/lib/sidebar-items-store.test.ts`

- [x] Root approval와 import confirm은 app-state mutation이므로 auth, same-authority Origin,
  preview digest, fingerprint, TTL과 exact confirmation을 요구합니다.
- [x] Project summary/documents/lifecycle/audit는 project id만 받고 Supervisor와 Governance
  Worker를 통해 bounded projection을 반환합니다.
- [x] Document detail은 approved project와 relative path를 다시 검증하고 bounded on-demand
  markdown만 반환합니다. Auth/config, binary, symlink/mount escape는 거부합니다.
- [x] Governance page는 project catalog, engine label, read-only badge, guidance, Knowledge Index,
  lifecycle, audit와 degraded state를 조밀한 master-detail layout으로 제공합니다.
- [x] Phase 3 action은 실행 control로 노출하지 않습니다. 후속 기능은 disabled 설명 또는
  read-only 안내만 표시합니다.
- [x] `builtin-governance` sidebar item과 ko/en label을 추가합니다.
- [x] Loading, empty, partial scan, stale index, permission denied, invalid project와 worker degraded
  상태를 static markup/browser smoke로 검증합니다.

**검증:**

```bash
corepack pnpm test tests/unit/pages/governance-api.test.ts tests/unit/components/governance-read-model.test.ts tests/unit/lib/sidebar-items-store.test.ts
```

## Task 11: Linux health, 성능, smoke와 rollback gate

**Files:**

- `src/lib/runtime/contracts.ts`
- `src/lib/runtime/worker-diagnostics.ts`
- `src/pages/api/v2/runtime/health.ts`
- `scripts/session-catalog-perf-snapshot.ts`
- `scripts/smoke-linux-session-governance.mjs`
- `scripts/smoke-session-governance-browser.mjs`
- `tests/unit/scripts/session-catalog-perf-snapshot.test.ts`
- `tests/unit/scripts/linux-session-governance-smoke-lib.test.ts`
- `package.json`

- [x] Runtime health에 catalog queue lag, cursor age, rebuild state와 governance scan state를
  content-free counter로 추가합니다.
- [x] Synthetic 5,000-session fixture에서 initial index, incremental append, FTS query와 replay
  latency/memory snapshot을 측정합니다. Threshold는 baseline 측정 뒤 plan review 없이 임의로
  낮추지 않습니다.
- [x] Isolated HOME에서 Runtime v2 server, tmux fixture session, Codex JSONL, state DB와 project
  fixture를 시작하는 Linux smoke를 작성합니다.
- [x] Smoke는 search, replay-by-id, pin/tag, root approval, projects.yaml preview/confirm,
  governance read model, no project write와 DB permission을 검증합니다.
- [x] Browser smoke는 ko/en SSR hydration, search, replay drawer, read-only badge, keyboard focus와
  worker degraded recovery를 검증합니다.
- [x] Catalog DB quarantine/rebuild, governance index rebuild와 worker kill/restart가 terminal과
  timeline session을 끊지 않는 rollback drill을 추가합니다.
- [x] `tsup` production output에 governance worker가 포함되고 npm tarball server smoke에서 worker
  resolution이 성공하는지 검증합니다.

**검증:**

```bash
corepack pnpm test tests/unit/scripts/session-catalog-perf-snapshot.test.ts tests/unit/scripts/linux-session-governance-smoke-lib.test.ts
corepack pnpm perf:session-catalog
corepack pnpm smoke:linux:session-governance
corepack pnpm smoke:browser:session-governance
corepack pnpm smoke:npm-package
```

## Task 12: 기준 문서와 operate handoff

**Files:** `docs/ADR.md`, `CONTEXT.md`, `docs/PROJECT-DESIGN.md`,
`docs/ARCHITECTURE-LOGIC.md`, `docs/DATA-DIR.md`, `docs/SYSTEMD.md`, `docs/TMUX.md`,
`docs/TESTING.md`, `docs/FOLLOW-UP.md`, `docs/README.md`,
`docs/operations/2026-08-21-session-operations-governance-integration-handoff.md`

- [x] 구현된 worker ownership, API data flow, storage layout, auth/Origin과 degraded behavior를
  canonical 문서에 반영합니다.
- [x] Session Catalog/Knowledge Index reset·rebuild와 state.db backup/restore를 DATA-DIR과
  TESTING 문서에 기록합니다.
- [x] Linux systemd user service에서 Runtime v2, tmux, worker path와 required data permission을
  확인하는 운영 절차를 기록합니다.
- [x] Phase 3 project write, remote topology, GSD와 full-output search를 FOLLOW-UP에 별도
  lifecycle 항목으로 남깁니다.
- [x] Handoff에 exact command, duration, sanitized 결과, residual risk, rollback과 실제 service
  restart가 수행됐는지를 구분해 기록합니다.
- [x] `TCliState`, `ITabState`, StatusManager나 provider detection을 변경하지 않았다면
  `docs/STATUS.md`를 불필요하게 수정하지 않습니다.

## Task 13: 전체 release-candidate 검증

Focused RED/GREEN을 모두 통과한 뒤 다음 순서로 실행합니다.

```bash
git diff --check
corepack pnpm check:project-design
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm build
corepack pnpm build:server
corepack pnpm smoke:runtime-v2
corepack pnpm smoke:runtime-v2:storage-backup
corepack pnpm smoke:runtime-v2:phase6-default-gate
corepack pnpm perf:session-catalog
corepack pnpm smoke:linux:session-governance
corepack pnpm smoke:browser:session-governance
corepack pnpm smoke:npm-package
```

추가 수동 검증은 사용자가 live service 변경을 승인한 경우에만 수행합니다.

- systemd user service restart 후 health와 worker PID 교체
- 기존 tmux/Codex session reconnect
- 실제 project root read-only scan
- 기존 `projects.yaml` preview 후 no-write-back 확인

## Rollback 기준

- Session Catalog failure: search/replay-by-id만 비활성화하고 기존 workspace timeline과
  `session-index.json` fallback을 유지합니다.
- Catalog corruption: DB/WAL/SHM을 quarantine하고 JSONL에서 rebuild합니다.
- Governance Worker failure: Governance page만 degraded로 전환하고 Managed Project durable
  state를 유지합니다.
- Runtime state migration failure: pre-migration backup을 보존하고 새 worker를 시작하지
  않습니다. 기존 schema를 임의 downgrade하지 않습니다.
- UI regression: 새 builtin item과 page만 숨기며 terminal/input/reconnect surface를
  변경하지 않습니다.
- Windows package, Python collector, Bash service로 fallback하지 않습니다.

## 완료 정의

- Plan Engineering Review의 blocker가 0개입니다.
- Phase 1~2 acceptance와 Linux smoke가 모두 통과합니다.
- `~/.codex`와 등록된 project fixture에 write가 발생하지 않습니다.
- Session Catalog와 Knowledge Index를 삭제해도 canonical source에서 복구됩니다.
- 기존 terminal/status/timeline/runtime v2 full gate가 회귀하지 않습니다.
- 운영 handoff가 release/operate 진입 여부와 남은 Phase 3를 명확히 기록합니다.

## Plan Engineering Review 요약

- Data ownership: Timeline/Storage/Governance worker의 single-writer가 분리됐습니다.
- Security: approved root, session/project id, same-authority mutation, bounded content와 no raw
  path 응답을 고정했습니다.
- Migration: additive schema, pre-migration backup, no downgrade를 요구합니다.
- Testability: pure projection/path/import policy와 worker/API/UI/smoke tier를 분리했습니다.
- Failure isolation: catalog/governance degraded가 terminal/status/timeline을 중단하지 않습니다.
- Scope control: Phase 3 project write와 remote topology는 이 계획에 없습니다.

Engineering blocker 없이 구현 가능한 계획으로 승인합니다.
