# Governed Unmarked Adoption Design Review

- 날짜: 2026-08-21
- 대상: `docs/superpowers/specs/2026-08-21-governed-unmarked-adoption-design.md`
- Stage: `plan-design-review`
- 결과: 통과
- Blocking finding: 없음

## 검토 범위

- 2-pass preview의 information architecture와 discoverability
- `conflict`, `adoption-available`, `adopt`, `marker-update` state 구분
- Artifact별 opt-in과 operator error prevention
- Existing bytes 비소유 경계와 semantic conflict warning
- 한국어/영어, keyboard/focus, mobile touch target
- 기존 Governance Scaffold panel/drawer와 action history 일관성

## 확인한 기존 계약

- Governance screen은 dense operational surface이며 별도 hero/page를 만들지 않습니다.
- Preview drawer는 artifact path/state/diff와 exact project title confirm을 한 흐름으로 묶습니다.
- Status는 color만으로 표현하지 않고 text, error와 recovery action을 가까이 둡니다.
- Input/button은 `min-h-11`, Sheet focus trap과 scrollable diff 영역을 유지합니다.
- 기본 locale은 한국어이며 영어 message와 SSR locale hydration을 함께 유지합니다.

## 승인된 UX 구조

### 첫 preview: discovery

- `adoption-available` row는 conflict red가 아니라 warning/attention text state로 표시합니다.
- Row마다 unchecked `기존 문서에 관리 블록 추가` checkbox와 기존 본문 비소유 설명을 둡니다.
- `모두 선택` control은 제공하지 않습니다.
- Exact project title input과 apply button은 숨기고 footer primary action을
  `선택 반영 후 다시 미리보기`로 교체합니다.
- Unchecked adoption row는 다음 preview/action에서 제외된다는 copy를 표시합니다.

### 두 번째 preview: verification

- 선택한 adoption row는 `adopt`와 full bounded diff를 표시합니다.
- 기존 create/marker-update row와 함께 최종 action 범위를 다시 보여 줍니다.
- `기존 지침과 충돌 여부를 확인해야 함` warning은 adoption row와 confirm footer 가까이에
  표시합니다.
- 새 token/digest에 대해서만 exact project title input과 apply button을 표시합니다.

### Selection semantics

- Re-preview request는 원래 `artifacts`에서 모든 `adoption-available` ID를 제거한 뒤 사용자가
  선택한 ID만 다시 추가합니다.
- 선택한 ID만 `adoptArtifacts`에 포함합니다.
- 사용자가 adoption을 하나도 고르지 않아도 create/marker-update 대상이 있으면 unmarked row를
  제외하고 re-preview할 수 있습니다.
- Re-preview 뒤 실행 가능한 변경이 하나도 없으면 confirm을 표시하지 않고 panel로 돌아가
  selection을 조정하도록 안내합니다.

## State와 copy

| State | Tone | 필수 copy/action |
| --- | --- | --- |
| `adoption-available` | warning/attention | 기존 문서 유지, checkbox, re-preview 필요 |
| `adopt` | primary/attention | 추가되는 managed block diff, semantic conflict warning |
| `marker-update` | neutral/primary | owned block version update diff |
| `conflict` | destructive | 원인 code와 자동 변경 불가 |
| `unchanged` | muted | 변경 없음 |

Error code 원문만 노출하지 않고 한국어/영어 설명 message를 우선합니다. Debug code는 보조 text로
남길 수 있습니다.

## 접근성과 반응형

- Checkbox label 전체가 click/touch target이며 최소 44px row 높이를 유지합니다.
- `adoption-available` checkbox, re-preview button, confirm input 순으로 자연스러운 tab order를
  갖습니다.
- Re-preview 뒤 Sheet를 닫거나 focus를 잃지 않고 title 또는 첫 changed row에 status update를
  알립니다.
- Diff는 기존 `max-h-80`, horizontal/vertical scroll을 유지해 footer control을 덮지 않습니다.
- Narrow viewport에서 state label과 path가 겹치지 않도록 wrap하고 path/diff만 word-break 예외로
  둡니다.

## Error prevention

- 첫 preview token으로 confirm할 수 없습니다.
- Busy/expired/re-preview 중 control은 disabled state와 text를 함께 표시합니다.
- Project 변경 또는 drawer close 시 adoption selection과 token을 폐기합니다.
- `adoption-available`과 `conflict`를 같은 destructive visual로 표현하지 않습니다.
- 기존 본문을 codexmux가 소유한다는 표현을 사용하지 않습니다.

## Review 결론

별도 probe API나 새 page 없이 기존 drawer 안의 2-pass state transition으로 discovery와 exact
confirmation을 분리할 수 있습니다. Unchecked adoption row를 다음 action에서 제외하는 semantics를
spec에 보완했습니다. 디자인 blocking issue는 없으며 Spec Freeze와 implementation plan으로 진행할
수 있습니다.
