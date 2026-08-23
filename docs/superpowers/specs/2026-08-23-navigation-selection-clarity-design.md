# 1차 영역 탐색과 선택 상태 명료화 설계

- 작성일: 2026-08-23
- 상태: Implemented — code-review 통과, release 승인 대기
- 대상: desktop browser 우선, Electron/mobile regression
- 범위: Workspace, Session Catalog, Project Governance의 식별·선택·전환

## 문제

현재 sidebar는 서로 다른 두 탐색 계층을 하나의 시각 언어로 표현합니다.

- 상단 `WORKSPACE / SESSIONS`는 route 전환이 아니라 workspace 목록과 live notification/history
  panel을 바꾸는 local tab입니다.
- 실제 Session Catalog와 Project Governance route는 sidebar 하단의 28px 무라벨 icon입니다.
- `/sessions`와 `/governance`에서도 상단 `WORKSPACE` tab이 선택 상태로 남습니다.
- route icon의 current state는 muted foreground와 foreground의 색 차이뿐이고 `aria-current`가
  없습니다.
- Workspace row의 current marker는 `/` route에서만 나타나므로 다른 영역으로 이동하면 현재
  workspace context를 식별할 수 없습니다.
- mobile navigation의 route icon은 32px이며 active route 표현과 `aria-current`가 없습니다.
- mobile header는 route와 관계없이 active workspace 이름을 표시하고 workspace tab bar도 모든
  route에서 렌더링합니다.
- Session result와 Managed Project 선택은 `border-agent-active/40 bg-agent-active/5`만 사용해
  focus, hover, selected를 빠르게 구분하기 어렵습니다.

2026-08-23 live Playwright audit에서 다음을 확인했습니다.

| 항목 | 관찰 |
| --- | --- |
| desktop top tabs | `/`, `/sessions`, `/governance` 모두 `WORKSPACE`가 `aria-selected=true` |
| desktop app route | Session Catalog/Governance는 28×28 icon의 text color만 변경 |
| desktop route semantics | 모든 route icon의 `aria-current`가 없음 |
| workspace selection | `/`에서는 current row 1개, 다른 두 route에서는 0개 |
| mobile app route | Session Catalog/Governance icon 32×32, active state와 `aria-current` 없음 |
| mobile context | Governance route에서도 `WORKSPACE` local tab과 workspace 이름이 primary로 보임 |

이 문제는 token 하나를 진하게 만드는 것으로 해결되지 않습니다. 사용자가 현재 보고 있는 앱 영역,
선택한 domain entity, 펼친 disclosure와 keyboard focus를 각각 다른 상태로 인식할 수 있어야 합니다.

## 목표

- `워크스페이스`, `세션`, `거버넌스`를 고정된 1차 앱 영역으로 식별합니다.
- 현재 route는 icon, label, surface, indicator와 접근성 attribute로 명시합니다.
- live notification/history panel을 Session Catalog와 구분합니다.
- Workspace, Session result, Managed Project의 선택 상태를 일관된 방식으로 표시합니다.
- mobile에서 현재 영역을 header와 bottom navigation에 유지하고 44px touch target을 지킵니다.
- active runtime/status color와 generic navigation selection color의 의미를 분리합니다.
- existing route, API, Runtime v2, durable schema와 terminal lifecycle을 바꾸지 않습니다.

## 범위 밖

- Workspace와 Managed Project를 하나의 entity로 합치기
- Session Catalog filter, Governance data model 또는 API 변경
- 새 route, URL query/deep-link schema, browser history contract 추가
- sidebar item customization 전체 재설계
- theme palette 또는 새 color token 추가
- terminal, timeline, reconnect 동작 변경

## 정보 구조

### 1차 앱 영역

1차 영역은 모든 화면에서 같은 순서와 이름을 사용합니다.

| ID | 한국어 | 영어 | route | 역할 |
| --- | --- | --- | --- | --- |
| `workspace` | 워크스페이스 | Workspace | `/` | live pane/tab/terminal/Codex 운영 |
| `sessions` | 세션 | Sessions | `/sessions` | Session Catalog 검색·복기·annotation |
| `governance` | 거버넌스 | Governance | `/governance` | Managed Project knowledge/lifecycle/action |

