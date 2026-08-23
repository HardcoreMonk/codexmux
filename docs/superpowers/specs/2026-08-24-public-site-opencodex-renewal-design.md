# Public Site opencodex Renewal

- 날짜: 2026-08-24
- 상태: Verified
- Lifecycle stage: `operate`
- 기준 사이트: `https://opencodex.me/` 2026-08-24 snapshot

## 문제

현재 codexmux 공개 사이트는 제품 기능과 문서 계약은 정확하지만 homepage와 docs가 서로 다른
시각 shell을 사용한다. Homepage는 긴 제품 설명을 순서대로 나열하고 docs는 별도 고정 header를
사용해, 설치에서 실제 세션 운영·거버넌스 문서로 이어지는 흐름이 한 제품처럼 느껴지지 않는다.

사용자는 공개 사이트를 `opencodex.me`와 동일한 구성으로 리뉴얼하는 범위를 승인했다. 기준
사이트의 현재 구현은 floating glass header, theme·locale·search preference, scene-based hero,
quickstart terminal, product proof, bento feature grid와 docs map을 하나의 shell로 결합한다.

## 목표

- Homepage와 모든 docs locale snapshot에 같은 floating shell을 사용한다.
- Auto, light, dark theme를 지원하고 첫 paint 전에 theme를 결정한다.
- Desktop dropdown navigation, mobile menu, global docs search, GitHub와 locale 전환을 제공한다.
- Homepage를 hero scene, quickstart, product proof, bento capabilities, docs map 순서로 재구성한다.
- codexmux의 Workspace, Sessions, Governance와 Linux Runtime 경계를 첫 viewport에서 식별시킨다.
- 기존 11개 docs locale URL, canonical, search index, 404와 local link 계약을 보존한다.
- 실제 구현 상태와 public npm `0.4.23`, source/live `0.4.24`의 배포면을 혼동하지 않는다.

## Non-goals

- Astro/Starlight migration 또는 Eleventy content model 교체
- app runtime, API, worker, authentication, service나 data directory 변경
- `opencodex.me`의 문구, source component, logo, screenshot 또는 hero asset 복사
- stale purplemux screenshot 재사용
- legacy locale snapshot 전체 번역
- analytics provider, hosted search backend 또는 runtime dependency 추가
- commit, push, Pages deploy 또는 Linux service restart

## Reference-derived Design Grammar

MIT 공개 구현은 구조적 비교에만 사용한다. 최종 코드는 기존 Eleventy/Nunjucks 경계 안에서
codexmux용으로 작성한다.

| 기준 패턴 | codexmux 적용 |
| --- | --- |
| Floating pill header | Home/docs 공통 shell, blur와 neutral surface |
| Theme cycle | Auto → Light → Dark, system preference와 localStorage |
| Grouped desktop navigation | 시작하기, 세션 운영, 거버넌스, Reference |
| Mobile compact header | Search와 menu를 44px target으로 제공 |
| Image-led hero scene | 원본 codexmux engine convergence artwork와 독자 copy |
| Quickstart terminal | `npx --yes codexmux@latest`, browser open, service guide |
| Product media stage | 실제 App Area를 반영한 code-native preview |
| Bento capability slab | Workspace, Sessions, Governance, Runtime와 guarded boundary |
| Docs map | 기존 docsNav의 주요 진입점을 짧은 그룹으로 노출 |

## Information Architecture

```text
Public shell
├─ Floating header
│  ├─ Product navigation
│  ├─ Search
│  ├─ GitHub
│  ├─ Theme
│  └─ Locale
├─ Home
│  ├─ Hero / primary claim
│  ├─ Quickstart
│  ├─ Product proof
│  ├─ Capability bento
│  └─ Docs map
└─ Docs
   ├─ Sidebar
   ├─ Article
   ├─ On this page
   ├─ Search dialog
   └─ Previous / next
```

## Homepage Contract

### Hero

- Primary claim은 “One Linux engine for every Codex session” 계열로 유지한다.
- Workspace, Sessions, Governance, Runtime을 chip으로 노출한다.
- 생성된 원본 hero artwork는 장식 이미지이며 headline contrast를 보장하는 overlay 아래에 둔다.
- CTA는 quickstart와 GitHub 두 개만 제공한다.

### Quickstart

- 설치, 실행, browser open의 세 단계만 첫 카드에 표시한다.
- Public npm `latest`가 `0.4.23`임을 명시하고 source/live version과 분리한다.
- copy button은 keyboard와 screen reader에서 상태를 알 수 있어야 한다.

### Product proof

- stale raster screenshot 대신 현재 App Area와 entity selection을 반영한 code-native frame을 쓴다.
- Workspace, Sessions, Governance current state를 label과 surface로 구분한다.
- live data처럼 보이는 민감한 path, token, session content는 사용하지 않는다.

