# Governed Unmarked Adoption 설계

- 날짜: 2026-08-21
- 상태: Approved
- Lifecycle stage: `release`
- 선행 결정: ADR-032, Governed Project Scaffold Phase 3

## 문제

현재 scaffold는 missing file 생성과 기존 codexmux marker block 갱신만 허용합니다. 기존
`AGENTS.md`, `CONTEXT.md`, `DESIGN.md` 또는 `docs/agents/*.md`가 marker 없이 존재하면
`unmarked-file-conflict`로 종료합니다. 이는 기존 문서를 보호하지만 실제 project에서 managed
guidance를 점진적으로 도입할 방법이 없습니다.

이번 slice는 기존 문서 전체의 소유권을 획득하지 않고, 사용자가 artifact별로 명시적으로 선택한
경우에만 파일 끝에 작은 codexmux-owned marker block을 추가합니다. 기존 bytes는 그대로 prefix로
보존하고 이후 update는 새 block 안에서만 수행합니다.

## 목표

- 기존 unmarked regular UTF-8 text file을 artifact별 명시적 opt-in으로 adoption합니다.
- 기존 file bytes를 exact prefix로 보존하고 EOF 뒤에만 managed block을 추가합니다.
- 신규 file용 full-document template과 adoption용 compact block template을 분리합니다.
- 기존 preview token, exact project title confirmation, backup/journal/recovery와 rollback 경계를
  그대로 사용합니다.
- UI에서 conflict, adoption 가능, adoption 선택과 managed update를 명확히 구분합니다.

## Non-goals

- 기존 문서 전체 또는 일부를 자동으로 marker로 감싸기
- 의미 기반 section 탐색, heading 선택 또는 insertion point 편집
- 기존 본문의 rewrite, merge, 정렬, formatting 또는 line-ending normalization
- `adopt all` 또는 project-wide implicit adoption
- arbitrary overwrite, delete, move, rename와 full sync
- Project Lifecycle draft 생성 또는 lifecycle state 변경
- 실제 Managed Project confirm, live deployment, commit, push와 issue 변경

## 승인된 제품 결정

1. 기존 bytes는 byte-prefix로 보존하고 EOF에만 marker block을 추가합니다.
2. Adoption은 신규 file template을 재사용하지 않고 artifact별 compact block template과 별도
   marker template ID를 사용합니다.
3. `adoptArtifacts`는 artifact별 명시적 opt-in이며 기본값은 빈 목록입니다. 일괄 adoption은
   제공하지 않습니다.
4. 빈 file은 byte 0부터 marker를 작성합니다. 다른 file은 기존 line ending을 사용해 빈 줄로
   분리한 뒤 marker를 추가합니다.
5. invalid UTF-8, NUL, marker-like CODEXMUX comment가 이미 있는 file은 fail closed합니다.
6. 기존 preview drawer와 exact project title confirmation을 재사용합니다. Adoption selection은
   token/digest에 결합하고 confirm 직전 다시 검증합니다.

## 사용자 흐름

1. 사용자가 Managed Project와 scaffold artifact를 선택해 첫 preview를 요청합니다.
2. Worker가 존재하는 unmarked artifact를 confirm 불가 `adoption-available`로 반환합니다.
3. Preview drawer가 `adoption-available` artifact마다 unchecked
   `기존 문서에 관리 블록 추가` control을 표시합니다.
4. 사용자가 artifact별로 선택하고 `선택 반영 후 다시 미리보기`를 실행합니다. 선택한 row는
   `artifacts`와 `adoptArtifacts`에 모두 남고, 선택하지 않은 `adoption-available` row는 다음
   `artifacts`에서 제외됩니다. 기존 create/marker-update 선택은 유지됩니다.
5. 두 번째 preview는 새 token/digest를 만들고 artifact를 `create`, `marker-update`, `adopt`,
   `unchanged`, `conflict`, `skipped`로 구분합니다. Adoption diff와 기존 본문 비소유 안내를
   표시하며 첫 token은 confirm할 수 없습니다.