세 영역은 `AppAreaNavigation`이 소유합니다. Notes, Stats, custom webview와 Settings는 utility
navigation으로 유지합니다. Utility route 또는 custom webview가 active이면 세 core area 중 어느 것도
current로 표시하지 않습니다. Session Catalog와 Governance는 제품의 core surface이므로 1차 영역에서
숨길 수 없게 하고, 기존 disabled builtin 설정은 core rendering에서 무시합니다. 설정 화면에서는 두
builtin을 `항상 표시`로 안내하고 toggle과 reorder를 비활성화하되 기존 설정 값은 삭제하거나 rewrite하지
않습니다.

### Workspace 내부 context

현재 `WORKSPACE / SESSIONS` local tab은 다음처럼 이름과 역할을 교정합니다.

| 현재 | 변경 | 의미 |
| --- | --- | --- |
| `WORKSPACE` | `워크스페이스` / `Workspaces` | workspace·group 목록 |
| `SESSIONS` | `활동` / `Activity` | busy, needs-input, review, completed activity |

`활동`은 route가 아니라 Workspace 영역의 context panel입니다. badge는 live attention/busy count를
계속 표시합니다. persisted `sidebar-tab=sessions`는 `activity`로 normalize하되 한 release 동안 legacy
값을 읽을 수 있게 합니다.

### Utility navigation

Notes, Stats, custom webview, Settings는 `유틸리티` 그룹으로 분리합니다. Desktop에서는 icon과 label을
함께 표시하고, 좁은 compact state에서만 tooltip이 있는 icon-only 표현을 허용합니다. Sidebar 자체를
접었을 때는 현재 32px rail 대신 40px 이상 rail을 사용하고 1차 영역 icon에 current indicator를
보존합니다.

## 상태 모델

선택 상태를 다음 네 종류로 구분합니다.

| 상태 | source | 접근성 | 시각 표현 |
| --- | --- | --- | --- |
| Current app area | `router.pathname`, active webview | `aria-current="page"` | leading rail + tinted surface + icon/label foreground |
| Selected entity | workspace/session/project selection | `aria-selected="true"` | full border + selected surface + persistent marker |
| Expanded disclosure | mobile workspace/group expansion | `aria-expanded` | chevron 방향과 child visibility만 변경 |
| Keyboard focus | browser focus | `focus-visible` | ring, selection과 독립 |

Runtime 상태인 busy, needs-input, ready-for-review, degraded는 기존 semantic status color를 사용합니다.
Navigation selection은 `agent-active`를 쓰지 않고 `focus-indicator`, `accent`, `foreground`, `border`
token으로 표현합니다. 따라서 녹색·주황색·붉은색은 계속 운영 상태만 의미합니다.

### Workspace state

- `activeWorkspaceId`는 마지막 active runtime context로 route 이동 중에도 유지합니다.
- `/`에서 active workspace row는 current workspace로 강하게 표시합니다.
- 다른 1차 영역에서는 workspace row를 page current처럼 표시하지 않습니다. 대신 Workspace 1차 nav의
  보조 text 또는 context header에 마지막 workspace 이름을 muted label로 보여 줍니다.
- Workspace row click은 기존처럼 workspace를 선택하고 `/`로 이동합니다.

### Session result state

- pointer click도 먼저 `selectedIndex`를 갱신한 뒤 replay drawer를 엽니다.
- selected result는 drawer open/close 동안 유지합니다.
- hover, focus, selected가 동시에 발생해도 selected marker가 사라지지 않습니다.
- `role=listbox`와 `role=option`, `aria-selected` 계약은 유지합니다.

### Managed Project state

- project list를 `role=listbox`, project button을 `role=option`으로 명시하고 `aria-selected`를 설정합니다.
- current selection은 border와 surface 외에 leading indicator를 표시합니다.
- 이번 slice에서는 URL query나 durable persistence를 추가하지 않고 기존 first-project fallback을
  유지합니다.

## Desktop 설계

Sidebar 순서는 다음과 같습니다.

```text
┌──────────────────────────┐
│ codexmux                  │
├──────────────────────────┤
│ ▌ 터미널  워크스페이스    │  current app area
│   검색    세션            │
│   방패    거버넌스        │
├──────────────────────────┤
│ [워크스페이스] [활동 2]   │  workspace-local context
│ Group A                  │
│ ▌ codexmux               │  selected workspace
│   /data/projects/...     │
│                          │
├──────────────────────────┤
│ 노트  사용량  설정        │  utilities
└──────────────────────────┘
```

