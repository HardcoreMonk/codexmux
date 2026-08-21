# GitHub Pages 제품 재설계 구현 계획

- 날짜: 2026-08-21
- Spec: `docs/superpowers/specs/2026-08-21-github-pages-product-redesign-design.md`
- Domain review: `docs/superpowers/reviews/2026-08-21-github-pages-product-redesign-domain-architecture.md`
- Design review: `docs/superpowers/reviews/2026-08-21-github-pages-product-redesign-design-review.md`

## Task 1. Landing content contract를 TDD로 확장

- Modify: `tests/unit/scripts/landing-site-check.test.ts`
- Modify: `scripts/landing-site-check-lib.mjs`
- Modify: `scripts/check-landing-site.mjs`

English/Korean home과 Session Operations guide에 required product term이 존재하고 stale primary
claim과 purplemux screenshot reference가 없음을 artifact에서 검사한다.

## Task 2. 공통 product home 구조 구현

- Create: `landing-src/_data/landingProduct.js`
- Create: `landing-src/_includes/landing/product-home.njk`
- Modify: `landing-src/index.njk`
- Modify: `landing-src/ko.njk`
- Modify: `landing-src/style.css`

두 locale entrypoint의 중복 구조를 공통 include로 모으고 hero, four pillars, operational flow,
capability boundary, architecture, install/docs CTA를 구현한다.

## Task 3. Session Operations guide와 문서 IA 추가

- Create: `landing-src/docs/session-operations.md`
- Create: `landing-src/docs/ko/session-operations.md`
- Modify: `landing-src/_data/docsNav.js`
- Modify: `landing-src/docs/index.njk`
- Modify: `landing-src/docs/ko/index.njk`

검색, replay, pin/tag, saved filter, rebuild와 empty/degraded 경계를 설명하고 Project Governance와
동등한 핵심 card로 노출한다.

## Task 4. Locale와 metadata 정합성 교정

- Modify: `landing-src/_data/site.js`
- Modify: `landing-src/_includes/layouts/base.njk`

current alternate와 automatic redirect를 English/Korean으로 제한하고 footer/product copy를 현재
identity에 맞춘다. Legacy locale page는 URL 보존만 한다.

## Task 5. Canonical 문서 최신화

- Modify: `docs/GITHUB-PAGES.md`
- Modify: `docs/PROJECT-DESIGN.md`
- Modify: `docs/README.md`
- Create: operation handoff

Public product story, authoring rule, validation과 rollback을 기록한다.

## Task 6. 검증과 review

- Run focused landing checker unit test
- Run `corepack pnpm build:landing`
- Run `corepack pnpm check:landing`
- Run `corepack pnpm check:project-design`
- Inspect desktop/mobile generated landing
- Run `git diff --check`
- Record code review와 operation handoff

Commit, push, PR, Pages deploy와 issue 변경은 별도 명시 요청 전 수행하지 않는다.