6. 사용자가 exact project title을 입력해 두 번째 preview를 confirm합니다.
7. Worker는 project/root binding, artifact/adoption selection, current bytes, marker absence, path/mount와
   digest를 재검증한 뒤 기존 transaction으로 publish합니다.
8. Action History와 rollback은 adoption을 별도 state로 표시하고 exact preimage를 복원합니다.

## Template와 marker 계약

각 `IScaffoldTemplateDefinition`은 기존 full-document render 계약과 별도로 다음 adoption 계약을
가질 수 있습니다.

```typescript
interface IScaffoldAdoptionTemplateDefinition {
  templateId: string;
  version: number;
  render: (input: TScaffoldTemplateInput) => string;
}
```

첫 release에서는 기존 6개 catalog artifact가 모두 adoption template을 제공합니다.

| Artifact | Adoption marker template ID | Compact block heading |
| --- | --- | --- |
| `agents` | `project-agents-adopted` | `## Codexmux Managed Workflow` |
| `context` | `project-context-adopted` | `## Codexmux Managed Domain Guidance` |
| `design` | `project-design-adopted` | `## Codexmux Managed UI Contract` |
| `agent-issue-tracker` | `agent-issue-tracker-adopted` | `## Codexmux Managed Issue Rules` |
| `agent-triage-labels` | `agent-triage-labels-adopted` | `## Codexmux Managed Triage Rules` |
| `agent-domain` | `agent-domain-adopted` | `## Codexmux Managed Domain Rules` |

Adoption block은 additive workflow/security/source-of-truth guidance만 포함하고 기존 project의
purpose, domain term, tracker backend 또는 visual identity를 추측하지 않습니다. 이후 preview는
full-document marker와 adopted marker를 모두 같은 artifact의 지원되는 owner로 인식하되, 발견한
marker variant에 해당하는 renderer만 사용합니다. 서로 다른 variant로 자동 전환하지 않습니다.

## Byte-preserving append

- Existing target은 regular file, 256KiB 이하, NUL 없음, UTF-8 round-trip exact여야 합니다.
- UTF-8 검증은 decode 뒤 `Buffer.from(decoded, 'utf8')`가 원본 bytes와 같은지 확인합니다.
- 기존 bytes는 output의 정확한 prefix여야 합니다. 기존 범위의 line ending이나 BOM을 바꾸지
  않습니다.
- 빈 file은 marker block만 출력합니다.
- non-empty file이 line ending으로 끝나지 않으면 기존 style의 line ending 두 개를 추가합니다.
- line ending 하나로 끝나면 하나를 더 추가하고, 이미 빈 줄로 끝나면 separator를 추가하지
  않습니다.
- 새 marker block은 기존 file에 CRLF가 하나라도 있으면 CRLF, 아니면 LF를 사용합니다.
- broad marker-like HTML comment가 하나라도 있으면 adoption하지 않습니다. Valid owned marker는
  기존 marker-update path로, malformed/different marker는 기존 conflict path로 보냅니다.
- Confirm은 current bytes가 preview의 base fingerprint와 같고 output이 해당 bytes를 exact
  prefix로 가지는지 다시 확인합니다.

## Request와 state 계약

Preview request는 다음 필드를 추가합니다.

```typescript
interface IScaffoldPreviewRequest {
  artifacts: TScaffoldArtifactId[];
  adoptArtifacts: TScaffoldArtifactId[];
  input: TScaffoldTemplateInput;
}
```

- `adoptArtifacts`는 unique이며 `artifacts`의 subset이어야 합니다.
- 기본값은 `[]`이고 최대 크기는 catalog artifact 수 6입니다.
- missing 또는 이미 marker-owned artifact를 adoption 대상으로 요청하면 intent mismatch
  conflict로 처리합니다.
