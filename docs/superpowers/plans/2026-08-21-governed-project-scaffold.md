# Governed Project Scaffold 구현 계획

- 날짜: 2026-08-21
- spec: `docs/superpowers/specs/2026-08-21-governed-project-scaffold-design.md`
- grill: `docs/superpowers/grill-me/2026-08-21-governed-project-scaffold.md`
- design review: `docs/superpowers/reviews/2026-08-21-governed-project-scaffold-design-review.md`
- ADR: ADR-032 `Implemented`
- 상태: 구현, code review와 release gate 통과. Live write gate는 비활성

## 범위

Linux 단일 엔진의 Governance Worker에 create-only scaffold와 marker-owned update transaction을
추가합니다. Missing file create, 지원 marker version migration/update, preview/confirm,
backup/recovery와 safe rollback만 구현합니다. Existing unmarked adoption, arbitrary write,
delete/move/full sync와 live gate 활성화는 이 plan에 없습니다.

## Execution Environment Constraints

- Linux single host, systemd user service, canonical POSIX path와 `/proc/self/mountinfo`
- Node `>=20.9.0`, TypeScript, Next.js 16 Pages Router API Routes와 custom server
- Runtime v2 child-process IPC와 Governance Worker single writer
- ext4-compatible same-filesystem stage/publish semantics
- Response diff는 action 전체 1MiB 이하이며 Next API default 4MiB response warning 아래 유지
- Browser primary viewport는 desktop이며 Android/iPad는 44px touch target regression 범위
- Production build는 `next build`, `post-build`, `tsup` 뒤 `dist/workers/governance-worker.js`를
  실행하므로 template catalog와 recovery code가 worker bundle에 포함돼야 함
- 현재 worktree의 문서 현행화 변경과 `.ua/`를 보존하며 unrelated change를 정리하지 않음

## Task 1. Scaffold contract, template catalog와 marker policy

Files:

- Add `src/lib/governance/scaffold-contracts.ts`
- Add `src/lib/governance/scaffold-template-catalog.ts`
- Add `src/lib/governance/scaffold-marker.ts`
- Add `tests/unit/lib/governance/scaffold-contracts.test.ts`
- Add `tests/unit/lib/governance/scaffold-template-catalog.test.ts`
- Add `tests/unit/lib/governance/scaffold-marker.test.ts`

Steps:

1. Artifact ID, template input, preview state, diff, receipt, action state, history와 public error의
   interface/Zod schema test를 먼저 작성합니다.
2. Catalog가 정확히 6개 artifact만 제공하고 `DESIGN.md`는 UI project일 때만 선택되며 기본
   선택 정책이 spec과 일치하는 failing test를 작성합니다.
3. `codex-project-mgmt/templates/four-tier-agent-md/`의 의미를 snapshot한 TypeScript template
   catalog를 구현합니다. `CONTEXT.md`는 upstream template이 없으므로 codexmux domain contract의
   최소 template로 별도 정의합니다. Runtime file/network read를 추가하지 않습니다.
4. Marker parser의 exact pair, marker 밖 byte 보존, LF/CRLF, supported forward migration,
   unknown future/different/duplicate/nested/malformed conflict test를 작성합니다.
5. Marker-owned output renderer를 구현하고 file 256KiB, action 1MiB limit을 contract에서
   강제합니다.

Verification:

```bash
corepack pnpm test tests/unit/lib/governance/scaffold-contracts.test.ts tests/unit/lib/governance/scaffold-template-catalog.test.ts tests/unit/lib/governance/scaffold-marker.test.ts
```

## Task 2. Contained target resolution, preview와 token binding

Files:

- Add `src/lib/governance/scaffold-preview.ts`
- Add `src/lib/governance/scaffold-token.ts`
- Modify `src/lib/governance/project-path-policy.ts`
- Add `tests/unit/lib/governance/scaffold-preview.test.ts`
- Add `tests/unit/lib/governance/scaffold-token.test.ts`
- Modify `tests/unit/lib/governance/project-path-policy.test.ts`

Steps:

1. Browser input이 artifact ID만 지정하고 path/output을 지정할 수 없음을 schema test로
   고정합니다.
