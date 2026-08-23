# Public Site opencodex Renewal Engineering Review

- 날짜: 2026-08-24
- 결과: Approved
- Plan: `docs/superpowers/plans/2026-08-24-public-site-opencodex-renewal.md`

## Review

- Eleventy와 existing docsNav/search index를 유지해 migration risk를 제거한다.
- Shared Nunjucks partial은 home/docs chrome drift를 줄이고 URL prefix를 server-rendered link로
  유지한다.
- Theme init은 head에서 먼저 실행해 flash를 줄이고 main JS failure와 독립시킨다.
- Site shell JS는 progressive enhancement만 담당하며 docs content와 navigation link는 JS 없이
  남는다.
- Hero PNG/WebP는 repository-owned static asset이고 remote runtime dependency를 만들지 않는다.
- Product proof를 code-native로 유지해 stale screenshot과 개인정보 위험을 제거한다.
- Generated artifact checker가 source template이 아니라 deploy output을 검증한다.

## Risks and Mitigations

| 위험 | 대응 |
| --- | --- |
| Shared header가 11 locale URL을 깨뜨림 | existing locale filter와 generated local-link check 유지 |
| Light theme에서 legacy docs contrast 저하 | token override와 screenshot/contrast inspection |
| Mobile control overlap | 800px/520px breakpoint와 44px search/menu priority |
| Hero LCP 증가 | WebP 우선, fixed aspect ratio, eager hero 한 장 |
| JS menu focus/escape 회귀 | accessible attributes, unit/static contract와 Playwright interaction |
| CSS legacy collision | 새 `.site-*`, `.ocx-*` namespace와 docs override 분리 |

## Execution Environment Constraints

- GitHub Pages project prefix `/codexmux`
- GitHub Actions Node 20 setup with current runner forcing compatible Node runtime for actions
- Eleventy 3.1.5, pnpm lockfile, static asset deployment
- Modern evergreen desktop/mobile browsers; graceful fallback without scroll-timeline
- No Linux app service restart required

Blocker는 없다.
