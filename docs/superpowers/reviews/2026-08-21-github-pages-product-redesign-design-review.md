# GitHub Pages 제품 재설계 Design Review

- 날짜: 2026-08-21
- 결과: Approved

## 검토 결과

- 제품 identity가 terminal dashboard에서 Codex 중심 세션 매니저로 교정됐다.
- 신규 hierarchy는 사용자의 실행, 검토, project 관리, runtime 운영 흐름과 일치한다.
- Session Operations와 Project Governance가 동일한 깊이의 navigation entry를 가진다.
- code-native preview는 실제 field와 상태만 사용하고 live data count를 암시하지 않는다.
- Available, Guarded, Not in current scope 구분이 과장된 기능 주장을 방지한다.
- English/Korean copy가 같은 structural contract를 공유한다.

## 조건

- product UI용 marketing 금지 규칙을 static marketing site에 기계적으로 적용하지 않되,
  decorative effect보다 운영 정보와 scanability를 우선한다.
- mobile, stats, notes는 핵심 제품 축보다 먼저 노출하지 않는다.
- 색상만으로 runtime/action status를 표현하지 않는다.
- legacy locale URL은 삭제하지 않는다.

Blocker는 없다.
