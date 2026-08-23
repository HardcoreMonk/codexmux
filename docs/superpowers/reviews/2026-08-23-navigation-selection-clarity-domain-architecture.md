# 1차 영역 탐색과 선택 상태 명료화 Domain Architecture Review

- 작성일: 2026-08-23
- 대상 spec: `docs/superpowers/specs/2026-08-23-navigation-selection-clarity-design.md`
- 결과: Pass — grill-me 진입 가능

## 소비한 기준

- `CONTEXT.md`
- `DESIGN.md`
- `docs/STYLE.md`
- `docs/ADR.md`의 ADR-031, ADR-032
- `.ua/domain-graph.json`의 Workspace & Terminal Operations, Session Catalog, Project Governance
- 현재 `Sidebar`, mobile navigation, Session Explorer, Governance read model 구현
- 2026-08-23 live Playwright navigation audit

Domain graph는 commit `b2d578f6`에서 생성됐지만 관련 UI source는 현재 HEAD까지 변경되지 않았습니다.
그 뒤 `CONTEXT.md` 변경은 live verification 근거 추가이며 아래 bounded context 판단을 바꾸지 않습니다.

## 용어 검토

현재 상단 `SESSIONS`는 Session Catalog가 아니라 live status와 completion history를 표시합니다. 이미
canonical term인 Session Catalog와 이름이 충돌하므로 `Activity`로 바꾸는 것이 맞습니다.

| UI 용어 | Domain 의미 | 판정 |
| --- | --- | --- |
| Workspace | pane/tab/layout 실행 aggregate | 유지 |
| Sessions | Session Catalog route | 1차 영역으로 한정 |
| Activity | busy, needs-input, review, completion projection | local context 이름으로 채택 |
| Governance | Managed Project knowledge/lifecycle/action | 1차 영역으로 유지 |
| Project | Session search metadata label | 기존 query field로 유지 |
| Managed Project | Governance aggregate | Workspace와 결합 금지 |

`workspace project`, 단독 `lifecycle`, generic terminal dashboard 같은 거부 용어를 추가하지 않습니다.

## Bounded context 검토

### Workspace & Terminal Operations

`activeWorkspaceId`는 실행 context를 가리키며 app route가 아닙니다. 다른 페이지로 이동할 때 값이
유지되는 것은 정상입니다. UI는 이를 current page selection으로 재해석하지 않고 마지막 runtime
context로 표시해야 합니다.

### Session Catalog

`/sessions`는 Codex JSONL projection을 검색·복기하는 독립 surface입니다. NotificationPanel의 live tab
state와 같은 이름을 쓰면 source-of-truth와 interaction expectation이 섞입니다. 1차 route `Sessions`와
local panel `Activity` 분리는 domain 경계를 더 정확히 드러냅니다.

### Project Governance

Governance selection은 `ManagedProject.id`를 사용합니다. Workspace directory와 경로가 같을 수 있어도
선택 상태나 entity를 공유하지 않습니다. 이번 변경에서 workspace→managed project 자동 결합, shared
selector 또는 unified project entity를 만들지 않습니다.

## View state ownership

| State | Owner | Lifetime | 다른 state와의 관계 |
| --- | --- | --- | --- |
| `TAppArea` | pathname projection | route | entity 선택과 독립 |
| `activeWorkspaceId` | workspace store | session/server state | Workspace area 진입 대상 |
| `sidebarTab` | workspace UI store | local persisted UI | Workspace/Activity context만 소유 |
| `selectedIndex` | Session Explorer hook | page mount | Session result selection |
| `selectedProjectId` | Governance hook | page mount | Managed Project selection |
| `expandedWsId` | mobile navigation sheet | sheet interaction | active workspace와 독립 |

하나의 global `selectedId`나 navigation store로 합치지 않습니다. `resolveAppArea(pathname)`만 공통 pure
projection으로 추가하는 것이 적절합니다.

## 의존 방향

```text
Pages Router pathname
  -> resolveAppArea
      -> AppAreaNavigation / AppHeader / MobileLayout

Workspace store -----------------> Workspace context panel
Session Catalog hook ------------> Session Explorer selection
Governance hook -----------------> Managed Project selection
Tab/status store ----------------> Activity badge와 runtime status
```

App area navigation은 workspace, session catalog, governance domain service를 import하지 않습니다.
각 domain의 entity selection도 navigation helper를 import할 필요가 없습니다.

## ADR 검토

새 ADR은 필요하지 않습니다.

- Workspace와 Managed Project 분리는 ADR-031/032와 `CONTEXT.md`에 이미 고정돼 있습니다.
- Pages Router, custom server, shared state, storage, auth, notification semantics를 바꾸지 않습니다.
- 이번 결정은 기존 시각 계약을 구체화하는 UI information architecture입니다.

구현 승인 시 `DESIGN.md`와 `docs/STYLE.md`에 current route/selected entity/status/focus의 시각 분리 규칙을
추가하면 충분합니다. `docs/ADR.md`는 변경하지 않습니다.

## 위험과 제어

| 위험 | 제어 |
| --- | --- |
| 기존 `SESSIONS` 사용자 기억과 충돌 | Activity locale과 live count badge로 역할 명시 |
| sidebar customization 호환 | stored disabled ID를 삭제하지 않고 core nav rendering에서만 제외 |
| route와 workspace current 중복 | `aria-current=page`와 runtime context label을 별도 표현 |
| status color와 selection color 혼용 | navigation에서 `agent-active` 제거, neutral/focus token 사용 |
| mobile vertical 공간 감소 | workspace tab dots는 `/`에서만 표시하고 3-item area bar를 고정 |
| component state 분산 | pure route resolver와 shared AppAreaNavigation variant 사용 |

## 결론

제안은 세 bounded context를 합치지 않고 UI projection만 정리합니다. Domain term 충돌을 제거하고,
route·entity·disclosure·focus state ownership을 분리하며, Runtime v2와 durable contract에 영향을 주지
않습니다. Plan Grilling으로 진행할 수 있습니다.
