# Governed Unmarked Adoption 구현 계획

- 날짜: 2026-08-21
- 상태: Approved
- 대상 spec: `docs/superpowers/specs/2026-08-21-governed-unmarked-adoption-design.md`
- 선행 review: `docs/superpowers/reviews/2026-08-21-governed-unmarked-adoption-design-review.md`
- 구현 방식: public behavior 중심 vertical TDD

## 범위

기존 6개 Scaffold Artifact의 unmarked regular UTF-8 file에 대해 2-pass preview와 artifact별
explicit opt-in으로 compact marker-owned block을 EOF에 추가합니다. Existing bytes는 exact prefix로
보존하고 기존 GovernanceActionRun의 private backup, transaction, recovery와 rollback을
재사용합니다.

이번 plan은 auto/full-file adoption, section inference, delete/move/full sync, lifecycle draft,
retention prune, actual live project confirm, live deployment/restart, commit/push와 issue 변경을
포함하지 않습니다.

## Execution Environment Constraints

- Active target: Linux single engine host, systemd user service, POSIX filesystem
- Runtime: Node `>=20.9.0`; 현재 Node 24 계열, Next.js 16.3.1 Pages Router/custom server
- Package manager: `corepack pnpm`
- Process model: Supervisor와 Governance Worker IPC; Next API는 filesystem을 직접 열지 않음
- Storage: `~/.codexmux/backups/governance-actions/`, directory `0700`, manifest/preimage `0600`
- Limits: file 256KiB, action 1MiB, diff 256KiB, artifact 6개, preview TTL 10분
- Browser: desktop Chromium primary, 한국어 기본/영어 병행, mobile 44px touch regression
- Network/GPU/container: 새 요구 없음; local authenticated same-origin API만 사용
- Next contract read: `node_modules/next/dist/docs/02-pages/03-building-your-application/01-routing/07-api-routes.md`
- Live isolation: 현재 service는 이 checkout의 `.next/dist`를 사용하므로 production build와
  build-backed browser smoke는 temporary mirror에서 실행합니다. Source checkout의 ignored build
  output을 직접 교체하거나 live service를 restart하지 않습니다.

## Task 1. Adoption request와 state contract를 TDD로 확장

Files:

- Modify: `tests/unit/lib/governance/scaffold-contracts.test.ts`
- Modify: `src/lib/governance/scaffold-contracts.ts`
- Modify: `src/lib/governance/api-schema.ts`
- Modify: `tests/unit/pages/governance-api.test.ts`

Steps:

1. `adoptArtifacts` default empty, unique, 최대 6, `artifacts` subset을 검증하는 failing contract
   test를 추가합니다.
2. Preview state `adoption-available | adopt`와 confirmed operation `adopt`가 schema
   round-trip되는 failing test를 추가합니다. Public action summary는 변경하지 않습니다.
3. API preview body가 missing `adoptArtifacts`를 `[]`로 normalize하고 invalid subset/duplicate를
   `400`으로 거부하는 test를 추가합니다.
4. 최소 schema/type 변경으로 green을 만듭니다. 기존 caller가 `adoptArtifacts`를 생략해도 API
   compatibility를 유지하되 worker internal parsed type은 항상 배열을 갖게 합니다.
5. Run:

```bash
corepack pnpm vitest run tests/unit/lib/governance/scaffold-contracts.test.ts tests/unit/pages/governance-api.test.ts
```

## Task 2. Byte-preserving marker adoption planner를 TDD로 구현

Files:

- Modify: `tests/unit/lib/governance/scaffold-marker.test.ts`
- Modify: `src/lib/governance/scaffold-marker.ts`

Steps:

1. Empty, LF, CRLF, BOM, no-final-newline, one-final-newline와 existing blank-line fixture에서
   original Buffer가 output의 exact prefix인 failing test를 하나씩 추가합니다.
2. Invalid UTF-8 round-trip, NUL과 marker-like CODEXMUX HTML comment가 fail closed인 test를
   추가합니다.
