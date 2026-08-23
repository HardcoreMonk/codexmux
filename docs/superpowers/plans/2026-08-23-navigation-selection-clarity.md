# 1차 영역 탐색과 선택 상태 명료화 구현 계획

- 날짜: 2026-08-23
- 상태: Completed — live deploy와 operate handoff 완료
- 대상 spec: `docs/superpowers/specs/2026-08-23-navigation-selection-clarity-design.md`
- Domain review: `docs/superpowers/reviews/2026-08-23-navigation-selection-clarity-domain-architecture.md`
- Grill-me: `docs/superpowers/grill-me/2026-08-23-navigation-selection-clarity.md`
- Design review: `docs/superpowers/reviews/2026-08-23-navigation-selection-clarity-design-review.md`
- 구현 방식: route projection과 state semantics를 먼저 고정하는 vertical TDD

## 범위

Desktop과 mobile에 Workspace, Sessions, Governance 고정 app area navigation을 추가하고 Workspace 내부
live panel을 Activity로 교정합니다. Current route, Workspace/Session/Managed Project selection,
disclosure와 focus의 시각·접근성 의미를 분리합니다.

API, Runtime v2, terminal/input/reconnect, URL query, durable schema, version/npm/tag/Release, commit/push와
live service restart는 변경하지 않습니다.

## Execution Environment Constraints

- Runtime: Node `>=20.9.0`, Next.js Pages Router와 custom server
- Package manager: `corepack pnpm`
- Styling: Tailwind CSS v4, existing shadcn/ui와 theme token
- Locale: 한국어 기본, 영어 동시 지원, SSR locale hydration 보존
- Platform: desktop browser 우선, Electron desktop shell과 Capacitor/mobile viewport regression
- Next contract read:
  `node_modules/next/dist/docs/02-pages/03-building-your-application/01-routing/03-linking-and-navigating.md`,
  `node_modules/next/dist/docs/02-pages/04-api-reference/01-components/link.md`
- Live isolation: active service가 source checkout artifact를 사용하므로 `.next`를 교체하는 build는 승인 없이
  실행하지 않습니다. Production build가 필요하면 temporary mirror를 사용합니다.

## Task 1. App area와 legacy Activity state contract를 TDD로 고정

Files:

- Create: `src/lib/app-navigation.ts`
- Create: `src/lib/sidebar-tab.ts`
- Create: `tests/unit/lib/app-navigation.test.ts`
- Create: `tests/unit/lib/sidebar-tab.test.ts`
- Modify: `src/pages/_document.tsx`
- Modify: `src/hooks/use-workspace-store.ts`
- Modify: `src/hooks/use-global-shortcuts.ts`
- Modify: `tests/unit/lib/workspace-store.test.ts`
- Create: `messages/ko/navigation.json`
- Create: `messages/en/navigation.json`
- Modify: `src/lib/message-namespaces.ts`

Steps:

1. `TAppArea`, fixed area descriptor와 `resolveAppArea(pathname)`의 failing test를 먼저 추가합니다.
   `/`, `/sessions`, `/governance`만 각각 area를 반환하고 `/reports`, `/stats`, `/webview`, unknown route는
   `null`을 반환합니다.
2. `TSidebarTab = 'workspace' | 'activity'`와 `normalizeSidebarTab(raw)`을 추가합니다. `sessions`와
   `activity`는 `activity`, 그 밖의 값은 `workspace`가 되는 test를 고정합니다.
3. `_document.tsx`의 pre-hydration script와 Zustand 초기화를 함께 갱신해 legacy `sessions`를 읽되 first
   render부터 `activity`로 normalize합니다. 새 interaction은 local storage에 `activity`만 씁니다.
4. Global shortcut은 Workspace와 Activity 사이만 전환하고 sidebar가 접힌 경우 기존처럼 펼칩니다.
5. 새 `navigation` message namespace에 Workspace, Sessions, Governance, Activity, Utilities,
   last-workspace와 always-visible copy를 한국어·영어로 추가합니다.
6. SSR/client가 서로 다른 tab literal을 선택하지 않는지 workspace store test와 browser hydration gate로
   검증합니다.

## Task 2. 공통 AppAreaNavigation과 desktop hierarchy를 구현

Files:

- Create: `src/components/layout/app-area-navigation.tsx`
- Create: `tests/unit/components/app-area-navigation.test.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/features/workspace/workspace-item.tsx`
- Modify: `src/components/features/settings/sidebar-items-settings.tsx`
- Modify: `messages/ko/sidebar.json`
- Modify: `messages/en/sidebar.json`
- Modify: `messages/ko/settings.json`
- Modify: `messages/en/settings.json`

Steps:

