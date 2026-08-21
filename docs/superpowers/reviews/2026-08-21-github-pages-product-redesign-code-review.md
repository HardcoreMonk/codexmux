# GitHub Pages 제품 재설계 Code Review

- 날짜: 2026-08-21
- 결과: Approved
- 범위: Public GitHub Pages source, generated artifact contract, canonical documentation

## 검토 결과

- English와 Korean home은 동일한 Nunjucks 구조와 locale data를 사용한다.
- Session Operations, Live Session Control, Project Governance, Runtime Operations가 현재 구현된
  API와 worker ownership을 과장 없이 설명한다.
- Session Explorer와 Project Governance preview는 code-native이며 live 데이터나 별도 서비스
  연결을 암시하지 않는다.
- Available, Guarded, Not in current scope가 기능 지원과 실제 데이터 존재 여부를 분리한다.
- root English와 `/ko/` Korean만 current alternate와 자동 redirect 대상으로 사용한다.
- legacy locale URL은 삭제하지 않고 신규 product navigation과 alternate에서만 제외한다.
- generated artifact content contract가 신규 guide, 핵심 용어, stale claim 부재와 local link를
  함께 검사한다.
- app runtime, API, worker, storage, authentication과 Linux service는 변경하지 않았다.

## 검증

| 검사 | 결과 |
| --- | --- |
| landing checker unit test | 통과, 6 tests |
| `corepack pnpm test` | 1,656 passed, 3 skipped |
| `corepack pnpm build:landing` | 통과 |
| `corepack pnpm check:landing` | 399 files, 361 HTML, 16,494 local links, 4 content contracts 통과 |
| `corepack pnpm check:project-design` | 통과 |
| `corepack pnpm lint` | 오류 0, 기존 navigation warning 6 |
| `corepack pnpm tsc --noEmit` | 통과 |
| `git diff --check` | 통과 |
| desktop/mobile generated page inspection | overflow와 browser console error 없음 |

## 잔여 사항

- 기존 root guide 일부와 documentation shell의 한국어 문자열은 legacy migration 범위로 남는다.
- commit, push, PR, Pages deploy와 live service restart는 이번 승인 범위가 아니므로 수행하지
  않았다.

Blocker는 없다.
