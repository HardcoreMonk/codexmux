# Public Site opencodex Renewal Code Review

- 날짜: 2026-08-24
- 결과: Verified
- 기준: deployed commit `b0bfed43`
- Graph review: `.ua/knowledge-graph.json` 부재로 수동 diff/source review 수행

## Changed Components

- `base.njk`, `doc.njk`, `chrome/`: home/docs 공통 header, locale, search와 theme shell
- `site-shell.js`, `docs.js`: theme persistence, disclosure, mobile menu, search focus와 docs drawer
- `landingProduct.js`, `product-home.njk`: EN/KO hero, quickstart, product proof, bento와 docs map
- `style.css`, `style-docs.css`: public shell, Light/Dark token, responsive home/docs presentation
- `hero-engine.*`, `og-image.png`: original hero와 현재 homepage 기반 share preview
- landing checker/unit: generated artifact, shared hook, stale dependency/content와 local link gate
- canonical docs/lifecycle artifacts: 공개 site 계약, verification, release boundary

## Findings Resolved

| 심각도 | Finding | 해결 |
| --- | --- | --- |
| Medium | de/es 등 legacy docs shell이 한국어 navigation label을 사용함 | URL locale과 label fallback을 분리하고 non-KO shell은 English label로 검증 |
| Medium | `og-image.png`가 이전 homepage를 표시함 | 새 1200×630 homepage render로 교체 |
| Low | Mobile global menu와 docs drawer가 같은 hamburger icon을 사용함 | docs drawer를 book icon과 locale label로 구분 |
| Low | Search close 뒤 keyboard focus가 사라짐 | trigger 보존, `aria-expanded`, focus restore 적용 |
| Medium | Live mobile에서 열린 site menu와 search가 `Esc`를 함께 소비해 menu button으로 focus 이동 | Search open 시 menu를 먼저 닫는 event contract와 trigger 고정 후 재배포·live 검증 |
| Low | Linux quickstart에 macOS `open` command와 stale test count가 노출됨 | `xdg-open`과 정성적 check status로 교정 |
| Low | 교체된 `.doc-nav*` style이 남아 있음 | 사용되지 않는 legacy nav CSS 제거 |

## Affected Components and Layers

- Public projection layer만 변경합니다. App runtime, API, worker, auth, tmux, service와 durable data는
  영향받지 않습니다.
- Eleventy build output과 GitHub Pages deployment artifact가 직접 영향 범위입니다.
- Existing docsNav, search index, canonical base와 11개 locale path가 upstream contract이고,
  layout/header가 이를 소비합니다.
- Browser localStorage에는 새 `codexmux-site-theme` preference만 추가됩니다. Cookie, token과
  server state는 변경하지 않습니다.

## Risk Assessment

위험도는 Low–Medium입니다. 변경 line 수는 크지만 정적 projection에 격리돼 있고, generated
artifact 전체 local link 검사가 URL blast radius를 닫습니다. 가장 큰 회귀 가능성은 locale path,
responsive header와 theme token이며 artifact contract와 Chromium matrix로 검증했습니다.

Blocking finding은 없습니다. Pages run `32656043852`와 final live mobile/desktop smoke까지 통과해
operate 증거를 확보했습니다.
