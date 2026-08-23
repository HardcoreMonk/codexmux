# 1차 영역 탐색과 선택 상태 명료화 Engineering Review

- 날짜: 2026-08-23
- 대상: `docs/superpowers/plans/2026-08-23-navigation-selection-clarity.md`
- Stage: `plan-eng-review`
- 결과: 통과
- Blocking finding: 없음

## Architecture와 ownership

- `resolveAppArea`는 Pages Router pathname만 해석하고 Workspace, Session Catalog와 Governance hook을
  import하지 않습니다.
- Core app area와 utility active state는 분리됩니다. `/reports`, `/stats`, `/webview`와 active desktop
  webview에서 core current state가 0개인 계약이 있어 false-current를 만들지 않습니다.
- Workspace/Activity는 existing Zustand local UI state, Session result와 Managed Project는 각 page hook의
  selection으로 남습니다. 새 global navigation store를 만들지 않습니다.
- Workspace와 Managed Project identity, API, Runtime v2, terminal lifecycle과 durable storage에 역방향
  dependency가 생기지 않습니다.

## SSR, persistence와 compatibility

- `_document.tsx`의 inline bootstrap과 `use-workspace-store.ts`가 같은 normalization contract를 사용하도록
  계획돼 있어 `sessions`→`activity` migration 중 hydration mismatch를 통제합니다.
- New interaction만 `activity`를 쓰며 기존 local storage와 `disabledBuiltinIds`를 자동 삭제하지 않습니다.
- Collapsed state에서 expanded panel의 server initial width는 0이고 별도 rail이 40px를 소유합니다.
  Pre-hydration state와 hydrated component가 같은 구조를 선택해 이중 폭과 layout shift를 방지합니다.
- Sidebar 설정에서 fixed core control을 비활성화하더라도 normal utility save는 기존 disabled core ID를
  그대로 serialize해야 합니다. 명시적인 Reset action만 기존 reset semantics를 따릅니다.

## Component와 accessibility review

- 공통 `AppAreaNavigation`이 link semantics, variant styling과 `aria-current`를 소유하므로 desktop,
  mobile bottom과 sheet의 current 판단이 drift하지 않습니다.
- `aria-current`는 route link에만, `aria-selected`는 listbox option에만, `aria-expanded`는 disclosure
  control에만 사용합니다. Mobile workspace disclosure는 active marker를 가지더라도 option role을 억지로
  덮어쓰지 않고 accessible current-context text를 제공합니다.
- Grouped desktop workspace list는 listbox 아래 `role=group`을 사용하고 Workspace item만 option이 되도록
  구현해야 합니다.
- Current/selected class는 `focus-indicator`, `accent`, `foreground`, `border`를 사용하고 runtime badge와
  lifecycle stage의 semantic status token은 유지합니다.

## Interaction과 shell stability

- Core link click은 active desktop webview를 hide한 뒤 Pages Router navigation을 수행해야 합니다.
- Session pointer click은 selection callback을 replay callback보다 먼저 호출하며 keyboard roving focus와
  Enter 동작은 유지합니다.
- Header workspace rename은 Workspace area에서만 활성화되고 다른 route의 area label은 edit dialog를 열지
  않습니다.
- PageShell, terminal surface, input handlers, WebSocket/reconnect와 pane/tab navigation function은 수정
  대상이 아닙니다. Mobile tab selection의 existing `navigateToTab` flow도 그대로 둡니다.

## Test와 evidence review

- Pure route/tab normalization, SSR static component semantics, existing entity components와 isolated Chromium
  smoke의 층별 검증 순서가 적절합니다.
- Browser smoke는 current count, ARIA, geometry와 hydration error를 DOM assertion으로 판정하고 screenshot은
  보조 evidence로만 사용합니다.
- Synthetic HOME/project/session만 capture하고 auth cookie, token, terminal content와 사용자 path를 artifact에
  포함하지 않는 제한이 있습니다.
- 한국어·영어와 desktop/mobile을 모두 검사하며 dark/light visual evidence가 승인된 color-semantic 분리를
  확인합니다.

## Execution과 rollback review

- Source checkout의 `.next`를 교체하지 않고 live restart, version, npm, tag, Release, commit과 push를 scope
  밖에 둔 실행 제한이 현재 운영 상태를 보호합니다.
- API, DB migration과 session data 변경이 없으므로 rollback은 UI source와 local normalization을 되돌리는
  것으로 한정됩니다.
- Legacy `activity`를 모르는 이전 source로 rollback하면 마지막 local panel이 Workspace로 돌아갈 수 있지만
  data loss나 terminal impact는 없습니다. 기존 `sessions` 값은 migration 중 삭제하지 않습니다.

## Review 결론

구현 순서, dependency direction, SSR hydration, persistence compatibility, accessibility, responsive geometry,
test evidence와 rollback에 blocking issue가 없습니다. 이 계획은 implementation 단계로 진행할 수 있습니다.