1차 nav row는 sidebar width 160px에서도 label이 잘리지 않는 36px 높이를 기본으로 합니다. Current row는
다음 세 신호를 동시에 가집니다.

- 2px leading `focus-indicator`
- `bg-accent/60` 수준의 surface
- foreground icon과 semibold label

비선택 row는 transparent surface와 muted foreground를 사용합니다. Hover는 `bg-sidebar-accent`, pressed는
`bg-accent`를 사용하고 current indicator를 덮지 않습니다.

Session Catalog와 Governance main page header는 기존 compact header를 유지합니다. Sidebar current area와
page h1이 같은 label을 사용해 route 전환 직후 위치를 재확인할 수 있게 합니다.

## Mobile 설계

- Header는 `/`에서만 editable workspace 이름을 표시합니다.
- `/sessions`에서는 `codexmux / 세션`, `/governance`에서는 `codexmux / 거버넌스`를 표시합니다.
- 화면 하단에 3개의 48px app area item을 icon+label로 고정하고 `aria-current="page"`를 설정합니다.
- 기존 `MobileWorkspaceTabBar`는 `/`에서만 app area bar 위에 렌더링합니다.
- navigation sheet 상단에도 같은 1차 영역 row를 제공하고, active row 표현을 bottom navigation과
  공유합니다.
- `워크스페이스 / 활동` local tab과 workspace tree는 Workspace 영역 context로 묶습니다.
- utility icon은 최소 44×44px로 확대합니다.
- expanded workspace와 active workspace는 각각 chevron과 selection marker로 구분합니다.

## Component와 helper 계약

### `src/lib/app-navigation.ts`

```typescript
type TAppArea = 'workspace' | 'sessions' | 'governance';

interface IAppAreaItem {
  id: TAppArea;
  href: '/' | '/sessions' | '/governance';
  labelKey: 'workspace' | 'sessions' | 'governance';
  icon: 'SquareTerminal' | 'Search' | 'ShieldCheck';
}

const resolveAppArea = (pathname: string): TAppArea | null;
```

`resolveAppArea`는 Pages Router pathname만 해석하는 pure helper입니다. `/`, `/sessions`,
`/governance`만 app area를 반환하고 utility route에서는 `null`을 반환합니다. Entity selection이나
Runtime v2 상태를 소유하지 않습니다. Desktop custom webview처럼 pathname과 별도 surface가 active인
경우 caller가 current area를 `null`로 override합니다.

### `src/components/layout/app-area-navigation.tsx`

- desktop vertical row와 mobile bottom/sheet variant를 공유합니다.
- route item은 native link semantics를 유지합니다.
- current item에 `aria-current="page"`와 `data-current`를 함께 둡니다.
- status badge는 optional이며 current marker를 대체하지 않습니다.

### 기존 component 변경 경계

| Component | 변경 |
| --- | --- |
| `Sidebar` | 1차 영역과 utility/context navigation 분리, `SESSIONS`를 `Activity`로 교정 |
| `WorkspaceItem` | route current와 active workspace context를 별도 prop으로 표현 |
| `AppHeader` | workspace name 대신 current area label을 받을 수 있게 확장 |
| `MobileLayout` | route별 header와 workspace tab bar visibility 결정 |
| `MobileNavigationSheet` | 1차 영역 row, active route, 44px utility target 추가 |
| `SessionExplorer` | pointer selection을 명시하고 selected visual 강화 |
| `GovernanceReadModel` | project listbox semantics와 selected visual 강화 |

Third-party `src/components/ui/`는 refactor하지 않습니다. App-specific class와 wrapper component에서
상태 계약을 구현합니다.

## Locale copy

새 label은 한국어·영어를 함께 추가합니다.

| Key | ko | en |
| --- | --- | --- |
| `navigation.workspace` | 워크스페이스 | Workspace |
| `navigation.sessions` | 세션 | Sessions |
| `navigation.governance` | 거버넌스 | Governance |
| `navigation.activity` | 활동 | Activity |
| `navigation.utilities` | 유틸리티 | Utilities |
| `navigation.lastWorkspace` | 마지막 작업공간: {name} | Last workspace: {name} |

영문 uppercase literal은 component에서 직접 쓰지 않습니다. Sidebar와 mobile sheet는 locale message를
사용하고 한국어에서는 `[word-break:keep-all]`을 유지합니다.

