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
- Commit, push, PR, issue와 Pages publish

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
- GitHub Pages: workflow build 방식, public/HTTPS, repository subpath `/codexmux/`
- Canonical source: `landing-src/_data/site.js`
- Build artifact: `_site/`, commit 대상 아님
- `.ua/`: 기존 generated cache, 변경 범위에서 제외
- Remote write: 수행하지 않음

현재 public URL은 기존 `main` artifact를 제공합니다. 이 handoff의 변경은 아직 commit/push되지 않아
public site에는 반영되지 않았습니다.

## Rollback

게시 전에는 이 branch의 Pages source 변경만 버리면 됩니다. 게시 후 문제가 생기면 영향을 준
Pages source commit을 되돌려 `main`에 반영하고 다음 workflow가 직전 artifact를 재생성하도록
합니다. `_site/`를 직접 수정하거나 Linux service를 재시작하지 않습니다.

## Residual Risk

- Legacy 9개 locale은 URL 호환용 snapshot이라 current guide coverage를 보장하지 않습니다.
- External CDN font/Swiper/Fuse와 기존 analytics availability는 이번 변경에서 다루지 않았습니다.
- Workflow 성공 뒤에도 public cache, asset와 canonical은 실제 Pages URL에서 확인해야 합니다.

## Current Lifecycle Stage

`release` — source, code review와 local acceptance는 완료했고 remote publish만 보류 상태입니다.

## Next Action

별도 승인 후 변경을 commit/push 또는 PR로 `main`에 반영합니다. Pages workflow 성공 뒤 landing,
`/docs/`, 신규 세 guide, mobile navigation, search, 404와 canonical을 public URL에서 smoke합니다.