1. `AppAreaNavigation`에 `desktop`, `rail`, `mobile-bottom`, `mobile-sheet` variant와
   `currentArea: TAppArea | null`, optional `onNavigate`를 정의합니다. Route 이동은 Pages Router의
   `next/link`를 사용하고 current item에만 `aria-current="page"`와 `data-current`를 둡니다.
2. Desktop expanded variant는 36px 이상의 icon+label row, 2px leading rail, selected surface와
   `focus-visible` ring을 결합합니다. Rail variant는 최소 40px target, tooltip과 accessible label을
   유지합니다.
3. Sidebar를 app area → Workspace local context → Workspace list → utility 순서로 재배치합니다. Local
   tab literal과 copy는 `Workspace / Activity`로 바꾸고 attention/busy badge 동작은 그대로 유지합니다.
4. Core Session/Governance builtin은 utility rendering에서 제외합니다. Notes, Stats와 custom webview는
   expanded sidebar에서 icon+label, rail에서는 icon+tooltip으로 표시하고 active webview에서는 core
   current state를 모두 제거합니다.
5. Collapsed sidebar는 현재의 expand-only 32px strip 대신 별도 40px app area rail과 expand/settings
   접근을 제공합니다. `_document.tsx`의 expanded panel initial width는 0을 유지하고 pre-hydration
   collapsed state가 별도 rail을 선택하게 해 이중 폭과 layout shift를 막습니다.
6. Workspace list에는 listbox/option selection semantics를 적용합니다. `/`에서만 active workspace에
   `aria-selected`, leading marker와 selected surface를 표시하고 다른 route에서는 last workspace를
   muted context로만 노출합니다.
7. Sidebar settings의 Session/Governance builtin은 drag와 switch를 비활성화하고 `항상 표시`로 안내합니다.
   기존 `disabledBuiltinIds`와 `order`를 삭제하거나 rewrite하지 않습니다.
8. Component test는 variant별 label, 정확히 하나 또는 0개의 current item, native link, tooltip label과
   neutral selection token class를 검증합니다.

## Task 3. Mobile app area, header와 navigation sheet를 정렬

Files:

- Modify: `src/components/features/mobile/mobile-layout.tsx`
- Modify: `src/components/features/mobile/mobile-navigation-sheet.tsx`
- Modify: `src/components/layout/app-header.tsx`
- Modify: `messages/ko/mobile.json`
- Modify: `messages/en/mobile.json`
- Modify: `messages/ko/header.json`
- Modify: `messages/en/header.json`

Steps:

1. `MobileLayout`은 `resolveAppArea(router.pathname)`을 한 번 계산해 header, bottom navigation과 sheet에
   전달합니다.
2. Header는 Workspace area에서만 editable workspace name을 표시합니다. Sessions와 Governance에서는
   localized area label, utility route에서는 해당 utility label을 non-editable context로 표시합니다.
3. `MobileWorkspaceTabBar`는 `/`에서만 렌더링하고 그 아래에 48px 이상의 3-item icon+label bottom
   navigation을 safe-area padding과 함께 고정합니다.
4. Navigation sheet 상단에 같은 3개 area를 `mobile-sheet` variant로 제공하고 이동 시 sheet를 닫습니다.
   그 아래 Workspace/Activity local tab과 workspace tree를 유지하되 uppercase literal을 제거합니다.
5. Mobile utility actions는 최소 44×44px로 키우고 core builtin duplicate는 제외합니다.
6. Workspace disclosure button에 `aria-expanded`, active workspace row에 selected marker를 추가해 펼침과
   selection을 서로 다른 신호로 표현합니다.
7. Browser gate에서 세 route의 header, bottom navigation current state, tab bar visibility, sheet 이동과
   touch target geometry를 검증합니다.

## Task 4. Session과 Managed Project selected state를 강화

Files:

- Modify: `src/components/features/session-explorer/session-explorer.tsx`
- Modify: `tests/unit/components/session-explorer.test.ts`
- Modify: `src/components/features/governance/governance-read-model.tsx`
- Modify: `tests/unit/components/governance-read-model.test.ts`

Steps:

1. Session result pointer click은 `onSelectIndex(index)`를 먼저 호출한 뒤 replay를 엽니다. Keyboard roving
   focus와 `role=listbox`/`role=option` 계약은 유지합니다.
2. Selected Session result는 `agent-active` 대신 full border, accent surface와 leading marker를 사용하고
   drawer open/close 동안 hook의 `selectedIndex`를 유지합니다.
3. Governance project aside에 `role=listbox`와 localized label, 각 button에 `role=option`과
   `aria-selected`를 추가합니다.
4. Selected Managed Project도 neutral border/surface/marker를 사용하며 lifecycle과 write/runtime badge의
   semantic status color는 변경하지 않습니다.
