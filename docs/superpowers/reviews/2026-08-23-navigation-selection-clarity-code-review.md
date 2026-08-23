# 1차 영역 탐색과 선택 상태 명료화 Code Review

- 날짜: 2026-08-23
- 대상 spec: `docs/superpowers/specs/2026-08-23-navigation-selection-clarity-design.md`
- 대상 plan: `docs/superpowers/plans/2026-08-23-navigation-selection-clarity.md`
- Stage: `code-review`
- 결과: 통과
- Blocking finding: 없음

## Review 방식

`understand-diff` workflow를 적용하려 했으나 이 checkout에는 필수 입력인
`.ua/knowledge-graph.json`이 없습니다. 따라서 diff overlay는 생성하지 않았고, 기존
`.ua/domain-graph.json`, direct import 관계, source diff와 실행 evidence를 함께 검토했습니다.

## 상태와 ownership

- `resolveAppArea`는 Pages Router pathname만 해석하는 pure helper이며 Workspace, Session Catalog,
  Governance state를 import하지 않습니다.
- core app area current state는 route에서 파생되고, active desktop webview에서는 caller가 `null`로
  override합니다. utility surface에서 Workspace가 잘못 current로 남지 않습니다.
- Workspace/Activity는 기존 Zustand local UI state, Session result와 Managed Project는 기존 page hook의
  selection을 계속 사용합니다. 새 global store나 durable schema를 추가하지 않았습니다.
- core link를 누르면 active webview를 숨긴 뒤 기존 Pages Router navigation을 사용합니다.

## UX와 accessibility

- desktop expanded, collapsed rail, mobile bottom, mobile sheet가 동일한 고정 영역 순서와 label을
  공유합니다.
- current route는 `aria-current="page"`, selected entity는 `aria-selected`, disclosure는
  `aria-expanded`, keyboard focus는 `focus-visible`로 구분됩니다.
- navigation/entity selection은 neutral `accent`, `border`, `focus-indicator` token을 사용합니다.
  Session runtime과 Governance lifecycle에 이미 쓰이는 semantic status color는 유지됩니다.
- Workspace/Activity context는 core app area 아래에 별도 heading으로 분리되고, Session Catalog를
  가리키던 legacy `sessions` local value는 `activity`로 normalize됩니다.
- mobile core item은 48px, sheet utility와 workspace action은 44px 이상 target을 유지합니다.
- Session pointer selection은 replay open보다 먼저 갱신되고 Managed Project list는 유효한
  listbox/option 구조를 가집니다.

## Compatibility와 운영 영향

- `_document.tsx` bootstrap과 Zustand initialization이 `sessions`와 `activity`를 같은 값으로
  normalize해 legacy preference를 유지합니다.
- fixed Session/Governance item은 설정에서 숨김과 reorder를 막지만 기존 저장 값을 삭제하거나
  rewrite하지 않습니다.
- API, Runtime v2, terminal/input/reconnect, tmux, notification semantics와 durable data는 수정하지
  않았습니다.
- source checkout의 `.next`, live user service, version, npm release, git commit과 push는 변경하지
  않았습니다.

## Verification evidence

| Gate | 결과 |
| --- | --- |
| focused navigation tests | 3 files, 21 tests passed |
| full unit suite | 270 files passed, 1 skipped; 1,688 tests passed, 3 skipped |
| TypeScript | `corepack pnpm tsc --noEmit` passed |
| lint | 0 errors, existing `window.location.href` warnings 6개 |
| design governance | `corepack pnpm check:project-design` passed |
| diff hygiene | `git diff --check` passed |
| isolated browser smoke | 한국어·영어 `ssr-search-replay-governance-gate-off-recovery` passed |
| responsive evidence | desktop Sessions와 mobile Governance를 dark/light에서 확인 |

Browser smoke는 temporary mirror와 synthetic HOME/session/project fixture에서 실행했습니다. current area
count, utility current-null, collapsed rail, legacy hydration, route별 mobile header/tab bar, 44px/48px target,
Session/Managed Project selection과 console/page/hydration error를 DOM assertion으로 판정했습니다.

## Finding

Blocking 또는 high-severity finding은 없습니다. Review 중 listbox label을 option group 밖으로 분리하고
mobile 44px geometry의 subpixel tolerance를 보정했으며, 수정 후 전체 gate와 isolated browser smoke를
다시 통과했습니다.

## Review 결론

구현은 승인된 정보 구조와 상태 의미를 충족하고 terminal/runtime 경계를 침범하지 않습니다. 다음
stage는 별도 승인에 따른 `release`이며, 그 전까지 live service는 기존 build를 계속 사용합니다.
