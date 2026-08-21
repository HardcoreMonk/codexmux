# Governed Project Scaffold 설계

- 날짜: 2026-08-21
- lifecycle stage: `plan-eng-review` 완료, `implement` 준비
- 대상: Linux 단일 엔진의 Project Governance Phase 3 첫 vertical slice
- 상태: 사용자 승인 설계

## 문제

Project Governance Phase 1~2는 승인된 Managed Project의 guidance, knowledge, lifecycle,
check와 audit를 읽기 전용으로 제공합니다. 프로젝트에 기준 문서가 없거나 오래됐을 때 운영자는
외부 script와 수동 복사에 의존해야 하며, codexmux 안에서는 변경 전 diff, stale write 차단,
부분 실패 복구와 audit를 일관되게 보장할 수 없습니다.

Phase 3 전체를 한 번에 열면 delete, move, full sync, lifecycle draft 생성까지 write surface가
급격히 넓어집니다. 첫 release는 생성과 codexmux marker-owned block 갱신만 지원하는 안전한
scaffold transaction으로 제한합니다.

## 목표

- Managed Project 한 개의 선택된 문서 묶음을 preview하고 명시적으로 confirm합니다.
- 신규 파일은 no-replace로 생성하고 기존 파일은 codexmux marker-owned block만 갱신합니다.
- preview와 confirm 사이의 stale change를 fingerprint와 digest로 차단합니다.
- 여러 파일 publish의 부분 실패와 process 중단을 backup, journal, startup recovery로 복구합니다.
- deterministic, versioned template와 한국어·영어 운영 UI를 제공합니다.
- Governance Worker를 project filesystem의 유일한 governed writer로 유지합니다.

## Non-goals

- delete, move, rename, arbitrary overwrite, full repository sync
- `CONTEXT-MAP.md`, `agent-memory.md`, README 자동 수정
- lifecycle spec, plan, review, handoff draft 생성
- AI가 project 문서 본문을 즉석 생성하는 동작
- sibling repository 또는 network template을 runtime에 읽는 동작
- multi-project batch transaction
- remote node, collector, GSD orchestration
- backup 자동 삭제 또는 일반 file manager

## 승인된 핵심 결정

### Action 단위

한 action은 Managed Project 한 개와 선택된 artifact 묶음만 대상으로 합니다.

- preview token TTL은 10분입니다.
- artifact 하나라도 fingerprint가 바뀌면 confirm 전체를 차단합니다.
- 모든 output을 준비한 뒤 publish를 시작합니다.
- publish 중 실패하면 이미 반영한 파일을 preimage로 복원합니다.
- process가 중단되면 다음 Governance Worker 시작에서 pending journal을 복구합니다.
- multi-project batch는 지원하지 않습니다.

### Template authority

codexmux release에 포함된 versioned deterministic template catalog가 유일한 runtime template
source입니다. Catalog는 `codex-project-mgmt`의 승인된 template 의미를 snapshot으로 가져오되
실행 중 sibling checkout이나 network에 의존하지 않습니다.

Template input은 project title, summary, UI project 여부처럼 명시적인 plain text field로
제한합니다. Preview와 action manifest에는 template ID와 version을 기록합니다.

### 첫 artifact catalog

| Artifact | 기본 선택 | 조건 |
| --- | --- | --- |
| `AGENTS.md` | yes | 없음 |
| `CONTEXT.md` | yes | 없음 |
| `DESIGN.md` | no | 사용자가 UI project로 명시한 경우만 선택 가능 |
| `docs/agents/issue-tracker.md` | yes | 없음 |
| `docs/agents/triage-labels.md` | yes | 없음 |
| `docs/agents/domain.md` | yes | 없음 |

각 artifact는 create, marker-update, unchanged, conflict, skipped 중 하나로 preview됩니다.
기존 unmarked file은 conflict이며 수정하지 않습니다.

### Backup과 restore

Action recovery data는 project 밖의 다음 경로에 저장합니다.

```text
~/.codexmux/backups/governance-actions/<project-id>/<action-id>/
  action.json
  preimage/
  staged/
```

- directory mode는 `0700`, backup/stage/manifest file은 `0600`입니다.
- 기존 파일은 원본 bytes와 SHA-256을 저장합니다.
- 신규 파일은 preimage가 없었다는 사실을 manifest에 기록합니다.
- rollback은 action이 만든 파일만 삭제하고 갱신 파일은 exact preimage로 복원합니다.
- 첫 release는 자동 prune을 수행하지 않습니다.
- 일반 audit에는 path 본문, 문서 본문, prompt, credential을 저장하지 않습니다.

