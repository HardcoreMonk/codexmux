# Public Site opencodex Renewal Implementation Plan

- 날짜: 2026-08-24
- Spec: `docs/superpowers/specs/2026-08-24-public-site-opencodex-renewal-design.md`
- Domain review: `docs/superpowers/reviews/2026-08-24-public-site-opencodex-renewal-domain-architecture.md`
- Design review: `docs/superpowers/reviews/2026-08-24-public-site-opencodex-renewal-design-review.md`

## Task 1. Artifact contract를 TDD로 확장

- Modify: `tests/unit/scripts/landing-site-check.test.ts`
- Modify: `scripts/check-landing-site.mjs`

Generated home/docs에 theme init/control, site shell, search, mobile menu, primary product term과 hero
asset이 존재하는지 검사한다. Broken Pages link와 stale purplemux image reference는 계속 거부한다.

## Task 2. Original hero asset 추가

- Create: `landing-src/images/hero-engine.png`
- Create: `landing-src/images/hero-engine.webp`

Imagegen output을 project asset으로 복사하고 WebP를 생성한다. Text/logo/watermark 부재와 crop을
desktop/mobile에서 확인한다.

## Task 3. Shared theme와 site shell 구현

- Create: `landing-src/_includes/chrome/site-header.njk`
- Create: `landing-src/_includes/chrome/search-overlay.njk`
- Create: `landing-src/site-shell.js`
- Modify: `landing-src/_includes/layouts/base.njk`
- Modify: `landing-src/_includes/layouts/doc.njk`
- Modify: `landing-src/_data/site.js`

Pre-paint theme resolution, floating header, grouped navigation, theme cycle, search, locale와 mobile
menu를 home/docs에 공통 적용한다.

## Task 4. Homepage scene 재구성

- Modify: `landing-src/_data/landingProduct.js`
- Modify: `landing-src/_includes/landing/product-home.njk`
- Modify: `landing-src/style.css`

Hero, quickstart, code-native product proof, capability bento와 docs map을 EN/KO shared structure로
구현한다. Existing Swiper dependency와 stale product sections는 제거한다.

## Task 5. Docs visual shell 정렬

- Modify: `landing-src/style-docs.css`
- Modify: `landing-src/docs.js`

Existing sidebar, TOC, search, code copy와 mobile drawer contract를 유지하면서 floating header,
light/dark token, spacing과 control behavior를 새 shell에 맞춘다.

## Task 6. Canonical design/docs 최신화

- Modify: `DESIGN.md`
- Modify: `docs/STYLE.md`
- Modify: `docs/GITHUB-PAGES.md`
- Modify: `docs/PROJECT-DESIGN.md`
- Modify: `docs/README.md`

Reference-derived grammar, theme behavior, asset policy, validation과 rollback 경계를 기록한다.

## Task 7. Verification and review

- Run landing contract unit tests
- Run `corepack pnpm build:landing`
- Run `corepack pnpm check:landing`
- Run `corepack pnpm check:project-design`
- Run full unit suite
- Inspect desktop/mobile, light/dark home and docs screenshots
- Check keyboard, search, menu, theme persistence, overflow and console errors
- Run `git diff --check`
- Record code review and release/operate handoff

Commit, push, Pages deploy와 Linux service restart는 별도 명시 요청 전 수행하지 않는다.
