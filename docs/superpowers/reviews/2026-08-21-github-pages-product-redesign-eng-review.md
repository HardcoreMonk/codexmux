# GitHub Pages 제품 재설계 Engineering Review

- 날짜: 2026-08-21
- 결과: Approved

## 검토 결과

- Nunjucks 공통 include와 locale data로 English/Korean 구조 drift를 줄인다.
- final `_site` content contract는 source template이 아닌 실제 deploy artifact를 검사한다.
- product term 검사는 정적 marketing 문구 변경에만 적용하고 app/runtime module에 결합하지 않는다.
- 신규 guide는 existing locale-aware navigation과 pagination contract를 사용한다.
- 새 runtime dependency, client script, external service 또는 API call을 추가하지 않는다.
- 기존 legacy locale artifact를 삭제하지 않아 incoming link를 보존한다.

## 위험과 대응

| 위험 | 대응 |
| --- | --- |
| locale별 product copy drift | 공통 structural template과 locale data |
| 미구현 기능 과장 | capability state와 forbidden claim 검사 |
| 신규 guide 404 | required artifact와 local link checker |
| responsive overflow | desktop/mobile static preview 확인 |
| runtime docs drift | CONTEXT/ADR/operations handoff 기반 content review |

Blocker는 없다.