2. Project snapshot, template input과 selection으로 create, marker-update, unchanged, conflict,
   skipped를 분류하는 preview test를 작성합니다.
3. Bounded unified line diff helper와 output digest를 구현합니다. Diff는 response에만 있고
   stored history/audit에는 넣지 않습니다.
4. Opaque random token을 worker-local preview store에 저장하고 project ID, input, selection,
   template version, base fingerprint, output digest와 10분 TTL을 결합합니다.
5. Existing/missing target과 모든 ancestor의 lstat/realpath, Approved Project Root containment,
   symlink, magic link와 nested mount를 preview/confirm에서 재사용할 resolver로 확장합니다.
6. Preview 뒤 file create/update, token tamper, expiry, project/title 변경과 template version
   변경이 `stale-preview`로 차단되는 test를 통과시킵니다.

Verification:

```bash
corepack pnpm test tests/unit/lib/governance/scaffold-preview.test.ts tests/unit/lib/governance/scaffold-token.test.ts tests/unit/lib/governance/project-path-policy.test.ts
```

## Task 3. Backup, journal, publish와 recovery transaction

Files:

- Add `src/lib/governance/scaffold-backup.ts`
- Add `src/lib/governance/scaffold-action-journal.ts`
- Add `src/lib/governance/project-write-transaction.ts`
- Add `tests/unit/lib/governance/scaffold-backup.test.ts`
- Add `tests/unit/lib/governance/scaffold-action-journal.test.ts`
- Add `tests/unit/lib/governance/project-write-transaction.test.ts`

Steps:

1. Backup root, project/action ID, manifest version, exact preimage/output fingerprint, created
   directory와 publish progress schema test를 작성합니다.
   Manifest는 recovery에 필요한 canonical project path를 private하게 저장하지만 public summary
   mapper가 canonical/backup path, diff, rendered content와 preimage를 제거하는 test도 포함합니다.
2. `0700/0600`, exclusive stage create, regular-file-only preimage read와 SHA-256 검증을
   구현합니다.
3. Journal write는 temp file fsync, rename, parent directory fsync 순서로 구현합니다.
4. Missing ancestor directory는 segment별 생성·재검증하고 manifest에 기록합니다. Rollback은
   action-created empty directory만 역순으로 제거합니다.
5. Missing target은 same-directory stage에서 hard-link no-replace publish합니다. Marker update는
   마지막 identity/fingerprint 재검증 뒤 same-directory atomic replace합니다.
6. 각 publish 뒤 target directory와 progress journal을 fsync합니다. 모든 target 완료 뒤에만
   `committed` marker를 기록합니다.
7. Failure injection으로 첫/중간/마지막 stage, backup, publish, journal과 fsync 실패를 만들고
   정상 isolation에서 pre-action tree가 exact 복원되는지 검증합니다.
8. Durable commit marker가 없는 startup recovery는 rollback합니다. Target이 expected output과
   다르면 외부 write로 판단해 자동 overwrite 없이 `recovery-required`로 남깁니다.
9. Explicit rollback도 current target이 commit receipt fingerprint와 일치할 때만 수행하고
   아니면 `rollback-stale`로 차단합니다.

Verification:

```bash
corepack pnpm test tests/unit/lib/governance/scaffold-backup.test.ts tests/unit/lib/governance/scaffold-action-journal.test.ts tests/unit/lib/governance/project-write-transaction.test.ts
```

## Task 4. Governance Worker, Runtime v2 IPC와 Supervisor 연결

Files:

- Modify `src/lib/runtime/governance/worker-service.ts`
- Modify `src/workers/governance-worker.ts`
- Modify `src/lib/runtime/ipc.ts`
- Modify `src/lib/runtime/contracts.ts`
- Modify `src/lib/runtime/supervisor.ts`
- Modify `tests/unit/lib/runtime/governance-worker-service.test.ts`
- Modify `tests/unit/lib/runtime/supervisor.test.ts`
- Modify `tests/unit/lib/runtime/session-catalog-ipc.test.ts`
- Modify `tests/unit/lib/runtime/worker-diagnostics.test.ts`

Steps:

1. `governance.preview-scaffold`, `confirm-scaffold`, `list-actions`, rollback preview/confirm의
   payload/reply schema를 failing IPC test로 추가합니다.