## Architecture와 ownership

### Boundary

- Browser는 template content, filesystem path 또는 shell command를 조립하지 않습니다.
- Next API route는 configured auth, same-authority Origin, Zod schema를 검증하고 typed Runtime v2
  IPC만 호출합니다.
- Governance Worker가 template render, preview, project write, backup, journal, recovery와
  Knowledge Index refresh를 소유합니다.
- Storage Worker의 Managed Project/Approved Project Root snapshot은 기존처럼 canonical
  registration authority입니다.
- Knowledge Index는 write 성공 뒤 refresh되는 재생성 가능한 projection입니다.
- `CODEXMUX_GOVERNANCE_WRITES=1`일 때만 write command를 등록하며 기본값은 `off`입니다.

### Candidate modules

```text
src/lib/governance/
  scaffold-contracts.ts
  scaffold-template-catalog.ts
  scaffold-marker.ts
  scaffold-preview.ts
  scaffold-token.ts
  scaffold-backup.ts
  scaffold-action-journal.ts
  project-write-transaction.ts
  project-path-policy.ts

src/components/features/governance/
  governance-scaffold-panel.tsx
  governance-scaffold-preview-drawer.tsx
  governance-action-history.tsx
```

현재 `project-path-policy.ts`와 Governance Worker service를 확장하되 unrelated runtime 또는
third-party component를 refactor하지 않습니다.

### Transaction state

```text
previewed
-> preparing
-> publishing
-> committed
-> indexed | index-stale

preparing | publishing
-> rolling-back
-> rolled-back | recovery-required

committed | index-stale
-> rollback-previewed
-> rolling-back
-> rolled-back | rollback-stale
```

POSIX filesystem은 여러 파일을 하나의 transaction으로 commit하지 않습니다. 따라서 각
target의 same-directory stage와 atomic file publish, durable action journal, synchronous
compensation, startup recovery를 결합해 외부적으로 all-or-none 결과를 제공합니다. Crash 뒤
recovery가 끝나기 전에는 해당 project의 새 write action을 받지 않습니다.

Project별 lock은 codexmux action만 직렬화하며 외부 editor를 잠그지 않습니다. File identity,
fingerprint, mtime과 publish 전후 변화를 재검증하되 외부 변경이 감지되면 그 file 위에
preimage를 강제로 복원하지 않습니다. Action은 `recovery-required`가 되고 staged output과
backup을 보존합니다. All-or-none은 외부 동시 writer가 없는 정상 transaction에 한정합니다.

Durable `committed` marker가 없는 interrupted action은 startup에서 forward-complete하지 않고
rollback합니다. Current target이 expected output이면 preimage를 복원하거나 action-created
file을 제거합니다. Expected output과 다르면 외부 변경으로 보고 `recovery-required`로
중단합니다.

## Preview와 confirm flow

### Preview

1. API가 project ID, artifact 선택, title, summary, UI 여부를 검증합니다.
2. Governance Worker가 최신 Managed Project snapshot과 Approved Project Root를 확인합니다.
3. Project root를 realpath로 다시 계산하고 containment, ancestor, nested mount를 검사합니다.
4. Catalog에서 template ID/version을 선택하고 server에서 output을 render합니다.
5. 기존 target은 regular file, symlink 여부, marker ownership, full-file fingerprint를 검사합니다.
6. Artifact별 state와 bounded unified diff를 생성합니다.
7. Project, input, artifact, template version, fingerprint와 output digest에 결합된 10분 token을
   반환합니다.

### Confirm

1. 사용자가 project 표시 이름을 정확히 입력합니다.
2. API가 token과 confirmation을 Governance Worker에 전달합니다.
3. Worker가 root/path/mount/symlink/fingerprint/token TTL/digest를 전부 다시 검증합니다.
4. Template output을 server에서 다시 render하고 preview digest와 비교합니다.
5. Backup, stage와 `preparing` journal을 durable하게 기록합니다.
6. 신규 파일은 no-replace publish하고 기존 file은 marker 밖 content를 보존한 output으로
   atomic replace합니다.
7. 매 publish 뒤 journal을 갱신합니다. 실패하면 역순으로 복구합니다.
8. Commit 뒤 Knowledge Index를 refresh하고 action 결과를 sanitized audit에 기록합니다.

