# Public Site opencodex Renewal Design Review

- 날짜: 2026-08-24
- 결과: Approved

## Review

- Reference의 hierarchy를 사용하되 codexmux의 운영 중심 제품 메시지가 첫 viewport를 소유한다.
- Floating shell은 homepage와 docs의 관계를 명확히 하고 search/theme/locale을 같은 위치에 둔다.
- Hero artwork는 장식이고 제품 proof는 code-native frame이므로 marketing visual이 기능 증거를
  대신하지 않는다.
- Quickstart, product proof, bento, docs map 순서는 설치에서 운영 문서까지 자연스럽다.
- Workspace, Sessions, Governance와 Runtime이 label로 구분돼 색상 의존을 피한다.
- Mobile menu, 44px target, focus-visible과 reduced-motion 조건이 명시됐다.
- Legacy docs locale와 long-form article scanability를 유지한다.

## Conditions

- Reference page의 과도한 desktop scroll whitespace는 재현하지 않는다.
- Hero text contrast는 light/dark 모두 screenshot으로 확인한다.
- Header control이 좁은 viewport에서 겹치면 nav link보다 search/menu를 우선한다.
- Product preview는 실제 사용자 path나 live session content를 포함하지 않는다.

Blocker는 없다.