- Public preview state에 confirm 불가 `adoption-available`과 실행 가능한 `adopt`를 추가하고,
  confirmed preview operation에도 `adopt`를 유지합니다. Public action summary는 artifact operation을
  노출하지 않습니다.
- Token digest에는 ordered `artifacts`, ordered `adoptArtifacts`, input, base/output fingerprint,
  template variant/version과 public state를 포함합니다.
- Public response, audit와 action history에는 canonical/backup path, original content와 rendered
  content를 포함하지 않습니다.

첫 error code 후보:

| Code | 의미 |
| --- | --- |
| `scaffold-adoption-selection-required` | 첫 preview에 `adoption-available` artifact가 있어 confirm할 수 없음 |
| `scaffold-adoption-target-missing` | adoption 대상으로 고른 file이 preview 시점에 없음 |
| `scaffold-adoption-target-owned` | adoption 대상으로 고른 artifact가 이미 marker-owned임 |
| `scaffold-adoption-invalid-utf8` | exact UTF-8 round-trip이 불가능함 |
| `scaffold-adoption-marker-conflict` | marker-like CODEXMUX comment가 이미 존재함 |

## Transaction, recovery와 rollback

`GovernanceActionRun`의 transaction 단계는 바꾸지 않습니다. Adoption artifact는 existing file의
exact preimage를 private backup에 저장하고 stage/journal/fsync/publish/commit 순서를 따릅니다.

- Confirmed operation `adopt`는 existing target이므로 same-directory atomic replace를 사용합니다.
  Durable manifest에서는 이전 runtime rollback compatibility를 위해 기존 `marker-update` state로
  normalize합니다. Manifest schema/version과 recovery 의미를 확장하지 않습니다.
- confirm 직전 current fingerprint와 exact-prefix output invariant를 모두 검증합니다.
- partial publish 또는 durable commit 전 interruption은 기존 compensating rollback/startup
  recovery를 사용합니다.
- external writer가 output을 바꾼 경우 overwrite하지 않고 `recovery-required` 또는
  `rollback-stale`로 보존합니다.
- rollback은 exact preimage bytes와 mode를 복원합니다.
- adopted marker가 이후 version update된 뒤 최초 adoption action을 직접 rollback하는 dependency
  탐색은 이번 범위가 아닙니다. Current output fingerprint가 receipt와 다르면 기존 규칙대로
  `rollback-stale`로 거부하고 UI는 최신 action부터 되돌리도록 안내합니다.
- Adoption preimage는 자동 prune하지 않습니다. 기간, quota와 dependency-aware prune은 별도
  lifecycle이며 `pending`, `recovery-required`와 rollback 가능한 committed backup을 보존합니다.

## UI와 locale

- 기존 Scaffold panel과 preview drawer 안에서 처리하며 별도 page나 target probe API를 만들지
  않습니다.
- 첫 preview drawer의 `adoption-available` row에만 artifact별 adoption checkbox를 표시합니다.
  기본 unchecked이고 `모두 선택` control은 제공하지 않습니다. Unchecked row는 re-preview에서
  이번 action 대상에서 제외된다는 copy를 표시합니다.
- `adoption-available`이 있으면 exact title input을 숨기고 primary action을
  `선택 반영 후 다시 미리보기`로 바꿉니다. Re-preview가 진행되는 동안 control을 비활성화하고
  이전 token은 사용하지 않습니다. 선택한 adoption이 없어도 다른 create/marker-update 대상이
  있으면 unchecked unmarked row를 제외한 re-preview를 허용합니다.
- Preview state `adopt`는 `기존 본문은 유지하고 관리 블록만 추가`와 `기존 지침과 충돌 여부를
  확인해야 함` 경고를 함께 표시합니다.
- Confirm drawer는 adoption artifact count와 이름을 별도로 표시하고 `adoption-available`이 하나라도
  있으면 confirm을 허용하지 않습니다.
- 기존 exact project title input, focus trap, keyboard flow와 44px mobile target을 유지합니다.
- 한국어와 영어 message를 함께 추가하며 상태를 color만으로 구분하지 않습니다.

