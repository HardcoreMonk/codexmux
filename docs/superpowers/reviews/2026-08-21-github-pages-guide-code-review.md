# GitHub Pages 공개 가이드 Code Review

- 날짜: 2026-08-21
- 결과: Approved
- Blocker: 없음

## 검토 범위

- GitHub Pages canonical, 404, robots와 sitemap
- Eleventy guide navigation, locale availability와 hreflang
- Agent quickstart, Linux 서비스와 Project Governance 공개 가이드
- Landing artifact checker와 Pages workflow gate
- Linux 단일 엔진 기준의 root/한국어 랜딩 copy
- Maintainer 문서와 lifecycle 산출물

## Findings

초기 artifact 검사에서 legacy locale 문서 home과 신규 root/`ko/` 전용 guide 사이의 broken link를
발견했습니다. 모든 locale home, sidebar, pagination, language switch와 hreflang이 실제 guide
availability를 따르도록 교정한 뒤 전체 artifact 검사를 다시 통과했습니다.

추가 blocker는 없습니다.

## 안전성과 유지보수성

- Checker는 생성된 `_site/`만 읽고 required artifact, canonical, local target과 artifact root
  containment를 검사합니다.
- Pages workflow는 build 뒤 checker가 통과한 artifact만 upload합니다.
- 신규 guide의 systemd 기본 bind는 `localhost`이며 외부 bind, restart, governance write와
  data 삭제를 사용자 승인 경계로 둡니다.
- Application runtime, API, durable storage와 live Linux service는 변경하지 않습니다.
- `_site/`와 `.ua/`는 commit 범위에서 제외합니다.

## 검증

| Gate | 결과 |
| --- | --- |
| Landing checker unit | 5 passed |
| Eleventy build | 362 templates 작성, 통과 |
| Landing artifact check | 397 files, 359 HTML, 19,368 local links 통과 |
| Full unit suite | 1,654 passed, 3 skipped |
| Typecheck | 통과 |
| Lint | 0 error, 기존 warning 6개 |
| Project design check | 통과 |
| Desktop/mobile browser render | landing/docs/guide, horizontal overflow 없음 |
| Diff hygiene | 통과 |

## 잔여 경계

- Root와 `ko/` 외 9개 locale은 정책상 보존된 snapshot이며 신규 운영 guide를 제공하지 않습니다.
- GitHub Pages publish 결과와 public URL smoke는 commit/push 후 별도 확인해야 합니다.
- Custom domain, CNAME과 DNS는 이번 범위에 포함하지 않습니다.