Confirm 요청이 끊겨도 worker가 같은 token을 중복 실행하지 않습니다. 동일 action ID가 이미
committed면 기존 receipt를 반환하고, rolled-back 또는 expired이면 명시적 terminal state를
반환합니다.

## Marker ownership

Generated block은 다음처럼 template ID/version을 포함합니다.

```markdown
<!-- BEGIN CODEXMUX:<template-id>:v1 -->
...
<!-- END CODEXMUX:<template-id>:v1 -->
```

- marker는 artifact당 정확히 한 쌍이어야 합니다.
- 같은 template ID의 지원되는 이전 version은 preview에서 version migration으로 표시하고
  `marker-update`를 허용합니다.
- 현재보다 높은 미지원 version, 다른 template ID, 중첩, duplicate와 잘못된 순서는
  conflict입니다. 자동 downgrade는 허용하지 않습니다.
- marker 밖의 bytes는 그대로 보존합니다.
- codexmux가 전체 파일을 생성해도 이후 사용자가 marker 밖에 추가한 content는 보존합니다.
- marker 안의 수동 수정은 preview diff에 표시하고 confirm 시 catalog output으로 교체할 수
  있습니다.
- 기존 unmarked file은 자동 adoption하지 않습니다. UI는 수동 adoption 안내와 marker 예시만
  제공하며 block 선택 adoption은 후속 lifecycle로 남깁니다.
- line ending은 기존 파일을 유지하고 신규 파일은 LF를 사용합니다.

## API와 IPC 후보

```text
POST /api/governance/projects/:projectId/scaffold/preview
POST /api/governance/projects/:projectId/scaffold/confirm
GET  /api/governance/projects/:projectId/actions
POST /api/governance/projects/:projectId/actions/:actionId/rollback/preview
POST /api/governance/projects/:projectId/actions/:actionId/rollback/confirm
```

```text
governance.preview-scaffold
governance.confirm-scaffold
governance.list-actions
governance.preview-action-rollback
governance.confirm-action-rollback
```

Request에는 project-relative artifact ID와 bounded template input만 포함합니다. Canonical path,
rendered content와 arbitrary relative path는 browser request가 지정하지 않습니다.

## UI

Project Governance page의 기존 setup/read model 아래에 밀도 높은 Scaffold panel을 둡니다.

- write gate 상태를 `disabled / ready / recovering / degraded`로 표시합니다.
- title, summary, UI project 여부와 artifact checkbox를 제공합니다.
- artifact row에 create, marker-update, unchanged, conflict, skipped 상태를 표시합니다.
- preview drawer는 project-relative path와 bounded unified diff만 표시합니다.
- confirm은 project 표시 이름 exact match와 아직 유효한 preview token을 요구합니다.
- token 만료 countdown과 re-preview action을 제공합니다.
- action history는 rollback 가능, stale, 복구 완료 상태와 sanitized summary를 표시합니다.
- 한국어와 영어 message, keyboard focus, focus-visible, 44px mobile action target을 유지합니다.
- marketing hero, decorative card stack 또는 general file editor를 도입하지 않습니다.

Design review에서 Scaffold를 catalog setup panel이 아니라 선택 project detail의 summary 바로
아래 full-width section에 두기로 확정했습니다. Action history는 project detail 마지막에 두고
preview diff는 독립 drawer가 scroll을 소유합니다. Header의 read-only badge는 feature gate와
worker state에 따라 read-only, write-ready, recovering, degraded를 명확히 구분합니다.
`recovery-required`는 toast가 아니라 persistent warning으로 표시하고 conflict/unchanged
artifact checkbox는 disabled합니다.

## Security와 limits

- Approved Project Root 밖 path는 거부합니다.
- target과 생성할 directory의 모든 ancestor를 lstat/realpath로 재검증합니다.
- symlink와 nested mount를 거부합니다.
- browser가 filename 또는 output path를 지정할 수 없습니다.
- template input은 path나 Markdown control marker에 사용하지 않고 control character를
  거부합니다.
- 파일당 256KiB, action 전체 1MiB를 넘으면 preview를 거부합니다.
- diff는 인증된 preview에만 포함하고 action 목록과 audit에는 포함하지 않습니다.
- token은 project, selected artifact, template version, base fingerprint, output digest에
  결합합니다.