## 보안과 privacy

- 기존 auth, Origin, Zod size/count validation과 Approved Project Root containment를 재사용합니다.
- Symlink ancestor/final target, nested mount, non-regular file과 permission error는 confirm에서 다시
  검증합니다.
- Diff는 기존 256KiB bound와 redaction 없는 content preview 정책을 유지하되 API 응답 밖 audit에
  저장하지 않습니다.
- Existing content, diff, canonical path, backup path와 preimage는 public action history 또는
  sanitized log에 넣지 않습니다.
- Gate는 계속 `CODEXMUX_GOVERNANCE_WRITES=1`이며 gate off startup recovery도 유지합니다.
- Compact adoption template은 additive workflow/security/source-of-truth guidance만 제공하고 기존
  지침과의 semantic conflict를 자동 추론하지 않습니다.

## 검증 기준

### Unit/contract

- exact prefix 보존: LF, CRLF, BOM, no-final-newline, one-final-newline, blank-line, empty file
- invalid UTF-8, NUL, oversized, existing valid/malformed/different marker fail closed
- `adoptArtifacts` unique/subset/count validation
- adoption-specific template ID/version/render 결정성과 unresolved placeholder 부재
- preview token/digest가 adoption selection과 template variant에 binding
- confirm 전 missing/owned/external-write 전환의 stale/conflict 처리
- adoption publish, partial failure, startup recovery와 exact preimage rollback

### API/UI/integration

- authenticated preview/confirm/action history/rollback과 sanitized error response
- 한국어/영어 adoption available/selected/re-preview/confirm/result와 semantic warning state
- artifact별 opt-in, 기본 unchecked, 일괄 adoption control과 별도 probe API 부재
- 첫 preview token confirm 거부와 re-preview token/digest replacement
- temporary Approved Project Root에서 existing bytes 보존, adoption, managed update, rollback smoke
- 선택하지 않은 unmarked file과 project 밖 source 무변경
- gate-off 기존 read-only/scaffold 회귀, Runtime v2 Phase 6와 storage backup

## Release와 운영

- Source release는 full test/type/lint/build, scaffold/adoption/Linux/browser smoke를 통과합니다.
- Live deployment, restart, actual Managed Project confirm, commit, push와 issue 변경은 별도 명시
  요청 전 수행하지 않습니다.
- 비상 rollback은 `CODEXMUX_GOVERNANCE_WRITES` gate 제거/restart이며 action backup과 pending
  recovery는 보존합니다.

## Domain Architecture

### 기준 용어

| 용어 | 의미 |
| --- | --- |
| `Unmarked Artifact Adoption` | 기존 bytes를 비소유 prefix로 유지한 채 새 marker-owned block만 추가하는 explicit action |
| `Adoption Template Variant` | 신규 document template과 분리된 compact marker block definition |
| `Adoption Selection` | 한 preview에서 사용자가 artifact별로 명시한 adoption intent |

기존 `ManagedProject`, `ApprovedProjectRoot`, `Project Governance`, `GovernanceActionRun`,
`ScaffoldArtifact`, `ScaffoldPreviewToken`, `MarkerOwnedBlock`, `ActionBackupManifest`를 그대로
사용합니다.

거부 용어:

- auto adoption
- document takeover
- full-file ownership
- smart merge
- section inference
- workspace project adoption

### Bounded context와 aggregate

새 bounded context나 aggregate를 만들지 않습니다. `Unmarked Artifact Adoption`은 Project
Governance bounded context 안에서 기존 `GovernanceActionRun`이 처리하는 새 artifact operation
state입니다. 별도 `AdoptionRun` aggregate를 만들면 preview/backup/recovery lock과 action history를
중복 소유하므로 금지합니다.

`Adoption Selection`과 `Adoption Template Variant`는 value object 후보이며 durable standalone
entity가 아닙니다. Selection은 preview token에 binding되고, variant는 versioned catalog source로
관리됩니다.