5. Static component test로 exactly-one `aria-selected`, selected marker와 status/selection token 분리를
   검증하고 pointer ordering은 Playwright에서 drawer open 전 selected state가 갱신되는지 확인합니다.

## Task 5. Browser acceptance와 visual evidence를 확장

Files:

- Modify: `scripts/smoke-session-governance-browser.mjs`
- Modify: `docs/TESTING.md`

Steps:

1. Existing isolated HOME, synthetic session/project와 auth cookie fixture를 재사용합니다. 실제 terminal
   content, 사용자 path, token과 secret은 screenshot이나 output에 포함하지 않습니다.
2. 한국어·영어 desktop 1280×800에서 `/`, `/sessions`, `/governance`가 정확히 하나의 current area를
   가지고 utility route는 0개인지 assertion합니다.
3. Expanded/collapsed sidebar의 label, 40px rail, tooltip, keyboard focus와 existing collapse preference
   보존을 검증합니다.
4. Mobile 390×844에서 세 route의 48px bottom item, `aria-current`, route별 header와 Workspace tab bar
   visibility를 확인합니다. Navigation sheet utility action도 44px 이상인지 측정합니다.
5. Session result와 Managed Project를 pointer/keyboard로 선택해 persistent marker와 `aria-selected`를
   검증합니다. Runtime status badge가 함께 있어도 current/selected marker가 유지돼야 합니다.
6. Dark/light navigation 영역 screenshot은 synthetic fixture만 포함하도록 clip하고, optional
   `CODEXMUX_SMOKE_ARTIFACT_DIR` 아래에 locale·theme·viewport가 드러나는 이름으로 저장합니다.
7. Console, page, hydration error가 없고 legacy `sidebar-tab=sessions` reload가 Activity로 표시되는지
   확인합니다.

## Task 6. Visual contract 문서와 regression gate를 완료

Files:

- Modify: `DESIGN.md`
- Modify: `docs/STYLE.md`
- Modify: `docs/TESTING.md`

Steps:

1. Current route, selected entity, disclosure, focus와 runtime status의 시각 의미를 canonical contract에
   반영합니다.
2. Desktop rail/expanded hierarchy, mobile bottom navigation, minimum touch target와 utility current-null
   규칙을 문서화합니다.
3. Focused unit test → `check:project-design` → `tsc --noEmit` → lint → full unit test → isolated browser
   smoke 순서로 검증합니다.
4. Source checkout의 live `.next`를 바꾸지 않습니다. Temporary mirror production build와 live service
   restart는 release 승인이 있을 때만 수행합니다.
5. Status model, API, durable schema와 architecture decision을 바꾸지 않으므로 `docs/STATUS.md`와
   `docs/ADR.md`는 수정하지 않습니다.

## Verification Commands

```bash
corepack pnpm exec vitest run \
  tests/unit/lib/app-navigation.test.ts \
  tests/unit/lib/sidebar-tab.test.ts \
  tests/unit/lib/workspace-store.test.ts \
  tests/unit/components/app-area-navigation.test.ts \
  tests/unit/components/session-explorer.test.ts \
  tests/unit/components/governance-read-model.test.ts
corepack pnpm check:project-design
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
corepack pnpm smoke:browser:session-governance
```

## Rollout과 rollback

- 구현 merge만으로 live service를 재시작하거나 release하지 않습니다.
- Rollout 승인 시 desktop expanded → desktop rail → entity selection → mobile navigation 순으로 live smoke를
  수행합니다.
- Rollback은 app navigation component와 view-state normalization source를 되돌리는 것으로 충분하며 API,
  DB와 session data rollback은 없습니다.
- Legacy `sidebar-tab=sessions`와 sidebar builtin disabled 값은 삭제하지 않으므로 이전 source로 돌아가도
  기존 설정을 읽을 수 있습니다.

## Lifecycle 승인

### Release blocker hotfix

- Modify: `src/lib/governance/contracts.ts`
- Modify: `tests/unit/lib/governance/contracts.test.ts`
- Red: 201개 lifecycle evidence가 기존 maximum 200에서 거부되는 것을 재현합니다.
- Green: document response와 같은 maximum 2,000을 허용하고 2,001개는 거부합니다.
- Regression: Governance contract, Runtime IPC와 governance worker test를 함께 실행합니다.

- Plan engineering review:
  `docs/superpowers/reviews/2026-08-23-navigation-selection-clarity-eng-review.md`
- Code review:
  `docs/superpowers/reviews/2026-08-23-navigation-selection-clarity-code-review.md`
- Operations handoff:
  `docs/operations/2026-08-23-navigation-selection-clarity-handoff.md`
- 현재 stage: `operate`
