# GitHub Pages 공개 가이드 Domain Architecture Review

- 날짜: 2026-08-21
- 결과: 통과

## 기준 도메인 용어

| 용어 | 의미 |
| --- | --- |
| Public Guide Site | GitHub Pages에서 제공하는 비인증 공개 landing/docs surface |
| Guide Entry | sidebar/search/pagination에 참여하는 한 public guide 문서 |
| Guide Navigation | category, label, locale availability를 가진 navigation read model |
| Pages Artifact | Eleventy가 `_site/`에 생성한 immutable deploy input |
| Canonical URL | search/social metadata가 가리키는 GitHub Pages public URL |
| Legacy Locale Snapshot | canonical 제품 계약이 아닌 보존된 과거 locale guide |

## 거부 용어

- Public Guide Site를 `Product Dashboard` 또는 `Runtime UI`로 부르지 않습니다.
- `landing-src/docs/`를 canonical architecture source-of-truth로 부르지 않습니다.
- Windows installer를 current primary runtime으로 부르지 않습니다.
- `_site/`를 hand-edited source directory로 취급하지 않습니다.

## Bounded context와 module

| 경계 | 책임 | Source |
| --- | --- | --- |
| Public Documentation | guide content, navigation, search metadata | `landing-src/` |
| Pages Delivery | build, artifact validation, Pages deploy | `eleventy.config.js`, workflow, scripts |
| Canonical Product Docs | runtime/security/storage 사실의 authority | root `CONTEXT.md`, `docs/` |

Public Documentation은 Canonical Product Docs를 요약해 소비할 뿐 runtime behavior를 정의하지
않습니다. Pages Delivery는 app build/live service와 독립입니다.

## Aggregate/entity/value-object 후보

- Aggregate 후보: `PagesArtifact` — 한 build output과 검증 결과
- Entity 후보: `GuideEntry` — slug와 locale availability로 식별
- Value object 후보: `CanonicalUrl`, `GuideLink`, `LocaleAvailability`

별도 runtime domain class를 만들 필요는 없습니다. Source JS data와 build checker의 순수 함수로
표현합니다.

## Folder와 signature 영향

- `landing-src/_data/docsNav.js`: item에 optional `locales` field 추가
- `eleventy.config.js`: locale-aware neighbor/filter
- `scripts/landing-site-check-lib.mjs`: artifact path와 HTML 검사 순수 함수
- `scripts/check-landing-site.mjs`: `_site` adapter
- `.github/workflows/deploy-landing.yml`: build 뒤 checker 실행

App public API, Next.js route, Runtime IPC와 storage schema 영향은 없습니다.

## Adapter/infrastructure 경계

Eleventy는 content renderer, GitHub Actions는 delivery adapter, GitHub Pages는 static hosting
infrastructure입니다. 새 hosted backend, custom domain, credential 또는 runtime dependency를
추가하지 않습니다.

## ADR 후보

없습니다. GitHub Pages/Eleventy 경계는 이미 존재하며 이번 변경은 canonical URL 교정, guide
정보 구조와 validation 보강입니다.
