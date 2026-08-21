# GitHub Pages 공개 가이드 구현 계획

- 날짜: 2026-08-21
- Spec: `docs/superpowers/specs/2026-08-21-github-pages-guide-design.md`
- Domain review: `docs/superpowers/reviews/2026-08-21-github-pages-guide-domain-architecture.md`
- Design review: `docs/superpowers/reviews/2026-08-21-github-pages-guide-design-review.md`

## Task 1. Pages artifact checker를 TDD로 추가

- Create: `scripts/landing-site-check-lib.mjs`
- Create: `scripts/check-landing-site.mjs`
- Create: `tests/unit/scripts/landing-site-check.test.ts`
- Modify: `package.json`

Required page, canonical URL, local link resolution과 path containment failure test를 먼저 작성하고
순수 검사 함수와 CLI adapter를 구현합니다.

## Task 2. Pages delivery metadata 교정

- Modify: `landing-src/_data/site.js`
- Modify: landing locale frontmatter canonical/OG URL
- Create: `landing-src/404.njk`
- Create: `landing-src/robots.njk`
- Create: `landing-src/sitemap.njk`
- Modify: `.github/workflows/deploy-landing.yml`

GitHub Pages URL을 canonical로 사용하고 build 뒤 `check:landing`을 실행합니다.

## Task 3. Locale-aware guide navigation과 guide home 구성

- Modify: `eleventy.config.js`
- Modify: `landing-src/_data/docsNav.js`
- Modify: `landing-src/_includes/layouts/doc.njk`
- Modify: `landing-src/docs/index.njk`
- Modify: `landing-src/docs/ko/index.njk`
- Modify: `landing-src/style-docs.css`

신규 guide availability를 root/ko로 제한하고 pagination/sidebar에서 missing locale link를 만들지
않습니다. Guide home에 quickstart command와 category별 entry를 제공합니다.

## Task 4. Public guide content 추가

- Create: `landing-src/docs/agent-quickstart.md`
- Create: `landing-src/docs/ko/agent-quickstart.md`
- Create: `landing-src/docs/linux-service.md`
- Create: `landing-src/docs/ko/linux-service.md`
- Create: `landing-src/docs/project-governance.md`
- Create: `landing-src/docs/ko/project-governance.md`

Canonical docs를 요약해 prerequisite, command, created state, consent, backup/restart/rollback과 next
action을 설명합니다.

## Task 5. Landing과 maintainer guide 현행화

- Modify: `landing-src/index.njk`
- Modify: `landing-src/ko.njk`
- Create: `docs/GITHUB-PAGES.md`
- Modify: `docs/README.md`
- Modify: `docs/PROJECT-DESIGN.md`
- Modify: `docs/TESTING.md`

Windows-primary/legacy Linux copy를 current Linux single-engine 기준으로 바꾸고 maintainer
authoring/deploy/rollback guide를 문서 맵에 연결합니다.

## Task 6. 검증과 handoff

- Run focused unit test
- Run `corepack pnpm build:landing`
- Run `corepack pnpm check:landing`
- Run `corepack pnpm check:project-design`
- Run `git diff --check`
- Create code review와 operations handoff

Commit/push/PR/Pages deploy/issue 변경은 별도 명시 요청 전 수행하지 않습니다.