3. Existing full-document/adoption marker identity를 분류하고 duplicate/nested/malformed/different
   variant를 conflict로 유지하는 test를 추가합니다.
4. `planUnmarkedArtifactAdoption`과 필요한 marker inspection helper를 최소 구현합니다. Existing
   `planMarkerOwnedUpdate`는 지원되는 동일 marker template ID/version에만 사용합니다.
5. Output 생성 뒤 `Buffer.from(output, 'utf8').subarray(0, existing.length).equals(existing)` invariant를
   검증합니다.
6. Run:

```bash
corepack pnpm vitest run tests/unit/lib/governance/scaffold-marker.test.ts
```

## Task 3. Versioned adoption template variant를 catalog에 추가

Files:

- Modify: `tests/unit/lib/governance/scaffold-template-catalog.test.ts`
- Modify: `src/lib/governance/scaffold-template-catalog.ts`

Steps:

1. 6개 artifact가 unique adoption template ID/version과 compact `##` heading을 제공하는 failing
   test를 추가합니다.
2. Render가 deterministic하고 unresolved placeholder, project-specific inferred fact와 full-document
   H1을 포함하지 않는 test를 추가합니다.
3. Optional `adoption` definition과 `renderScaffoldAdoptionTemplate` lookup을 구현합니다.
4. Existing full-document render output과 marker ID를 snapshot/contract 수준에서 보존합니다.
5. Run:

```bash
corepack pnpm vitest run tests/unit/lib/governance/scaffold-template-catalog.test.ts
```

## Task 4. 2-pass preview, digest와 confirm revalidation을 TDD로 구현

Files:

- Modify: `tests/unit/lib/governance/scaffold-preview.test.ts`
- Modify: `src/lib/governance/scaffold-preview.ts`
- Modify: `tests/unit/lib/governance/scaffold-token.test.ts`

Steps:

1. Opt-in 없는 unmarked target이 `adoption-available`이고 confirmed artifacts에는 포함되지 않는
   failing test를 추가합니다.
2. 첫 preview token confirm이 `scaffold-adoption-selection-required`로 거부되는 test를 추가합니다.
3. `adoptArtifacts` opt-in 뒤 `adopt`, adoption variant ID/version, bounded diff와 exact-prefix output이
   생성되는 test를 추가합니다.
4. Missing/owned/non-text/oversized/marker-conflict intent mismatch와 invalid selection test를
   추가합니다.
5. Preview와 confirm 사이 file bytes, adoption selection 또는 marker variant가 바뀌면
   `stale-preview`가 되는 test를 추가합니다.
6. Digest/internal token state에 ordered `adoptArtifacts`, variant ID/version과 base/output fingerprint를
   포함합니다.
7. Marker-owned adopted block은 adoption renderer로 update하고 full-document/adoption variant 사이
   자동 전환을 금지합니다.
8. Run:

```bash
corepack pnpm vitest run tests/unit/lib/governance/scaffold-preview.test.ts tests/unit/lib/governance/scaffold-token.test.ts
```

## Task 5. Action journal/backup/transaction에 `adopt`를 연결

Files:

- Modify: `tests/unit/lib/governance/scaffold-action-journal.test.ts`
- Modify: `tests/unit/lib/governance/scaffold-backup.test.ts`
- Modify: `tests/unit/lib/governance/project-write-transaction.test.ts`
- Modify: `src/lib/governance/scaffold-action-journal.ts`
- Modify: `src/lib/governance/scaffold-backup.ts`
- Modify: `src/lib/governance/project-write-transaction.ts`

Steps:

1. Existing manifest version 1 schema가 변경되지 않고 old runtime과 old manifest가 계속
   `create`/`marker-update`만 읽는 compatibility test를 유지합니다.
2. Confirmed `adopt` operation이 journal write 전에 durable `marker-update`로 normalize되고 non-null
   exact preimage, original mode와 output fingerprint를 갖는 invariant test를 추가합니다.
