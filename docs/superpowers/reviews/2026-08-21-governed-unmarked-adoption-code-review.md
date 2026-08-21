# Governed Unmarked Adoption Code Review

- 날짜: 2026-08-21
- Stage: `code-review`
- 대상: governed unmarked adoption source diff
- 결과: 통과
- Blocking/Important unresolved finding: 없음

## 검토 범위

- API/IPC contract의 `adoptArtifacts`, `adoption-available`, `adopt`
- Full-document template과 compact adoption variant 분리
- Strict UTF-8/NUL/marker conflict, exact byte-prefix와 LF/CRLF append
- 2-pass preview, selection/digest/token과 stale revalidation
- Transaction, private preimage, durable manifest v1 호환과 latest-first rollback
- 한국어/영어 drawer, artifact별 unchecked opt-in, semantic warning과 exact title confirmation
- Public response privacy, feature gate와 live isolation

## 해소한 finding

### Durable journal backward compatibility

Public/confirmed operation은 `adopt`를 유지하되 transaction이 journal write 전에 existing-file
`marker-update`로 정규화합니다. Manifest version/schema를 바꾸지 않아 이전 source rollback과
startup recovery가 새 enum 때문에 실패하지 않습니다. Exact preimage와 output fingerprint가
adoption 의미를 보존합니다.

### Byte preservation과 unsafe input

Planner는 Buffer를 strict UTF-8 round-trip으로 검증하고 NUL 또는 marker-like CODEXMUX comment가
있으면 fail closed합니다. Empty file은 byte 0, 다른 file은 기존 line ending으로 EOF separator와
compact block만 추가합니다. BOM/LF/CRLF/no-final-newline test와 integration prefix 비교를
통과했습니다.

### Selection과 confirmation separation

첫 preview의 `adoption-available`은 diff/output/confirmed operation이 없고 confirm할 수 없습니다.
Drawer는 artifact별 unchecked control만 제공하며 `adopt all`이 없습니다. Re-preview helper는 모든
discovery row를 기존 request에서 제거하고 선택한 ID만 `artifacts`와 `adoptArtifacts`에 다시
추가합니다. 새 preview의 ordered selection, template variant, base/output fingerprint가 digest에
포함됩니다.

### UI와 browser contract

첫 pass에서는 exact title input을 숨기고, 두 번째 pass의 `adopt` row에는 existing body 비소유와
semantic conflict 수동 확인 경고를 표시합니다. Checkbox root의 role/accessible label을 static
render로 검증하고 한국어/영어 실제 browser에서 selective adoption과 unchecked file 보존을
확인했습니다.

### Build isolation

현재 live service가 같은 checkout의 `.next/dist`를 사용하므로 production build는 `/tmp` mirror에서
실행했습니다. Next 16 Turbopack이 project root 밖 `node_modules` symlink를 거부해 dependency tree를
hard-link copy로 바꾼 뒤 build가 통과했습니다. Live service PID와 build commit은 변경되지
않았습니다.

## Security/Privacy 검토

- Canonical/backup path, rendered output와 preimage는 public preview/action summary에 없습니다.
- Adoption target은 기존 Approved Project Root containment, symlink/mount와 regular-file policy를
  거칩니다.
- Confirm 직전 selection, variant와 current bytes를 다시 계산합니다.
- Adoption preimage는 action directory `0700`, file `0600`으로 저장하고 자동 prune하지 않습니다.
- Missing/owned adoption intent와 invalid text/marker는 conflict이며 force/cascade path가 없습니다.

## Non-goal 확인

Automatic/full-file adoption, section inference, semantic merge, delete/move/full sync, lifecycle
draft, retention prune, live deployment/restart, commit/push와 issue 변경은 추가하지 않았습니다.

## 검증

- `corepack pnpm test`: 1,650 passed, 3 skipped
- `corepack pnpm tsc --noEmit`: 통과
- `corepack pnpm lint`: 0 error, 기존 warning 6개
- `corepack pnpm check:project-design`: 통과
- Temporary mirror production build: 통과
- `smoke:governance:scaffold`: 13 checks 통과
- `smoke:browser:session-governance`: 한국어/영어 4 checks 통과
- `smoke:linux:session-governance`: 10 checks 통과
- `smoke:runtime-v2:storage-backup`: private-mode checks 통과
- Live read-only `smoke:runtime-v2:phase6-default-gate`: 12 checks 통과

## Residual risk

- 기존 본문과 compact guidance의 의미 충돌은 자동 추론하지 않으며 operator가 diff와 warning으로
  판단합니다.
- Recovery/rollback dependency가 있는 private backup은 자동 prune하지 않아 disk 사용량이
  누적될 수 있습니다.
- Adoption source는 live 8122에 배포되지 않았으므로 실제 등록 project confirm evidence는 없습니다.
