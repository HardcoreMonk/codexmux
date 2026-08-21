# Governed Unmarked Adoption Plan Grilling

- 날짜: 2026-08-21
- 대상 spec: `docs/superpowers/specs/2026-08-21-governed-unmarked-adoption-design.md`
- 방식: 질문을 한 번에 하나씩 제시하고 추천 정책과 사용자 승인을 확인
- 상태: 완료

## Q1. Existing guidance와 adoption block이 의미상 충돌할 수 있으면 자동 차단하는가?

문제:

Unmarked document의 기존 지침과 compact adoption block 사이에는 의미 충돌 가능성이 있습니다.
이를 자동 판정하려면 heading/자연어 의미를 추측해야 하며, 이번 scope의 byte-preserving
append와 section inference 금지 원칙을 벗어납니다.

추천 결정:

- 의미 충돌을 자동 판정하거나 기존 본문을 rewrite하지 않습니다.
- Preview에 `기존 지침과 충돌 여부를 확인해야 함` 경고와 전체 bounded diff를 표시합니다.
- Artifact별 opt-in과 exact project title confirmation을 유지합니다.
- Compact template은 additive workflow/security guidance로 제한하고 project-specific 사실을
  생성하지 않습니다.
- 명시적 preview/confirm 뒤에는 semantic conflict 가능성만으로 action을 차단하지 않습니다.

사용자 결정: 승인

## Q2. Adoption 뒤 marker update가 있으면 과거 adoption을 직접 rollback하는가?

문제:

Adoption action 뒤 같은 marker block이 새 template version이나 재적용으로 변경되면 최초
adoption receipt의 output fingerprint와 current file이 달라집니다. 과거 adoption preimage를
바로 복원하면 더 최신 managed update와 그 사이 외부 edit를 제거할 수 있습니다.

추천 결정:

- 기존 current-output fingerprint 조건을 그대로 적용합니다.
- 최신 output과 receipt가 다르면 과거 adoption rollback을 `rollback-stale`로 거부합니다.
- 사용자는 같은 artifact의 최신 action부터 역순으로 rollback해야 합니다.
- 이번 slice에서 dependency graph, cascade rollback 또는 force rollback을 만들지 않습니다.
- UI는 rollback 불가 원인과 `최신 action부터 되돌리기` 안내를 표시합니다.

사용자 결정: 승인

## Q3. Adoption preimage backup을 자동 정리하는가?

문제:

Adoption은 기존 문서 전체의 exact preimage를 private action backup에 저장합니다. 자동 prune은
disk 사용을 줄이지만 rollback과 startup recovery 근거를 없앨 수 있고, action 간 최신-first
rollback 순서도 깨뜨릴 수 있습니다.

추천 결정:

- 이번 slice에서는 기존 정책처럼 자동 prune을 하지 않습니다.
- `pending`, `recovery-required`와 rollback 가능한 committed action backup은 삭제하지 않습니다.
- Action당 기존 1MiB limit과 `0700/0600` mode를 유지합니다.
- Public history에는 content/path를 노출하지 않고 action count와 artifact count만 유지합니다.
- Retention 기간, quota와 안전한 dependency-aware prune은 별도 lifecycle로 분리합니다.

사용자 결정: 승인

## Q4. Preview 전에는 알 수 없는 unmarked 상태를 UI에서 어떻게 발견하는가?

문제:

현재 Scaffold panel은 catalog와 form input만 알고 target file 상태는 Governance Worker preview가
처음 읽습니다. Preview 전부터 unmarked row에만 adoption checkbox를 표시하려면 새 probe API나
중복 filesystem read model이 필요합니다.

추천 결정:

- 별도 probe API를 만들지 않고 기존 preview를 2-pass로 사용합니다.
- 첫 preview는 opt-in 없는 unmarked artifact를 confirm 불가 `adoption-available` state로
  반환합니다.
- Preview drawer가 해당 artifact마다 unchecked adoption control을 표시합니다.
- 사용자가 고른 artifact만 `adoptArtifacts`에 넣어 `다시 미리보기`를 실행합니다.
- 두 번째 preview가 새 token/digest와 `adopt` diff를 만들며 첫 token은 confirm에 사용하지
  않습니다.
- `adopt all`은 제공하지 않고 missing/owned state에는 adoption control을 표시하지 않습니다.

사용자 결정: 승인

## Grill 결과

- Existing guidance의 semantic conflict는 자동 추론하지 않고 preview warning과 explicit
  confirmation으로 처리합니다.
- Adoption과 이후 marker update는 current-output fingerprint를 기준으로 최신 action부터
  역순 rollback합니다. Cascade/force rollback과 dependency graph는 만들지 않습니다.
- Exact preimage backup은 자동 prune하지 않으며 dependency-aware retention은 별도 lifecycle로
  분리합니다.
- Unmarked 상태 discovery는 새 probe API 없이 2-pass preview로 처리합니다. 첫 preview의
  `adoption-available`은 confirm 불가이고 artifact별 re-preview 뒤에만 `adopt` action을
  confirm할 수 있습니다.
- 열린 설계 질문 없음.