- project별 writer lock과 bounded timeout을 사용합니다.
- raw document, secret candidate, terminal output, Codex JSONL은 action backup 대상이 아닙니다.

## Error model

| Code | 의미 | Operator action |
| --- | --- | --- |
| `governance-writes-disabled` | 기능 gate off | 배포 승인 후 gate 활성화 |
| `unmarked-file-conflict` | 기존 file에 owned marker 없음 | 수동 정리 또는 artifact 제외 |
| `stale-preview` | fingerprint/digest/TTL 불일치 | 다시 preview |
| `path-outside-approved-root` | canonical containment 실패 | project 등록 확인 |
| `symlink-or-mount-forbidden` | symlink 또는 nested mount 발견 | 실제 directory로 이동/등록 |
| `target-already-exists` | create publish 경쟁 | 다시 preview |
| `transaction-recovered` | startup에서 미완료 action rollback 완료 | 결과와 project diff 확인 |
| `recovery-required` | 외부 write와 충돌해 자동 복구 중단 | current/stage/preimage 수동 비교 |
| `rollback-stale` | commit 이후 target 변경 | 자동 rollback 중단, 수동 검토 |
| `index-refresh-failed` | write 성공, projection refresh 실패 | Governance refresh 재시도 |

## Verification

### Unit/API/component

- deterministic template rendering과 template version
- marker parse/update, duplicate/nested/malformed conflict, line ending 보존
- token binding, expiry, tamper와 digest mismatch
- create no-replace, marker update와 unchanged
- artifact 중간 publish failure의 reverse restore
- pending journal startup recovery
- preview 뒤 외부 수정 stale 차단
- committed output 수정 뒤 rollback stale 차단
- path escape, symlink ancestor/final target, nested mount, permission error
- API auth, Origin, Zod limit와 sanitized response/audit
- 한국어/영어 Scaffold panel, preview, confirm, result state

### Integration/release

- 임시 Approved Project Root와 Managed Project를 사용하는 Linux create/update/rollback smoke
- gate off 상태의 기존 Phase 1~2 read-only regression
- Runtime v2 Phase 6 gate와 storage backup smoke
- production build와 browser smoke
- live service는 gate off 상태로만 먼저 배포
- 별도 승인 뒤 live gate 활성화
- 실제 project는 preview 결과를 다시 승인받기 전 confirm하지 않음

## Rollback

- 기능 문제가 있으면 `CODEXMUX_GOVERNANCE_WRITES`를 제거하고 service를 restart합니다.
- Gate off에서도 기존 action history와 backup은 삭제하지 않습니다.
- 미완료 journal recovery는 gate와 무관하게 worker startup에서 먼저 수행합니다.
- 성공 action rollback은 current output fingerprint가 commit receipt와 일치할 때만 실행합니다.
- Knowledge Index는 projection이므로 write rollback 뒤 refresh하며 DB를 project source처럼
  복원하지 않습니다.

## Domain Architecture

이 설계는 기존 `ManagedProject`, `ApprovedProjectRoot`, `Project Governance`, `Knowledge Index`
용어를 유지합니다. 승인된 확장은 다음과 같습니다.

| 종류 | 후보 | 책임 |
| --- | --- | --- |
| Aggregate | `GovernanceActionRun` | preview binding, transaction state, receipt와 recovery |
| Entity | `ScaffoldArtifact` | catalog artifact ID, template version, target relative path |
| Value Object | `ScaffoldPreviewToken` | TTL, digest와 base fingerprint binding |
| Value Object | `MarkerOwnedBlock` | codexmux가 갱신 가능한 정확한 content 범위 |
| Value Object | `ActionBackupManifest` | preimage/output fingerprint와 recovery progress |

`ProjectWrite`, `FileSync`, `WorkspaceProject`처럼 범위를 넓히거나 기존 거부 용어와 충돌하는
이름은 public domain language로 사용하지 않습니다.

Folder와 public contract는 Project Governance bounded context 아래에 유지합니다.
`scaffold-contracts.ts`가 API/IPC의 artifact ID, preview, receipt와 error shape를 소유하고,
`project-write-transaction.ts`는 React/API나 Knowledge Index에서 import하지 않는 domain
service로 둡니다. Filesystem, clock, token signing과 mount reader는 test 가능한 adapter로
주입합니다. Browser-visible type에는 canonical path, backup path와 rendered content를 넣지
않습니다.

