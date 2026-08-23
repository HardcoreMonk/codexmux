# 1차 영역 탐색과 선택 상태 명료화 Design Review

- 작성일: 2026-08-23
- 대상 spec: `docs/superpowers/specs/2026-08-23-navigation-selection-clarity-design.md`
- Plan Grilling: `docs/superpowers/grill-me/2026-08-23-navigation-selection-clarity.md`
- 결과: Pass

## 검토 범위

- Desktop sidebar의 app area, Workspace context와 utility 계층
- Mobile header, bottom navigation, navigation sheet와 workspace tab bar
- Current route, selected entity, expanded disclosure, keyboard focus의 시각·접근성 계약
- 한국어·영어 locale, touch target과 responsive behavior
- 기존 설정 및 persisted `sidebar-tab` 호환

## 정보 구조

Workspace, Sessions, Governance를 고정된 1차 영역으로 올리고 Notes, Stats, custom webview와 Settings를
utility로 분리한 구조는 현재 domain boundary와 일치합니다. Workspace 내부 `SESSIONS`를 `Activity`로
바꾸면 Session Catalog route와 live status panel의 이름 충돌도 제거됩니다.

검토 결과:

- Desktop과 mobile이 같은 app area 순서와 label을 사용합니다.
- App area current state는 pathname projection이며 entity selection과 결합하지 않습니다.
- Sidebar를 접어도 core area가 사라지지 않고 current indicator와 accessible label이 남습니다.
- Core area visibility와 utility customization의 설정 ownership이 분리돼 있습니다.

## 상태 식별

제안된 상태 표현은 하나의 색상 차이에 의존하지 않습니다.

| 상태 | 필수 신호 | 검토 결과 |
| --- | --- | --- |
| Current app area | rail, surface, icon/label, `aria-current` | Pass |
| Selected entity | border, surface, marker, `aria-selected` | Pass |
| Expanded disclosure | chevron, child visibility, `aria-expanded` | Pass |
| Keyboard focus | independent `focus-visible` ring | Pass |
| Runtime status | semantic status color와 text/badge | Pass |

Navigation selection에서 `agent-active`를 제거하는 결정은 선택됨과 실행 중의 의미 충돌을 방지합니다.
새 color token 없이 기존 theme contract로 구현할 수 있습니다.

## Responsive와 조작성

- Desktop expanded sidebar는 icon과 label을 함께 제공하고 160px에서도 core label을 유지합니다.
- Collapsed rail은 최소 40px, mobile primary navigation은 최소 48px, utility action은 최소 44px입니다.
- Mobile workspace tab bar를 `/`에 한정해 app area와 local context의 두 navigation 계층을 구분합니다.
- Non-workspace mobile header는 현재 app area를 표시해 stale workspace title 문제를 제거합니다.
- Terminal/input surface와 reconnect lifecycle의 layout 또는 event handling은 변경하지 않습니다.

## Locale와 copy

한국어·영어 label set이 동일한 개념을 표현하며 component hardcode를 요구하지 않습니다. `세션`은 Session
Catalog에만, `활동`은 live status panel에만 사용하므로 screen reader label도 모호하지 않습니다. 한국어
label은 project font stack과 keep-all 규칙을 따를 수 있습니다.

## 호환성과 scope

- 기존 core builtin disabled 값은 삭제하지 않고 rendering에서만 무시합니다.
- Legacy `sidebar-tab=sessions`는 한 release 동안 `activity`로 normalize합니다.
- Existing sidebar collapse preference는 보존합니다.
- URL, browser history, API, durable schema와 Runtime v2 contract는 변경하지 않습니다.
- Workspace와 Managed Project identity는 계속 분리합니다.

## Acceptance 보강

구현 계획에는 다음 browser evidence를 반드시 포함해야 합니다.

- `/`, `/sessions`, `/governance` desktop screenshot에서 정확히 하나의 app area만 current
- Collapsed sidebar에서 current indicator, tooltip과 keyboard focus 확인
- Mobile 세 route에서 48px bottom navigation과 route별 header 확인
- `/sessions`, `/governance`에서 workspace tab bar 미렌더링 확인
- Pointer와 keyboard로 Session result 및 Managed Project 선택 후 marker와 `aria-selected` 확인
- Runtime status badge와 selection indicator가 동시에 나타날 때 의미가 충돌하지 않는지 확인
- 한국어·영어 SSR hydration과 label 회귀 확인

## 결론

Blocker와 열린 설계 질문이 없습니다. Spec은 domain architecture와 Plan Grilling 결정을 일관되게 반영하고
있으며 implementation plan 작성으로 진행할 수 있습니다.

## Implementation planning preflight

구현 대상 route와 sidebar settings를 다시 대조해 승인된 경계를 다음처럼 명시했습니다.

- `resolveAppArea`는 utility route에서 `null`을 반환해 Workspace를 거짓 current로 표시하지 않습니다.
- Desktop custom webview가 active이면 caller가 core current state를 제거합니다.
- Sessions/Governance의 기존 disabled 설정 값은 보존하되 설정 control은 `항상 표시` 상태로 비활성화합니다.

이는 새 제품 선택이 아니라 core area와 utility를 분리한 승인 결정을 구현 가능한 contract로 구체화한
것이며 review 결과는 계속 Pass입니다.