2. Governance health에 `writeState: disabled|ready|recovering|degraded`를 추가하되 기존 core
   `state` semantics를 보존합니다. `IProjectGovernanceSummary.readOnly` literal은 boolean으로
   변경하고 writeState가 ready일 때만 false가 되도록 contract/test를 갱신합니다.
3. Worker entry가 data directory, backup root와 `CODEXMUX_GOVERNANCE_WRITES === '1'`을 service
   option으로 전달합니다.
4. Worker entry에서 service initialization promise를 즉시 시작하고 모든 command가 이를
   await하게 합니다. Private manifest의 canonical project path를 사용해 Managed Project refresh
   전에도 pending journal recovery를 완료하며 gate off에서도 recovery를 수행합니다.
5. Project별 async lock과 timeout을 추가하고 preview/confirm/rollback/history command를
   transaction service에 연결합니다.
6. Commit/rollback 뒤 current project Knowledge Index와 lifecycle/read model을 refresh합니다.
   Refresh 실패는 receipt `indexState: stale`로 반환합니다.
7. Supervisor method와 return type을 추가하고 injected/unavailable Governance Worker의 degraded
   behavior를 회귀 검증합니다.
8. Action history는 private manifest에서 `GovernanceActionSummary`로 sanitize하며 첫 release에
   별도 DB/JSONL dual-write를 추가하지 않습니다.

Verification:

```bash
corepack pnpm test tests/unit/lib/runtime/governance-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/session-catalog-ipc.test.ts tests/unit/lib/runtime/worker-diagnostics.test.ts
```

## Task 5. Authenticated Pages Router API

Files:

- Modify `src/lib/governance/api-schema.ts`
- Add `src/pages/api/governance/projects/[projectId]/scaffold/preview.ts`
- Add `src/pages/api/governance/projects/[projectId]/scaffold/confirm.ts`
- Add `src/pages/api/governance/projects/[projectId]/actions/index.ts`
- Add `src/pages/api/governance/projects/[projectId]/actions/[actionId]/rollback/preview.ts`
- Add `src/pages/api/governance/projects/[projectId]/actions/[actionId]/rollback/confirm.ts`
- Modify `tests/unit/pages/governance-api.test.ts`

Steps:

1. Next.js Pages Router API guide에 맞춰 method allowlist, `NextApiRequest/Response`, default parsed
   JSON body와 bounded body schema를 사용합니다. App Router route를 추가하지 않습니다.
2. 모든 mutation은 `authorizeRuntimeV2ApiRequest(req, { mutation: true })`를 사용해 configured
   auth와 same-authority Origin을 재사용합니다.
3. Query에는 project/action ID, body에는 catalog artifact ID와 bounded template input/token/
   confirmation만 허용합니다.
4. Absolute project/backup path와 rendered full content가 history/error에 포함되지 않는 API test를
   추가합니다. Preview만 bounded diff를 반환합니다.
5. Gate off, stale, conflict, recovery-required와 index-stale status mapping을 회귀 검증합니다.

Verification:

```bash
corepack pnpm test tests/unit/pages/governance-api.test.ts
```

## Task 6. Project Governance UI와 locale

Files:

- Add `src/hooks/use-governance-scaffold.ts`
- Add `src/components/features/governance/governance-scaffold-panel.tsx`
- Add `src/components/features/governance/governance-scaffold-preview-drawer.tsx`
- Add `src/components/features/governance/governance-action-history.tsx`
- Modify `src/components/features/governance/governance-read-model.tsx`
- Modify `src/pages/governance.tsx`
- Modify `messages/ko/governance.json`
- Modify `messages/en/governance.json`
- Add `tests/unit/components/governance-scaffold-panel.test.ts`
- Modify `tests/unit/components/governance-read-model.test.ts`

Steps:

1. Hook의 selected project reset, form draft, preview TTL, re-preview, confirm, history refresh와
   rollback state test를 작성합니다.
2. Project summary 아래 full-width Scaffold panel에 template input, UI project toggle와 artifact
   states를 구현합니다. Conflict/unchanged는 disabled하고 이유/수동 adoption 안내를 표시합니다.
3. Drawer에 project-relative path, template version migration과 bounded unified diff를 monospace
   horizontal scroll로 표시합니다.
