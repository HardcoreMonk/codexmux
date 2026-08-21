# GitHub Pages 공개 가이드 운영 인계

## Release Scope

기존 Eleventy와 GitHub Pages workflow를 유지하면서 공개 기준 URL, guide information architecture,
Linux 단일 엔진 설치 안내와 artifact quality gate를 현행화했습니다.

포함 범위:

- GitHub Pages canonical `https://hardcoremonk.github.io/codexmux/`
- 404, `robots.txt`, `sitemap.xml`
- 문서 home의 3분 quickstart와 사람/에이전트 진입점
- Agent quickstart, Linux 서비스, Project Governance root/`ko/` guide
- Locale-aware home/sidebar/pagination/language alternate
- Required artifact, canonical, local link와 path containment checker
- Pages workflow의 post-build checker
- Maintainer용 `docs/GITHUB-PAGES.md`

제외 범위:

- Custom domain/CNAME/DNS
- 보존된 9개 legacy locale의 신규 번역
- App runtime, live Linux service, DB와 governance gate 변경
- Issue 변경과 app service 배포

## Verification

| Gate | 결과 |
| --- | --- |
| `corepack pnpm exec vitest run tests/unit/scripts/landing-site-check.test.ts` | 5 passed |
| `corepack pnpm build:landing` | 통과, 362 templates |
| `corepack pnpm check:landing` | 397 files, 359 HTML, 19,368 local links |
| `corepack pnpm check:project-design` | 통과 |
| `corepack pnpm lint` | 0 error, 기존 warning 6개 |
| `corepack pnpm tsc --noEmit` | 통과 |
| `corepack pnpm test` | 1,654 passed, 3 skipped |
| Browser render | desktop landing/docs와 mobile guide 확인, overflow 없음 |
| `git diff --check` | 통과 |

## Audit

- 작업 branch: `codex/github-pages-guide`
- 시작 commit: `47bf8f94`
- 구현 commit: `b78f84f7`
- [PR #22](https://github.com/HardcoreMonk/codexmux/pull/22): CI 통과 후 merge
- Main merge commit: `0769285f`
- [Pages workflow run 32485665955](https://github.com/HardcoreMonk/codexmux/actions/runs/32485665955):
  build, artifact check, upload와 deploy 성공
- GitHub Pages: workflow build 방식, public/HTTPS, repository subpath `/codexmux/`
- Canonical source: `landing-src/_data/site.js`
- Build artifact: `_site/`, commit 대상 아님
- `.ua/`: 기존 generated cache, 변경 범위에서 제외
- Public URL: `https://hardcoremonk.github.io/codexmux/`

Public smoke에서 landing, docs home, Agent quickstart, Linux 서비스, Project Governance,
`robots.txt`, `sitemap.xml`이 HTTP 200과 예상 내용을 반환했습니다. 존재하지 않는 경로는 HTTP
404와 custom 안내 내용을 반환했고 HTML canonical은 GitHub Pages URL 아래로 확인했습니다.

## Rollback

게시 후 문제가 생기면 영향을 준 Pages source commit을 되돌려 `main`에 반영하고 다음 workflow가
직전 artifact를 재생성하도록 합니다. `_site/`를 직접 수정하거나 Linux service를 재시작하지
않습니다.

## Residual Risk

- Legacy 9개 locale은 URL 호환용 snapshot이라 current guide coverage를 보장하지 않습니다.
- External CDN font/Swiper/Fuse와 기존 analytics availability는 이번 변경에서 다루지 않았습니다.
- Workflow는 Node.js 20 action runtime deprecation annotation을 남겼습니다. GitHub runner가 이번
  run을 Node.js 24로 강제 실행해 배포는 성공했지만 action major upgrade는 별도 maintenance로
  추적합니다.

## Current Lifecycle Stage

`operate` — PR merge, Pages workflow와 public URL smoke까지 완료했습니다.

## Next Action

Pages workflow와 public URL을 관찰합니다. 다음 action major upgrade 또는 guide 변경 때 동일한
`build:landing` → `check:landing` → public smoke 순서를 반복합니다.
