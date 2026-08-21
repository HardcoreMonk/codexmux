# GitHub Pages 제품 재설계 Domain Architecture Review

- 날짜: 2026-08-21
- 결과: Approved

## 기준 도메인 용어

| 용어 | 공개 의미 |
| --- | --- |
| Codex 중심 세션 매니저 | 제품 정체성 |
| Session Operations | 과거 세션을 찾고 검토하는 사용자 기능 묶음 |
| Session Catalog | Codex JSONL에서 계산한 검색 projection |
| Live Session Control | terminal, tab, status와 timeline으로 실행 중 세션을 제어하는 surface |
| Managed Project | 승인 root 아래에서 governance policy를 가진 project aggregate |
| Project Governance | guidance, knowledge, check, audit와 governed action context |
| Knowledge Index | project-local 문서 navigation을 위한 재생성 가능 projection |
| Runtime Operations | worker health, rebuild, backup, service operation 영역 |
| Linux 단일 엔진 호스트 | runtime과 데이터 ownership을 가진 한 Linux host |

## 거부 용어

- terminal dashboard를 제품 정체성으로 사용하지 않는다.
- tmux backend를 기준 runtime 명칭으로 사용하지 않는다.
- Workspace와 Managed Project를 workspace project로 합치지 않는다.
- full sync, smart merge, auto adoption을 현재 기능처럼 쓰지 않는다.
- 원본 `codex-dashboard`, `codex-project-mgmt`를 codexmux의 public module 이름으로 사용하지 않는다.

## Bounded context와 공개 surface

| Context | 공개 surface | Source authority |
| --- | --- | --- |
| Session Operations | `/sessions`, Session Operations guide | Timeline Worker, session-catalog modules |
| Live Session Control | workspace/session UI, status/timeline guide | terminal runtime, status/timeline modules |
| Project Governance | `/governance`, Project Governance guide | Governance Worker, governance modules |
| Runtime Operations | health, rebuild, backup, Linux service guide | Runtime v2 supervisor/workers |
| Public Documentation | landing, docs navigation, static artifact | `landing-src/`, canonical product docs의 consumer |

## Aggregate·entity·value object 영향

새 runtime aggregate는 없다. Public Documentation은 기존 `SessionCatalog`, `ManagedProject`,
`GovernanceActionRun`, `KnowledgeIndex`의 설명만 소비한다. Pages 자체에서는 기존 `GuideEntry`,
`GuideNavigation`, `PagesArtifact` 모델을 유지한다.

## Folder·module 영향

- `landing-src/_includes/landing/product-home.njk`: English/Korean 공통 제품 구조
- `landing-src/_data/landingProduct.js`: locale별 제품 copy
- `landing-src/index.njk`, `landing-src/ko.njk`: locale entrypoint
- `landing-src/docs/session-operations.md`, `landing-src/docs/ko/session-operations.md`: 신규 guide
- `landing-src/_data/docsNav.js`: guide navigation
- `scripts/landing-site-check-lib.mjs`: content contract 검사

Next.js route, API signature, worker IPC, storage schema 영향은 없다.

## Adapter·infrastructure 경계

Eleventy는 renderer, GitHub Pages는 static hosting adapter다. Public Documentation은 live health를
조회하거나 app API에 연결하지 않는다. Code-native preview는 운영 상태의 예시이며 실제 live
population counter로 표현하지 않는다.

## ADR 후보

없다. 기존 ADR-031과 ADR-032를 공개 문서에 정확히 투영하는 변경이며 장기 runtime 결정을
추가하거나 대체하지 않는다.