### Bento and docs map

- capability card는 implemented surface와 guarded action을 구분한다.
- 색상만으로 status를 표현하지 않는다.
- docs map은 모든 guide를 복제하지 않고 주요 운영 경로로 연결한다.

## Docs Shell Contract

- Home과 같은 brand, surface, theme, search, GitHub, locale control을 사용한다.
- Desktop에서는 sidebar와 TOC를 유지하고 mobile에서는 drawer와 breadcrumb를 유지한다.
- Search는 기존 generated JSON index와 Fuse.js를 사용하며 새 backend를 추가하지 않는다.
- Legacy locale는 기존 한국어 snapshot 정책과 URL을 유지한다.
- Code block, table, callout, pagination과 heading anchor 동작은 변경하지 않는다.

## Theme and Interaction

- `data-theme=light|dark`를 document root에 설정한다.
- 저장값이 없으면 `prefers-color-scheme`을 따른다.
- theme control은 Auto → Light → Dark 순환이며 현재 상태를 text와 `aria-label`로 노출한다.
- dropdown/menu/dialog는 Escape와 outside click으로 닫히며 focus-visible을 유지한다.
- mobile interactive target은 최소 44px를 목표로 한다.
- motion은 opacity/transform 중심이며 `prefers-reduced-motion`에서 제거한다.

## Domain Architecture

- 제품 도메인에 새 runtime term을 추가하지 않는다.
- Public site는 projection surface이며 Workspace, Sessions, Governance, Runtime authority를 소유하지 않는다.
- `landing-src/_data/`는 public copy/navigation, Nunjucks layout은 structure, CSS/JS는 presentation과
  progressive enhancement를 소유한다.
- Eleventy, Pages prefix `/codexmux`, canonical base와 docsNav가 배포 계약의 authority다.
- 장기 architecture decision을 바꾸지 않으므로 신규 ADR은 필요하지 않다.

## Security, Privacy and Performance

- 새 analytics, cookie, remote API와 inline secret을 추가하지 않는다.
- generated artwork와 product preview에 사용자 데이터·filesystem path를 포함하지 않는다.
- hero는 WebP 우선과 PNG fallback을 제공하고 eager load는 hero 한 장으로 제한한다.
- 외부 font와 현재 analytics 정책은 이번 변경에서 유지한다.
- JS가 실패해도 link, docs content, theme 기본값과 mobile navigation이 읽을 수 있어야 한다.

## Acceptance Criteria

- English와 Korean homepage가 동일한 section contract를 가진다.
- Home/docs 모두 theme, search, GitHub, locale, mobile menu control을 제공한다.
- Desktop 1440×900, mobile 412×915에서 horizontal overflow가 없다.
- Light/dark screenshot에서 text contrast와 current/focus state가 식별된다.
- 11개 docs locale URL, canonical, search index와 local link가 유지된다.
- Hero asset에 text, logo, third-party brand와 watermark가 없다.
- `build:landing`, `check:landing`, project design check와 관련 unit/full test가 통과한다.

## Rollback

Landing source, generated asset와 lifecycle artifact만 직전 commit으로 되돌린다. `_site/`는
commit하지 않고 workflow가 이전 artifact를 재생성한다. Linux runtime/service와 app DB는 rollback
대상이 아니다.

## Spec Freeze Snapshot

- Scope: homepage + docs shell 전체
- Framework: Eleventy 유지
- Reference use: structure/interaction grammar only, no copied content/assets/code
- Theme: Auto/Light/Dark, pre-paint resolution
- Home: hero, quickstart, product proof, bento, docs map
- Docs: existing sidebar/TOC/search/content contract preserved
- Locale: EN/KO product home, 11 docs snapshot URL preserved
- Runtime impact: none
- ADR candidate: none

## Implementation Verification

2026-08-24 release는 shared shell, EN/KO home, 11개 docs snapshot URL과 original hero/OG asset을
구현했습니다. Eleventy 361 HTML build, 23,548 local link, full unit 1,690 tests, TypeScript, lint와
project design gate를 통과했습니다. Chromium desktop/mobile Light/Dark matrix는 horizontal
overflow와 page error 0건이었고 theme persistence, search, menu, docs drawer와 active selection을
확인했습니다.

구현 commit `e6c17edd`, main merge `b73637bf`와 mobile search focus hotfix `b0bfed43`을 push했습니다.
GitHub Pages run `32655553787`, `32656043852`가 모두 성공했고 final HTTPS smoke에서 여섯 core URL,
hero/OG/script asset, mobile menu→search handoff, focus restore와 docs selection을 확인해 `operate`에
진입했습니다.