4. Exact project title confirmation, expiry countdown, busy/disabled/focus-visible와 44px action
   target을 구현합니다.
5. Header badge와 persistent banner가 disabled, ready, recovering, degraded, recovery-required와
   committed/index-stale를 color 외 label/icon으로 구분하게 합니다.
6. Action history와 safe rollback preview/confirm을 구현합니다.
7. 한국어·영어 message를 함께 추가하고 SSR locale hydration과 기존 read-only UI regression을
   검증합니다.

Verification:

```bash
corepack pnpm test tests/unit/components/governance-scaffold-panel.test.ts tests/unit/components/governance-read-model.test.ts
corepack pnpm tsc --noEmit
```

## Task 7. Linux/browser smoke, 문서와 release gate

Files:

- Add `scripts/smoke-governed-project-scaffold.mjs`
- Modify `scripts/smoke-session-governance-browser.mjs`
- Modify `package.json`
- Modify `docs/ARCHITECTURE-LOGIC.md`
- Modify `docs/DATA-DIR.md`
- Modify `docs/PROJECT-DESIGN.md`
- Modify `docs/SYSTEMD.md`
- Modify `docs/TESTING.md`
- Modify `docs/FOLLOW-UP.md`
- Modify `docs/ADR.md`

Steps:

1. Isolated HOME, temporary Approved Project Root와 gate on server로 missing create, supported marker
   update, unmarked conflict, stale preview, commit, rollback과 startup recovery를 검증합니다.
2. Project tree와 `~/.codex/sessions/`는 선택 artifact 외 unchanged인지 snapshot으로 검증하고
   backup/journal mode가 `0700/0600`인지 확인합니다.
3. Browser smoke를 ko/en Scaffold preview, conflict disabled, exact confirmation, action history,
   safe rollback과 recovery banner까지 확장합니다.
4. Gate off smoke에서 write API가 fail closed하고 기존 Session Operations/Project Governance read
   model과 terminal Phase 6가 유지되는지 확인합니다.
5. Data directory, worker flow, feature gate, backup/recovery, testing과 follow-up 제한을 canonical
   문서에 반영합니다.
6. Engineering/code review evidence가 통과하면 ADR-032를 `Approved`로, release artifact가
   구현되면 `Implemented`로 전이합니다. Live gate는 이 plan에서 활성화하지 않습니다.

Verification:

```bash
corepack pnpm smoke:governance:scaffold
corepack pnpm smoke:browser:session-governance
corepack pnpm smoke:linux:session-governance
corepack pnpm smoke:runtime-v2:storage-backup
corepack pnpm smoke:runtime-v2:phase6-default-gate
```

## Task 8. Code review와 최종 검증

1. Requirement fit, path/write security, crash recovery, privacy, UI state, packaging과 unrelated
   regression을 diff 기준으로 review합니다.
2. Blocking/high finding을 수정하고 focused regression을 다시 실행합니다.
3. 다음 final gate를 실행합니다.

```bash
git diff --check
corepack pnpm check:project-design
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm build
corepack pnpm smoke:governance:scaffold
corepack pnpm smoke:browser:session-governance
corepack pnpm smoke:linux:session-governance
corepack pnpm smoke:runtime-v2:storage-backup
corepack pnpm smoke:runtime-v2:phase6-default-gate
```

4. Release scope, verification, audit, blocker, gate-off deployment와 live enable 조건을
   `docs/operations/2026-08-21-governed-project-scaffold-handoff.md`에 기록합니다.
5. Commit, push, issue 변경, live build/restart와 gate 활성화는 별도 명시 요청 전 수행하지
   않습니다.

## Rollback Summary

- Code rollback: feature gate default off이며 이전 build로 되돌릴 수 있습니다.
- Runtime rollback: `CODEXMUX_GOVERNANCE_WRITES`를 제거하고 service restart합니다.
- Action rollback: exact receipt fingerprint가 유지된 file만 preimage로 복원합니다.
- Interrupted action: durable commit marker가 없으면 startup rollback, 외부 변경 감지 시
  `recovery-required`입니다.
- Projection rollback: Knowledge Index는 quarantine/rebuild하며 project source나 action backup을
  삭제하지 않습니다.