Governance Worker가 read-only reader에서 governed writer로 전환되고 `~/.codexmux/backups/`
storage layout이 확장되므로 ADR-031의 단순 구현 상세로 숨기지 않습니다. 승인된 domain
language는 `CONTEXT.md`에 반영했고 별도 결정은 ADR-032 `Draft`로 기록했습니다.

## Grill 결정

- 감지된 외부 write는 자동 rollback으로 덮어쓰지 않고 `recovery-required`로 보존합니다.
- Durable commit marker가 없는 interrupted action은 startup에서 rollback합니다.
- 같은 template ID의 지원되는 이전 marker version만 forward migration합니다.
- 기존 unmarked file은 자동 adoption하지 않습니다.

상세 질문과 승인은
`docs/superpowers/grill-me/2026-08-21-governed-project-scaffold.md`에 기록합니다.

## Open review items

- Engineering review에서 staged publish, file descriptor/fsync 순서, IPC payload size와 build
  packaging을 검토합니다.

## Spec Freeze Snapshot

- Topic: `governed-project-scaffold`
- Product boundary: Linux 단일 엔진의 Project Governance Phase 3 첫 create-only vertical
  slice입니다.
- Domain language: `ManagedProject`, `ApprovedProjectRoot`, `GovernanceActionRun`,
  `ScaffoldArtifact`, `ScaffoldPreviewToken`, `MarkerOwnedBlock`, `ActionBackupManifest`를
  사용합니다.
- Ownership: Storage Worker가 project registration state를, Governance Worker가 preview,
  template render, project write, backup, journal, recovery와 Knowledge Index refresh를
  소유합니다. Next API와 browser는 path/content를 조립하지 않습니다.
- Feature gate: `CODEXMUX_GOVERNANCE_WRITES=1`, default off. Gate off에서도 pending action
  recovery는 먼저 실행합니다.
- Action scope: Managed Project 한 개와 선택된 artifact 묶음, preview TTL 10분, exact project
  title confirmation, project별 writer lock입니다.
- Artifact catalog: `AGENTS.md`, `CONTEXT.md`, conditional `DESIGN.md`,
  `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md`입니다.
- Template policy: bundled deterministic versioned catalog입니다. 같은 template ID의 지원되는
  이전 version만 forward migration하고 downgrade, unknown future version과 malformed marker는
  conflict입니다.
- Write policy: missing file no-replace create 또는 marker-owned block update만 허용합니다.
  Existing unmarked file adoption, arbitrary overwrite, delete, move, full sync는 non-goal입니다.
- Transaction policy: backup/stage/journal fsync 뒤 publish합니다. Durable commit marker가 없는
  interrupted action은 startup에서 rollback합니다. 감지된 external write는 덮어쓰지 않고
  `recovery-required`로 보존합니다.
- Backup: `~/.codexmux/backups/governance-actions/<project-id>/<action-id>/`, modes `0700/0600`,
  first release 자동 prune 없음입니다.
- Limits: file 256KiB, action 1MiB. Canonical root containment, all ancestor symlink와 nested mount
  방어를 confirm에서 재검증합니다.
- UI: selected project summary 아래 Scaffold, 마지막 Action History, 독립 preview drawer,
  explicit gate/recovery/index state, 한국어·영어, keyboard/focus-visible, 44px mobile target입니다.
- Accepted grill decisions: external write 보존, incomplete action rollback, supported marker version
  forward migration, existing unmarked file fail closed입니다.
- Release: gate off regression, isolated Linux fixture transaction, gate off live deploy, 별도 승인
  뒤 live gate 활성화, 실제 project confirm은 다시 승인받습니다.
- ADR: ADR-032 `Approved`; release artifact가 구현되면 `Implemented` 전이를 판단합니다.
- Execution environment: Linux single host, Node `>=20.9.0`, Next.js Pages Router/custom server,
  Runtime v2 worker IPC, ext4-compatible POSIX filesystem와 systemd user service를 기준으로 합니다.
- Engineering review decisions: Private manifest 기반 pre-refresh startup recovery,
  `readOnly` boolean과 explicit writeState, codexmux-owned CONTEXT template, private recovery
  manifest/public action summary 분리, direct `diff` dependency 재사용을 적용합니다.
- Residual risks: POSIX가 외부 writer CAS를 제공하지 않는 한계와 first release backup 무기한
  보존은 승인된 trade-off입니다.
