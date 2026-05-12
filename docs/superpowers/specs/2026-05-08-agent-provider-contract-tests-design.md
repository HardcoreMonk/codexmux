# Agent Provider Contract Test 설계

## 목표

Codex 외 provider를 추가하기 전에 `IAgentProvider` registry contract를 테스트로 고정한다. Provider 추가는
timeline/status/session mapping 전체에 영향을 주므로, registry 단계에서 식별자와 panel boundary 충돌을
먼저 차단한다.

## 범위

- provider id는 lowercase kebab/id 형식으로 제한한다.
- display name은 빈 문자열을 허용하지 않는다.
- panel type은 `normalizePanelType`으로 인정되는 값이어야 한다.
- provider id와 panel type은 registry 안에서 중복될 수 없다.
- `registerProvider`는 같은 validator를 사용한다.

## 제외

- Codex 외 provider 구현
- panel type 목록 확장
- process name matching 우선순위 정책
- timeline/status worker provider routing 변경

## 성공 기준

- 기존 Codex provider는 contract 위반이 없다.
- invalid id, empty display name, invalid panel type을 테스트가 잡는다.
- duplicate id/panel type을 테스트가 잡는다.
- focused provider test, `tsc`, `lint`, full test가 통과한다.