### Folder와 module 영향

| Surface | 영향 |
| --- | --- |
| `scaffold-contracts.ts` | request의 `adoptArtifacts`, preview/confirmed operation `adoption-available`/`adopt`와 validation |
| `scaffold-template-catalog.ts` | artifact별 full-document/adoption variant definition과 renderer |
| `scaffold-marker.ts` | marker variant detection과 byte-preserving append plan |
| `scaffold-preview.ts` | explicit selection, eligibility, digest/confirm revalidation |
| `project-write-transaction.ts` | existing target `adopt` publish/receipt, 기존 recovery 재사용 |
| Runtime IPC/API | bounded selection 전달; path/content는 계속 worker 밖으로 노출하지 않음 |
| Governance UI | artifact별 opt-in과 adoption preview/result state |

새 top-level folder나 service를 만들지 않습니다. Filesystem read/write, fingerprint, mount와 backup
adapter 경계도 기존 Governance Worker 안에 유지합니다.

### Public signature와 data shape

- `scaffoldPreviewInputSchema`와 API body에 `adoptArtifacts`를 추가합니다.
- `IScaffoldArtifactPreview.state`에 `adoption-available`/`adopt`, confirmed artifact operation에
  `adopt`를 추가합니다. Public action summary와 durable manifest artifact enum은 변경하지 않습니다.
- Template definition은 optional adoption variant를 포함하되 rendered content나 canonical path를
  public type에 넣지 않습니다.
- Preview digest와 token store internal state는 adoption selection/variant를 포함합니다.

### ADR 판단

새 ADR은 만들지 않습니다. 이 변경은 ADR-032가 예정한 explicit existing-file adoption 후속
lifecycle이며 같은 `GovernanceActionRun`, private backup과 rollback 정책을 유지합니다. 다만
ADR-032의 기존 `unmarked file은 conflict` 구현 범위를 `명시적 append-only adoption만 허용`으로
확장하므로 release 시 구현·검증 근거를 ADR-032에 추가합니다.

## Open review items

- Design review에서 2-pass preview의 artifact별 checkbox discoverability와
  conflict/adoption state 구분을 검토합니다.
- Engineering review에서 byte round-trip, marker variant migration, action receipt compatibility와
  existing backup format migration 필요 여부를 검토합니다.

## Domain Architecture Approval

- 사용자 승인: 완료
- 새 bounded context/aggregate/service: 없음
- Canonical vocabulary: `CONTEXT.md`에 반영
- ADR: 새 ADR 없이 ADR-032 확장 근거로 관리

## Plan Grilling Approval

- 사용자 승인: 완료
- Semantic conflict: 자동 추론 없이 warning/diff/explicit confirmation
- Rollback dependency: latest-first, stale 거부, cascade/force 없음
- Retention: 자동 prune 없음, dependency-aware prune은 별도 lifecycle
- Discovery: 별도 probe API 없는 2-pass preview

## Plan Design Review

- 결과: 통과
- 기록: `docs/superpowers/reviews/2026-08-21-governed-unmarked-adoption-design-review.md`
- Blocking finding: 없음
- 보완: unchecked `adoption-available` row는 re-preview에서 제외하고 첫 preview footer는
  confirmation 대신 `선택 반영 후 다시 미리보기`만 표시

## Spec Freeze Snapshot

- Topic: `governed-unmarked-adoption`
- Product boundary: Project Governance의 기존 6개 scaffold artifact에 explicit append-only
  unmarked adoption을 추가하는 vertical slice입니다.
- Domain language: `Unmarked Artifact Adoption`, `Adoption Selection`,
  `Adoption Template Variant`를 사용하며 기존 `GovernanceActionRun` aggregate 안에 둡니다.
- Ownership: Governance Worker가 file classification, adoption template render, preview/confirm,
  transaction, backup/recovery와 Knowledge Index refresh를 계속 단독 소유합니다.
