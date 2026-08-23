# GitHub Pages 운영 가이드

이 문서는 codexmux 공개 랜딩과 사용자 가이드를 작성하고 GitHub Pages artifact로 검증하는
기준입니다. 공개 기준 URL은 `https://hardcoremonk.github.io/codexmux/`이며 custom domain이나
`CNAME`은 사용하지 않습니다.

## 소스와 산출물 경계

| 경로 | 역할 |
| --- | --- |
| `landing-src/*.njk` | locale별 랜딩과 404, robots, sitemap source |
| `landing-src/docs/` | 공개 사용자 가이드와 root 문서 home |
| `landing-src/docs/ko/` | `/ko/docs/` 경로의 공개 사용자 가이드 |
| `landing-src/_data/` | canonical URL, locale, sidebar 정보 구조 |
| `landing-src/_data/landingProduct.js` | English/Korean 제품 copy와 capability 상태 |
| `landing-src/_includes/` | 공통 product home, 랜딩·문서 layout과 partial |
| `landing-src/style*.css` | 공개 사이트 style |
| `_site/` | Eleventy 생성물; 직접 편집하지 않는 build artifact |
| `.github/workflows/deploy-landing.yml` | `main` 변경을 Pages artifact로 배포하는 workflow |

Canonical 제품·아키텍처·운영 계약은 root `CONTEXT.md`, `DESIGN.md`와 `docs/`가 소유합니다.
공개 가이드는 이를 짧게 설명하는 배포용 surface이며 서로 충돌하면 canonical 문서를 먼저
교정한 뒤 공개 문서를 갱신합니다.

Root landing과 신규 핵심 guide는 English, `/ko/`는 Korean을 제공합니다. 기존 guide 중 한국어
content를 root에도 보존한 문서는 순차 이관 대상이며 English 전체 coverage를 암시하지 않습니다.
그 밖의 9개 locale은 URL 호환성을 위한 legacy snapshot으로만 보존하고 automatic locale
redirect나 current alternate 대상으로 사용하지 않습니다. 신규 guide는 실제 source가 있는
locale만 `landing-src/_data/docsNav.js`의 `locales`로 선언해야 합니다.

## 정보 구조 원칙

첫 방문자가 긴 개념 설명보다 실행 가능한 다음 행동을 먼저 찾도록 구성합니다.

1. 랜딩에서 Linux 단일 엔진의 최소 실행 명령과 설치 가이드를 보여줍니다.
2. 제품 기능은 `Session Operations`, `Live Session Control`, `Project Governance`,
   `Runtime Operations` 순서로 설명합니다.
3. 기능은 `Available now`, `Guarded actions`, `Not in current scope`를 구분해 과장하지 않습니다.
4. 문서 home에서 Session Operations와 Project Governance를 같은 깊이의 핵심 진입점으로 둡니다.
5. 제품 UI 설명에서는 Workspace, Sessions, Governance를 고정 1차 App Area로 쓰고, Workspace 내부
   `Activity`를 Session Catalog route와 구분합니다. Core area는 숨김/reorder 가능한 sidebar shortcut으로
   설명하지 않습니다.
6. 사람용 빠른 시작과 에이전트 빠른 시작을 분리합니다.
7. 설치 문서는 prerequisite, 실행, 생성되는 상태, 다음 행동 순서로 씁니다.
8. 운영 문서는 backup, restart, health, rollback을 같은 문맥에 둡니다.
8. 외부 bind, password, governance write, restart와 data 삭제에는 사용자 승인 경계를 적습니다.

이 구조는 [opencodex.me](https://opencodex.me/)의 짧은 시작 경로와 category 분리 원칙을
참고했습니다. 제품 명령, 설명 문구, visual asset과 source code는 복제하지 않습니다.

## 문서 추가

Public guide frontmatter는 최소한 다음 필드를 가집니다.

```yaml
---
title: 가이드 제목
description: 검색과 문서 home에서 사용할 한 문장 설명.
eyebrow: 운영 가이드
permalink: /docs/example/index.html
---
```

`/ko/docs/` 사본은 한국어 copy와 `/ko/docs/example/index.html` permalink를 사용합니다. 두 source를 만들었다면
`docsNav.js` 항목에 `locales: ['en', 'ko']`를 선언합니다. 존재하지 않는 locale link를 sidebar나
이전/다음 pagination에 노출하지 않습니다.

내부 link와 asset은 Pages subpath를 포함한 `/codexmux/...` 절대 경로를 사용합니다. Canonical과
Open Graph URL은 `landing-src/_data/site.js`의 `baseUrl` 아래여야 합니다. 실제 hostname, IP,
password, token, 사용자 home path와 production log를 example에 넣지 않습니다.

## 로컬 확인

```bash
corepack pnpm build:landing
corepack pnpm check:landing
corepack pnpm dev:landing
```

개발 server는 기본 `http://localhost:8181/codexmux/`에서 확인합니다. `check:landing`은 필수
page와 asset, GitHub Pages canonical, `/codexmux/` 내부 link, path traversal과 핵심 product
term/금지된 stale claim을 fail closed로 검사합니다. `_site/`를 수동 수정해 통과시키지 않습니다.

메인 product preview는 live API를 호출하지 않는 code-native 설명 surface입니다. 실제 기능에
없는 field나 population count를 만들지 않으며, 변경 시 `/sessions`와 `/governance` source와
통합 handoff를 함께 대조합니다. OG image도 현재 product home render를 사용하며 다른 제품명이나
legacy path를 포함하지 않아야 합니다.

Guide navigation/filter 또는 검사기를 바꾸면 focused unit test도 실행합니다.

```bash
corepack pnpm exec vitest run tests/unit/scripts/landing-site-check.test.ts
corepack pnpm check:project-design
git diff --check
```

## 배포

`main`의 `landing-src/**`, Eleventy config, package/check script 또는 Pages workflow 변경은
`Deploy landing to GitHub Pages` workflow를 시작합니다.

```text
landing-src → Eleventy build → _site → artifact check → Pages upload → Pages deploy
```

Workflow가 성공해도 실제 URL에서 다음을 확인해야 배포가 끝납니다.

- `/codexmux/`와 `/codexmux/ko/`의 설치 기준
- `/codexmux/docs/`와 신규 guide
- `/codexmux/docs/session-operations/`와 `/codexmux/ko/docs/session-operations/`
- canonical URL, stylesheet와 image load
- mobile navigation, search와 404

App runtime과 Linux user service는 Pages 배포면과 독립입니다. 공개 문서 배포 때문에
`codexmux.service`를 재시작하지 않습니다.

## 실패와 rollback

Build/check 실패 시 Pages upload 전에 workflow가 중단됩니다. 원인은 source에서 수정하고
`_site/` 생성물을 commit하지 않습니다.

잘못된 내용이 게시되면 Pages source 변경만 직전 검증 상태로 되돌려 `main`에 반영합니다. 다음
workflow가 이전 artifact를 재생성합니다. Custom domain, DNS, live runtime 또는 app DB를 rollback
대상에 포함하지 않습니다.

Rollback 뒤에도 public URL의 landing, docs home, 영향받은 guide와 canonical을 다시 확인합니다.
