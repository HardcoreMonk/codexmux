# Public Site opencodex Renewal 운영 handoff

## 범위

- 일자: 2026-08-24 KST
- Lifecycle: `intake -> writing-spec -> domain-architecture -> grill-me -> plan-design-review -> writing-plans -> plan-eng-review -> implement -> code-review -> release -> operate`
- 대상: GitHub Pages English/Korean homepage와 모든 docs locale의 공통 public shell
- Reference: `https://opencodex.me/`의 구조·interaction grammar
- Release 경계: commit, main merge, GitHub Pages deploy와 final live smoke 완료
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
| Source | feature `e6c17edd`, main merge `b73637bf`, focus hotfix `b0bfed43` |
| Pages initial | [run 32655553787](https://github.com/HardcoreMonk/codexmux/actions/runs/32655553787), success |
| Pages final | [run 32656043852](https://github.com/HardcoreMonk/codexmux/actions/runs/32656043852), success |
| Live HTTP | Home/KO/docs/KO docs/EN·KO Session Operations 6 URL HTTP 200 |
| Live assets | `site-shell.js` 4,339 B, hero WebP 82,266 B, OG PNG 531,778 B, 모두 HTTP 200 |
| Live browser | desktop/mobile overflow 0, hero load, theme persistence, search 5 results, docs active 1, page error 0 |

## Asset provenance

- `hero-engine.png`, `hero-engine.webp`는 built-in image generation으로 만든 codexmux original
  stylized concept입니다. Reference artwork, code, logo와 screenshot을 복제하지 않았습니다.
- `og-image.png`는 local release candidate homepage를 Chromium 1200×630으로 렌더한 정적 preview입니다.
- Generated hero asset에는 text/logo/watermark, 사용자 path, token과 실제 session content가
  없습니다. OG preview의 brand와 headline은 homepage HTML render에서만 생성됩니다.

## Release와 operate 경계

사용자 승인 뒤 feature commit `e6c17edd`를 원격 branch에 push하고 main merge `b73637bf`를
배포했습니다. 첫 live smoke에서 mobile site menu가 열린 상태로 search를 실행하면 `Esc` 뒤 focus가
menu button으로 이동하는 경계를 발견했습니다. Search open이 site menu를 먼저 닫도록 hotfix
`b0bfed43`을 배포한 뒤 다음 URL을 2026-08-24 02:50 KST에 다시 확인했습니다.

- `/codexmux/`, `/codexmux/ko/`
- `/codexmux/docs/`, `/codexmux/ko/docs/`
- `/codexmux/docs/session-operations/`, `/codexmux/ko/docs/session-operations/`
- canonical, hero/OG/style/script load, theme persistence, search, mobile menu와 404

Final smoke는 menu→search 전환, search result 5개, `Esc` focus restore, Auto→Light→Dark persistence,
docs drawer와 `aria-current` 1개, horizontal overflow와 page error 0건을 확인했습니다. GitHub Pages는
deployed commit `b0bfed43`으로 `operate`에 진입했습니다. Linux user service는 재시작하지 않았습니다.

## Rollback

문제가 생기면 Pages source 변경만 직전 deployed commit으로 되돌리고 workflow로 `_site/`를 다시
생성합니다. `_site/`는 commit하지 않습니다. Linux `codexmux.service`, Runtime v2 state, tmux와
app DB는 rollback 대상이 아니며 공개 사이트 배포 때문에 restart하지 않습니다.