## 접근성

- Current route는 `aria-current="page"`, selected list item은 `aria-selected`, disclosure는
  `aria-expanded`를 사용합니다.
- Route, selected, status는 color 하나로 구분하지 않습니다.
- Desktop nav row는 keyboard tab order와 visible focus ring을 가집니다.
- Mobile primary/utility action은 44px 이상입니다.
- Collapsed sidebar는 tooltip과 accessible label을 유지합니다.
- Screen reader label에 `Sessions`와 `Activity`를 혼용하지 않습니다.

## 검증

### Unit/component

- pathname별 `resolveAppArea`
- desktop/mobile current route의 `aria-current="page"`
- `/sessions`, `/governance`에서 `WORKSPACE` local tab이 current route처럼 노출되지 않음
- legacy `sidebar-tab=sessions`의 `activity` normalization
- pointer로 Session result를 열 때 `aria-selected=true`
- Managed Project option의 `aria-selected`
- mobile non-workspace route에서 `MobileWorkspaceTabBar` 미렌더링
- ko/en label과 SSR locale hydration

### Browser screenshot smoke

`scripts/smoke-session-governance-browser.mjs`를 확장해 다음 viewport를 고정합니다.

- desktop 1280×800: `/`, `/sessions`, `/governance` sidebar current area
- desktop Session result와 Managed Project selected state
- mobile 390×844: 세 route의 header, bottom app area nav, navigation sheet
- dark/light theme에서 current/selected/focus 구분

DOM gate는 screenshot만 보지 않고 다음을 assertion합니다.

- current app area 정확히 1개
- current item의 `aria-current="page"`
- utility route 또는 custom webview의 current app area 0개
- mobile primary/utility target 최소 44px
- non-workspace mobile route에서 workspace tab dot bar 없음
- hydration, console, page error 없음

## Rollout과 rollback

이 변경은 UI projection과 client state normalization만 포함합니다. API, DB, worker IPC, workspace layout과
terminal session을 변경하지 않습니다.

- rollout: desktop navigation → entity selection → mobile navigation 순서의 vertical test로 구현합니다.
- rollback: 새 navigation component와 legacy normalization을 되돌리면 기존 route/API는 그대로 동작합니다.
- persisted legacy `sidebar-tab=sessions`는 삭제하지 않으므로 rollback 뒤에도 기존 panel을 복원할 수
  있습니다.

## Spec Freeze 후보

- 1차 영역은 Workspace, Sessions, Governance 세 개로 고정합니다.
- live notification/history panel 이름은 Activity로 변경합니다.
- Workspace와 Managed Project는 결합하지 않습니다.
- current route, selected entity, expanded disclosure와 focus를 서로 다른 상태로 표현합니다.
- navigation selection에는 runtime status token을 사용하지 않습니다.
- mobile에는 label이 있는 3-item bottom navigation을 사용합니다.
- utility surface에서는 core app area를 current로 표시하지 않습니다.
- Sidebar 설정에서 Sessions와 Governance는 `항상 표시`로 안내하고 기존 disabled 값은 보존합니다.
- 새 API, URL query와 durable schema는 추가하지 않습니다.

## Lifecycle 승인

### Release blocker addendum

Live release preflight에서 등록 project의 lifecycle evidence 235개가 Runtime IPC snapshot 상한 200개를
넘어 Governance lifecycle API가 `command-failed`를 반환했습니다. 2026-08-23 사용자 승인에 따라
project document response와 동일한 bounded maximum 2,000개로 snapshot contract를 확장합니다. Durable
schema, write semantics와 project discovery 범위는 바꾸지 않으며 2,001개 이상은 계속 거부합니다.

- Domain architecture: `docs/superpowers/reviews/2026-08-23-navigation-selection-clarity-domain-architecture.md`
- Plan Grilling: `docs/superpowers/grill-me/2026-08-23-navigation-selection-clarity.md`
- Design review: `docs/superpowers/reviews/2026-08-23-navigation-selection-clarity-design-review.md`
- Implementation plan: `docs/superpowers/plans/2026-08-23-navigation-selection-clarity.md`
- Plan engineering review:
  `docs/superpowers/reviews/2026-08-23-navigation-selection-clarity-eng-review.md`
- Code review:
  `docs/superpowers/reviews/2026-08-23-navigation-selection-clarity-code-review.md`
- 다음 stage: `release`
