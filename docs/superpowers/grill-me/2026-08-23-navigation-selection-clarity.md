# 1차 영역 탐색과 선택 상태 명료화 Plan Grilling

- 날짜: 2026-08-23
- 대상 spec: `docs/superpowers/specs/2026-08-23-navigation-selection-clarity-design.md`
- 방식: 질문을 한 번에 하나씩 제시하고 추천 정책과 사용자 결정을 기록
- 상태: 완료

## 승인된 기준선

- Workspace, Sessions, Governance를 고정된 1차 앱 영역으로 구분합니다.
- Route current, entity selection, disclosure, keyboard focus를 서로 다른 상태로 표현합니다.
- Workspace와 Managed Project의 domain identity는 합치지 않습니다.
- API, Runtime v2, durable schema와 terminal lifecycle은 변경하지 않습니다.

## Q1. 기존 설정에서 비활성화된 Sessions와 Governance도 항상 표시하는가?

문제:

현재 builtin sidebar item은 사용자 설정으로 숨길 수 있습니다. 새 1차 탐색에서도 이 설정을 그대로 적용하면
핵심 영역이 다시 무라벨 utility나 우회 경로에 의존해 이번 변경의 목적이 무너질 수 있습니다. 반대로 기존
설정 값을 삭제하면 불필요한 migration과 rollback 손실이 생깁니다.

추천 결정:

- Sessions와 Governance는 Workspace와 함께 항상 표시하는 core app area로 고정합니다.
- 기존 disabled builtin 설정 값은 삭제하거나 rewrite하지 않습니다.
- core app area rendering에서 해당 두 ID만 무시합니다.
- Notes, Stats, custom webview와 같은 utility는 기존 사용자 설정을 계속 적용합니다.

사용자 결정: 승인

## Q2. Workspace 내부의 SESSIONS 탭을 Activity로 변경하는가?

문제:

현재 상단 `SESSIONS`는 Session Catalog route가 아니라 busy, needs-input, review, completed 상태를
보여 주는 Workspace 내부 panel입니다. `/sessions`와 같은 이름을 유지하면 사용자가 local context 전환과
page route 전환을 구분하기 어렵습니다. 다만 persisted `sidebar-tab=sessions` 값을 즉시 폐기하면 기존
사용자의 마지막 panel 선택이 사라집니다.

추천 결정:

- Workspace 내부 tab label을 한국어 `활동`, 영어 `Activity`로 변경합니다.
- 새 저장 값은 `sidebar-tab=activity`를 사용합니다.
- 한 release 동안 legacy `sidebar-tab=sessions`를 `activity`로 normalize합니다.
- Session Catalog를 가리키는 1차 영역만 `세션` / `Sessions` 명칭을 사용합니다.

사용자 결정: 승인

## Q3. 모바일에서 3개 1차 영역을 항상 표시하는가?

문제:

현재 mobile route action은 32px icon-only이고 current state가 없습니다. Workspace tab bar도 모든 route에
남아 있어 app area와 workspace context가 같은 계층처럼 보입니다. 반면 고정 bottom navigation을 추가하면
세로 공간을 더 사용합니다.

추천 결정:

- 모바일 하단에 Workspace, Sessions, Governance 3개 영역을 icon과 label로 항상 표시합니다.
- 각 항목의 높이는 최소 48px로 하고 current item에 `aria-current="page"`를 설정합니다.
- 기존 workspace tab bar는 `/` route에서만 app area navigation 위에 표시합니다.
- Sessions와 Governance에서는 route label을 header에 표시해 workspace 이름이 page title처럼 보이지 않게
  합니다.

사용자 결정: 승인

## Q4. 기존 desktop sidebar 접힘 설정을 보존하는가?

문제:

항상 펼친 sidebar는 app area label 식별에는 유리하지만 기존 사용자의 terminal 가로 공간과 persisted UI
선호를 강제로 바꿉니다. 반대로 현재 32px icon rail을 그대로 두면 current route 식별 문제가 남습니다.

추천 결정:

- 기존 sidebar 접힘 설정을 보존합니다.
- 펼친 상태에서는 app area icon과 label을 함께 표시합니다.
- 접힌 rail은 최소 40px로 넓히고 tooltip, accessible label과 persistent current indicator를 제공합니다.
- 업데이트 후 최초 진입 시 강제 확장하거나 기존 저장 값을 migration하지 않습니다.

사용자 결정: 승인

## Q5. Navigation selection과 runtime status의 색상 의미를 분리하는가?

문제:

현재 entity selection에 `agent-active` 계열을 사용하면 선택됨과 Codex 실행 중이라는 의미가 겹칩니다.
선택 상태를 더 강하게 만들기 위해 status color를 확대하면 needs-input, review와 degraded 표시도 상대적으로
불명확해질 수 있습니다.

추천 결정:

- Current route와 selected entity는 `focus-indicator`, `accent`, `foreground`, `border` 조합으로
  표시합니다.
- Current route는 leading rail, surface와 label weight를 함께 사용합니다.
- Selected entity는 full border, surface와 persistent marker를 함께 사용합니다.
- 녹색, 주황색, 붉은색 계열은 runtime status 의미에만 사용합니다.
- 이번 변경에서 새 theme color token을 추가하지 않습니다.

사용자 결정: 승인

## Q6. Session과 Managed Project 선택을 URL이나 durable storage에 보존하는가?

문제:

선택 복원과 deep link는 편리하지만 URL query, browser history, 초기 hydration과 invalid entity fallback을
새로 정의해야 합니다. 이는 현재 식별 문제를 해결하는 데 필요하지 않고 Session Catalog와 Governance의
각 state ownership을 바꾸는 별도 동작 변경입니다.

추천 결정:

- 이번 slice에서는 기존 page-local selection lifetime을 유지합니다.
- Session result와 Managed Project의 시각적 selected state와 접근성 semantics만 강화합니다.
- URL query, local storage와 durable schema를 추가하지 않습니다.
- 선택 복원이나 deep link가 필요하면 별도 lifecycle에서 history와 invalidation 계약을 설계합니다.

사용자 결정: 승인

## Grill 결과

- Workspace, Sessions, Governance는 숨길 수 없는 core app area입니다.
- Workspace 내부 live 상태 panel은 `활동` / `Activity`로 이름을 바꾸며 legacy 저장 값을 한 release 동안
  읽습니다.
- 모바일은 3개 core app area를 항상 표시하고 workspace tab bar는 `/`에서만 표시합니다.
- Desktop sidebar 접힘 설정은 보존하되 rail과 current indicator를 강화합니다.
- Navigation selection과 runtime status는 서로 다른 색상 의미를 사용합니다.
- Session과 Managed Project 선택은 page-local로 유지하며 URL이나 durable storage로 확장하지 않습니다.
- 열린 설계 질문 없음.
