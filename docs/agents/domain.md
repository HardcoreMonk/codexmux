# 도메인 문서 규칙

이 저장소에서 새 기능, 동작 변경, 작업 흐름 계약 변경, 여러 파일에 걸친 변경을
시작할 때는 도메인 아키텍처 점검을 거칩니다.

## 작업 전에 읽을 문서

가능하면 다음 순서로 읽습니다. 파일이 없으면 오류가 아닙니다.

1. `CONTEXT.md`
2. `CONTEXT-MAP.md`
3. `docs/adr/`
4. 맥락별 ADR directory
5. `docs/ADR.md`
6. `docs/PROJECT-DESIGN.md`
7. UI 시각 계약이 관련되면 root `DESIGN.md`와 `docs/STYLE.md`
8. 관련 기존 코드와 문서

## 도메인 아키텍처 점검

`superpowers:brainstorming / writing-spec` 뒤, `grill-me` 전에 수행합니다.

출력해야 하는 내용:

- 기준 도메인 용어
- 거부된 동의어
- bounded context 또는 module 후보
- aggregate/entity/value-object 후보
- folder structure 영향
- module boundary 영향
- 공개 API, function signature, type shape 영향
- adapter/infrastructure 경계 영향
- ADR 후보

## 용어

확인된 도메인 언어와 충돌하는 이름을 코드에 추가하지 않습니다. Windows 전용
전환에서는 다음 용어를 우선합니다.

| 표준 용어 | 의미 |
| --- | --- |
| Windows 전용 제품 | 지원 실행 타깃을 Windows로 고정하는 제품 전환 |
| Windows terminal runtime | Windows local shell/Codex session을 유지하는 runtime |
| Windows service host | 앱/backend lifecycle을 관리하는 host boundary |
| 런타임 어댑터 | OS별 terminal/process/service 구현 경계 |
| Local Codex session | local JSONL과 running process를 연결한 투영 |
| 시각 계약 | 제품 UI의 theme, layout, component 상태, 반응형/accessibility 규칙 |

거부 용어:

- Windows companion integration
- Windows bridge
- tmux backend를 기준 runtime 용어로 쓰는 표현
- Android primary client
- terminal dashboard를 제품 정체성으로 쓰는 표현

## ADR

다음 조건을 모두 만족하면 ADR 후보입니다.

- 되돌리기 어렵습니다.
- 맥락 없이 보면 놀라운 결정입니다.
- 실제 trade-off가 있습니다.

작은 styling, 단일 copy, 테스트만의 정리는 ADR이 필요하지 않습니다.

## Improve Codebase Architecture 경계

`improve-codebase-architecture`는 승인된 plan에 포함된 architecture 후보에만 적용합니다.

허용:

- shallow module
- duplicated boundary
- testability friction
- domain behavior와 data locality 문제
- 확인된 domain language와 충돌하는 naming

금지:

- unrelated module 변경
- FE/React/Vercel skill rewrite
- BE/FastAPI skill rewrite
- 승인 없는 sub-agent dispatch
- open-ended cleanup phase