3. Publish가 existing target same-directory replace를 사용하고 untouched bytes prefix를 보존하는
   transaction test를 추가합니다.
4. Partial publish/startup recovery가 adoption preimage를 exact 복원하고 external writer 시
   `recovery-required`로 중단하는 test를 추가합니다.
5. Later marker update 뒤 과거 adoption rollback이 `rollback-stale`, latest action rollback 뒤 exact
   preimage restore가 가능한 test를 추가합니다.
6. `adopt`를 transaction input의 existing-file operation으로 처리하되 journal artifact state는
   `marker-update`로 저장합니다. New durable field/enum이 없으므로 manifest version 1과 이전
   runtime rollback compatibility를 유지합니다.
7. Run:

```bash
corepack pnpm vitest run tests/unit/lib/governance/scaffold-action-journal.test.ts tests/unit/lib/governance/scaffold-backup.test.ts tests/unit/lib/governance/project-write-transaction.test.ts
```

## Task 6. Governance Worker, IPC, Supervisor와 Pages API 연결

Files:

- Modify: `tests/unit/lib/runtime/governance-worker-service.test.ts`
- Modify: `tests/unit/lib/runtime/session-catalog-ipc.test.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Modify: `tests/unit/pages/governance-api.test.ts`
- Modify: `src/lib/runtime/governance/worker-service.ts`
- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Modify: `src/pages/api/governance/projects/[projectId]/scaffold/preview.ts`
- Modify: `src/lib/runtime/api-handler.ts`

Steps:

1. `adoptArtifacts`가 API → Supervisor → IPC → Governance Worker preview service까지 전달되는 failing
   test를 추가합니다.
2. Worker gate off, project/root binding, adoption selection validation과 sanitized error mapping을
   기존 behavior와 함께 검증합니다.
3. `scaffold-adoption-selection-required`와 adoption intent/text/marker error를 bounded HTTP status로
   mapping하고 raw content/path가 response에 없는 test를 추가합니다.
4. 새 route나 probe API를 만들지 않고 existing POST preview/confirm route만 사용합니다.
5. Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/governance-worker-service.test.ts tests/unit/lib/runtime/session-catalog-ipc.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/pages/governance-api.test.ts
```

## Task 7. 한국어/영어 2-pass drawer UX 구현

Files:

- Modify: `messages/ko/governance.json`
- Modify: `messages/en/governance.json`
- Modify: `src/hooks/use-governance-scaffold.ts`
- Modify: `src/components/features/governance/governance-scaffold-preview-drawer.tsx`
- Modify: `src/pages/governance.tsx`
- Modify: `tests/unit/components/governance-scaffold-panel.test.ts`
- Create: `tests/unit/components/governance-scaffold-preview-drawer.test.ts`
- Modify: `scripts/smoke-session-governance-browser.mjs`

Steps:

1. Preview drawer static render test에 `adoption-available` row, unchecked per-artifact control, `모두 선택` 부재,
   re-preview CTA와 first-pass confirm input 부재를 추가합니다.
2. `adopt` second-pass에서 diff, semantic warning, exact title input과 apply action이 보이는 test를
   추가합니다.
3. Hook이 last preview request를 project/token 단위로 보존하고 re-preview 시 unselected
   `adoption-available` ID를 artifacts에서 제거한 뒤 selected IDs만 `adoptArtifacts`에 넣도록
   구현합니다.
4. Project 변경/drawer close/error에서 pending adoption selection과 unusable token을 폐기합니다.
5. Drawer는 first-pass discovery footer와 second-pass confirmation footer를 명시적으로 분기하고
   busy/expired/focus-visible/44px state를 유지합니다.
6. Error code 원문보다 locale message를 우선하고 recovery guidance를 가까이 표시합니다.
7. Browser smoke에 한국어/영어 discovery → selective re-preview → confirm-ready state와 hydration
   error 부재를 추가합니다.
