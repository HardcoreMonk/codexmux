# Public Site opencodex Renewal 운영 handoff

## 범위

- 일자: 2026-08-24 KST
- Lifecycle: `intake -> writing-spec -> domain-architecture -> grill-me -> plan-design-review -> writing-plans -> plan-eng-review -> implement -> code-review -> release`
- 대상: GitHub Pages English/Korean homepage와 모든 docs locale의 공통 public shell
- Reference: `https://opencodex.me/`의 구조·interaction grammar
- Release 경계: local release candidate와 검증 완료
- 보류: commit, push, GitHub Pages deploy와 live smoke
- 제외: Linux user service restart, app runtime/API/worker/auth/data 변경

## 구현 결과

- Homepage와 docs가 floating header, grouped navigation, search, GitHub, locale와
  Auto/Light/Dark theme를 공유합니다.
- Homepage는 original hero, Linux quickstart, code-native product proof, capability bento와 docs
  map 순서로 재구성했습니다.
- Workspace, Sessions, Governance, Runtime, selected entity와 worker status가 독립 label/surface로
  식별됩니다.
- Mobile은 44px search/menu target, 별도 docs drawer icon과 breadcrumb를 사용합니다.
- Search dialog는 generated index를 유지하면서 `aria-expanded`, `Esc`와 trigger focus restore를
  제공합니다.
- 11개 docs locale URL을 유지하고 non-KO legacy shell label은 English fallback을 사용합니다.
- Swiper dependency와 stale screenshot/claim을 제거하고 original WebP/PNG hero 및 새 OG preview를
  사용합니다.

## 검증 evidence

| Gate | 결과 |
| --- | --- |
| Landing build | Eleventy 3.1.5, 361 HTML / 402 files generated |
| Artifact contract | 23,548 local links, 7 content contracts passed |
| Focused unit | 1 file, 7 tests passed |
| Full unit | 270 files passed, 1 skipped; 1,690 tests passed, 3 skipped |
| TypeScript | `corepack pnpm tsc --noEmit` passed |
| Lint | 0 errors, unrelated existing Next navigation warnings 6개 |
| Project design | passed |
| JavaScript syntax | `docs.js`, `site-shell.js` passed |
| Browser matrix | desktop/mobile × Light/Dark home/docs, overflow 0, page errors 0 |
| Interaction | mobile menu, theme persistence, search result/escape/focus, docs drawer/active item passed |
| Legacy locale | de home 기존 nav 보존, de docs English shell fallback, overflow 0 |
| Diff hygiene | `git diff --check` passed |

## Asset provenance

- `hero-engine.png`, `hero-engine.webp`는 built-in image generation으로 만든 codexmux original
  stylized concept입니다. Reference artwork, code, logo와 screenshot을 복제하지 않았습니다.
- `og-image.png`는 local release candidate homepage를 Chromium 1200×630으로 렌더한 정적 preview입니다.
- Generated hero asset에는 text/logo/watermark, 사용자 path, token과 실제 session content가
  없습니다. OG preview의 brand와 headline은 homepage HTML render에서만 생성됩니다.

## Release와 operate 경계

현재 branch는 `codex/public-site-opencodex-renewal`이며 working tree에 release candidate가
uncommitted 상태로 있습니다. 사용자의 별도 명시 요청 전에는 commit, push, Pages workflow와
live URL mutation을 수행하지 않습니다. 따라서 lifecycle은 `release`에 있고 `operate`가 아닙니다.

승인 뒤에는 commit/push 후 `Deploy landing to GitHub Pages` workflow 성공을 확인하고 다음 URL을
desktop/mobile로 smoke합니다.

- `/codexmux/`, `/codexmux/ko/`
- `/codexmux/docs/`, `/codexmux/ko/docs/`
- `/codexmux/docs/session-operations/`, `/codexmux/ko/docs/session-operations/`
- canonical, hero/OG/style/script load, theme persistence, search, mobile menu와 404

Live smoke까지 통과하면 이 handoff에 workflow run, deployed commit과 확인 시각을 추가하고
lifecycle을 `operate`로 전환합니다.

## Rollback

문제가 생기면 Pages source 변경만 직전 deployed commit으로 되돌리고 workflow로 `_site/`를 다시
생성합니다. `_site/`는 commit하지 않습니다. Linux `codexmux.service`, Runtime v2 state, tmux와
app DB는 rollback 대상이 아니며 공개 사이트 배포 때문에 restart하지 않습니다.
