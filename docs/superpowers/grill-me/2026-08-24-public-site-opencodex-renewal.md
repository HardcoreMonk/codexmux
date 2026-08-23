# Public Site opencodex Renewal Grill-me

- 날짜: 2026-08-24
- 결과: Approved
- 방식: docs-aware review

## Questions and Decisions

### 1. “동일하게”를 literal clone으로 볼 것인가

- 추천: 구조·interaction parity를 만들고 codexmux copy, asset과 component code를 사용한다.
- 결정: 추천안 채택. 타사 brand와 시각 자산은 복제하지 않는다.

### 2. Astro/Starlight로 migration할 것인가

- 추천: Eleventy를 유지하고 동일 UX를 현재 build contract 안에서 구현한다.
- 결정: 추천안 채택. 364-page/11-locale artifact와 Pages workflow를 보존한다.

### 3. Homepage만 바꿀 것인가

- 추천: Homepage와 docs shell을 함께 바꿔 theme/header/search/locale 경험을 통일한다.
- 결정: 추천안 채택. 문서 본문과 URL은 유지한다.

### 4. Reference의 scroll scene을 그대로 재현할 것인가

- 추천: sticky depth와 scene rhythm은 사용하되 과도한 빈 scroll 구간과 experimental
  scroll-timeline dependency는 피한다.
- 결정: 추천안 채택. reduced-motion fallback을 필수로 둔다.

### 5. 제품 증거에 기존 screenshot을 사용할 것인가

- 추천: purplemux brand가 남은 raster는 사용하지 않고 현재 navigation contract를 반영한
  code-native preview를 쓴다.
- 결정: 추천안 채택. Hero만 새 original artwork를 사용한다.

### 6. Theme default는 무엇인가

- 추천: system preference를 따르는 Auto를 기본으로 하고 Light/Dark를 명시 선택할 수 있게 한다.
- 결정: 추천안 채택. 저장값과 accessible label을 유지한다.

### 7. Locale 범위를 넓힐 것인가

- 추천: EN/KO product home과 기존 11개 docs snapshot URL을 보존하고 번역 범위는 확대하지 않는다.
- 결정: 추천안 채택.

열린 설계 질문과 blocker는 없다.