8. Run:

```bash
corepack pnpm vitest run tests/unit/components/governance-scaffold-panel.test.ts tests/unit/components/governance-scaffold-preview-drawer.test.ts
corepack pnpm smoke:browser:session-governance
```

## Task 8. Adoption integration smoke를 확장

Files:

- Modify: `scripts/smoke-governed-project-scaffold.mjs`
- Modify: `package.json` only if a separate script is demonstrably required
- Modify: `docs/TESTING.md`

Steps:

1. Existing smoke fixture에 unmarked LF/CRLF/no-final-newline file을 추가합니다.
2. First preview `adoption-available`, selective re-preview, exact prefix adoption, adopted marker update,
   exact preimage rollback과 unselected file unchanged를 검증합니다.
3. Invalid UTF-8/NUL/marker-like conflict, stale re-preview와 latest-first rollback rejection을
   포함합니다.
4. Backup/action directory `0700`, manifest/preimage `0600`과 project/Codex source 밖 무변경을
   유지합니다.
5. 기존 `smoke:governance:scaffold`를 확장하는 것을 우선하고 불필요한 package script를 만들지
   않습니다.
6. Run:

```bash
corepack pnpm smoke:governance:scaffold
corepack pnpm smoke:linux:session-governance
corepack pnpm smoke:runtime-v2:storage-backup
corepack pnpm smoke:runtime-v2:phase6-default-gate
```

## Task 9. Canonical docs, code review와 release/operate handoff

Files:

- Modify: `CONTEXT.md`
- Modify: `docs/ADR.md`
- Modify: `docs/PROJECT-DESIGN.md`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/DATA-DIR.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/superpowers/reviews/2026-08-21-governed-unmarked-adoption-code-review.md`
- Create: `docs/operations/2026-08-21-governed-unmarked-adoption-handoff.md`

Steps:

1. 구현 diff를 spec/ADR-032 boundary, security, public privacy, rollback와 locale 기준으로 review하고
   blocking/important finding을 처리합니다.
2. ADR-032에 explicit append-only adoption 구현 근거를 추가하되 새 ADR을 만들지 않습니다.
3. Canonical architecture/data/testing/follow-up 문서를 실제 구현과 검증 결과로 갱신합니다.
4. Handoff에 Release Scope, Verification, Audit, Blockers, Warnings, Residual Risk, Current Lifecycle
   Stage, Next Action과 Follow-Up Tasks를 기록합니다.
5. 실제 live project confirm, deployment/restart, commit/push/issue 변경은 수행하지 않고 별도 운영
   승인 항목으로 남깁니다.

## Final Verification

Focused gate가 green인 상태에서 source-only command를 먼저 실행합니다.

```bash
corepack pnpm check:project-design
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
corepack pnpm smoke:governance:scaffold
corepack pnpm smoke:linux:session-governance
corepack pnpm smoke:runtime-v2:storage-backup
corepack pnpm smoke:runtime-v2:phase6-default-gate
git diff --check
```

Production build와 build-backed browser smoke는 tracked/untracked source를 temporary directory로
mirror하고 `node_modules`는 Turbopack project-root 제한을 지키는 hard-link copy로 재사용한
환경에서 실행합니다. Mirror에는
`.git`, `.next`, `dist`, `_site`, `.ua`와 runtime data를 포함하지 않습니다.

```bash
corepack pnpm build
corepack pnpm smoke:browser:session-governance
```

## Rollback

- Source rollback은 adoption 관련 contract/template/preview/transaction/UI 변경을 한 묶음으로
  되돌리고 기존 unmarked conflict behavior로 복귀합니다.
- Runtime rollback은 `CODEXMUX_GOVERNANCE_WRITES` gate를 제거하고 service를 restart합니다.
- Existing adoption action은 current-output fingerprint가 receipt와 일치할 때만 exact preimage로
  rollback합니다.
- `recovery-required`/`rollback-stale` backup은 삭제하지 않습니다.