- Selection: `adoptArtifacts`는 unique `artifacts` subset, default empty, artifact별 opt-in이며
  `adopt all`은 없습니다.
- Discovery: 첫 preview는 unmarked target을 confirm 불가 `adoption-available`로 반환합니다.
  Drawer 선택을 반영한 두 번째 preview만 `adopt` diff와 confirm 가능한 새 token/digest를 만듭니다.
- Unchecked semantics: 모든 `adoption-available` ID를 다음 `artifacts`에서 제거한 뒤 사용자가
  선택한 ID만 `artifacts`/`adoptArtifacts`에 다시 넣습니다.
- Write policy: Existing bytes를 exact prefix로 보존하고 EOF에 adoption-specific compact marker
  block만 추가합니다. 기존 본문의 rewrite/wrap/merge/section inference는 금지합니다.
- Text policy: regular file, 256KiB 이하, NUL 없음, exact UTF-8 round-trip만 허용합니다. Empty,
  LF, CRLF, BOM과 final-newline variation을 명시적으로 처리합니다.
- Marker policy: Full-document/adoption variant는 별도 template ID/version을 사용하고 variant 간
  자동 전환을 금지합니다. Marker-like CODEXMUX comment가 있으면 adoption은 fail closed입니다.
- Confirmation: 기존 exact project title을 사용하되 `adoption-available`이 있거나 첫 token이면
  confirm할 수 없습니다. Selection/variant/fingerprint는 digest와 confirm revalidation에 binding됩니다.
- Transaction: Existing `GovernanceActionRun`, private exact preimage backup, journal/fsync,
  same-directory replace, compensation/startup recovery와 public sanitized summary를 재사용합니다.
- Rollback: current-output fingerprint가 receipt와 다르면 `rollback-stale`; 최신 action부터 역순
  rollback하며 dependency graph, cascade와 force rollback은 제외합니다.
- Retention: 자동 prune 없음. `pending`, `recovery-required`와 rollback 가능한 committed backup을
  `0700/0600`으로 보존하고 quota/prune은 별도 lifecycle로 둡니다.
- UI: 기존 dense Scaffold drawer 안의 2-pass flow, artifact별 44px checkbox row, explicit
  state/copy, bounded scrollable diff, 한국어/영어와 focus-visible을 유지합니다.
- Semantic warning: Compact template은 additive guidance만 생성하고 기존 지침 충돌을 자동
  추론하지 않습니다. Preview와 confirm 가까이에 수동 검토 warning을 표시합니다.
- Public contract: Preview request `adoptArtifacts`, preview state
  `adoption-available | adopt`; public action summary는 artifact operation을 노출하지 않습니다.
  Durable manifest는 `adopt`를 existing `marker-update`로 normalize하며 path/content/preimage는
  public summary와 log에서 계속 제외합니다.
- Non-goals: auto/full-file adoption, full sync, delete/move/rename, lifecycle draft, semantic merge,
  new aggregate/service/probe API, actual live project confirm입니다.
- ADR: 새 ADR 없음. ADR-032의 explicit adoption 확장 근거를 release에서 추가합니다.
- Execution environment: Linux single host, Node `>=20.9.0`, Next.js Pages Router/custom server,
  Runtime v2 Governance Worker, POSIX filesystem와 systemd user service입니다.
- Validation isolation: 현재 live service가 같은 checkout의 `.next/dist`를 사용하므로 production
  build와 build-backed browser smoke는 source/node_modules를 공유하는 temporary mirror에서 실행해
  승인 없는 live artifact 교체를 방지합니다.
- Release: TDD, full unit/type/lint/build, adoption/scaffold/Linux/browser/Phase 6/storage backup gate와
  operate handoff가 필요합니다. Commit/push/issue/live deploy/restart는 별도 명시 요청 전 금지합니다.
- Residual risk: semantic conflict는 human review에 의존하고 action backup은 무기한 누적됩니다.
