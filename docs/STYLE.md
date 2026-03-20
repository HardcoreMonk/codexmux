# 스타일 가이드

사내 시스템에 맞는 차분하고 전문적인 톤을 지향합니다.
Tailwind 기본 팔레트의 높은 채도/명도를 직접 사용하지 않고, Muted 팔레트를 통해 일관된 색감을 유지합니다.

## 디자인 원칙

- **Muted Palette**: 채도를 낮춰 "AI가 만든 티"를 줄이고, 엔터프라이즈 SaaS 느낌을 지향
- **Tailwind 기본 색상 직접 사용 금지**: `text-blue-600`, `bg-green-100` 같은 Tailwind 기본 팔레트 대신 `text-ui-blue`, `bg-ui-teal/20` 등 커스텀 muted 토큰 사용
- **절제된 타이포그래피**: 숫자/지표는 `text-2xl font-semibold` (과도한 `text-3xl font-bold` 지양)
- **폰트 크기는 Tailwind 유틸리티 사용**: `font-size: 14px` 같은 직접 px 지정 대신 `text-sm`, `text-base` 등 Tailwind 클래스 사용
- **shadcn/ui 컴포넌트 우선**: `<button>`, `<input>`, `<table>` 등 HTML 네이티브 요소 대신 shadcn/ui의 `Button`, `Input`, `Table` 등 사용

---

## 테마 구성

### Base: Neutral

shadcn base color로 Neutral을 사용합니다. 완전한 무채색(chroma 0)으로 깔끔하고 중립적입니다.

- chroma: 0 (순수 무채색)
- Primary: 짙은 Neutral (라이트) / 밝은 Neutral (다크) — 튀지 않는 무채색

### Radius: 0.5rem (8px)

엔터프라이즈 SaaS에 적합한 단정한 모서리. 너무 둥글지(캐주얼) 않고 너무 각지지(딱딱) 않은 균형.

---

## Muted 팔레트

9가지 컬러 + 3가지 시맨틱 alias로 구성됩니다. 라이트/다크 모드별 값이 다릅니다.

### 컬러 토큰

| 토큰           | 용도                 | Light (oklch)       | Dark (oklch)        |
| -------------- | -------------------- | ------------------- | ------------------- |
| `ui-blue`   | 정보, 링크, 프로젝트 | `0.596 0.068 243.5` | `0.69 0.056 243.5`  |
| `ui-teal`   | 성공, 완료, 긍정     | `0.589 0.071 171.9` | `0.69 0.07 171.5`   |
| `ui-coral`  | 따뜻한 강조          | `0.624 0.079 44`    | `0.711 0.071 43.9`  |
| `ui-amber`  | 경고, 주의, 금액     | `0.606 0.086 82.8`  | `0.715 0.081 78`    |
| `ui-purple` | AX 지수, 분석        | `0.608 0.065 287.5` | `0.71 0.051 289`    |
| `ui-pink`   | 이미지, 크리에이티브 | `0.601 0.081 358.3` | `0.704 0.069 359.6` |
| `ui-green`  | 자연, 환경           | `0.594 0.093 131.6` | `0.694 0.087 130.6` |
| `ui-gray`   | 비활성, 보조         | `0.619 0.012 100.9` | `0.708 0.01 100.1`  |
| `ui-red`    | 에러, 삭제, 위험     | `0.592 0.101 20.5`  | `0.703 0.085 19.4`  |

### 시맨틱 alias

| 토큰           | 참조         | 용도             |
| -------------- | ------------ | ---------------- |
| `positive`     | `ui-teal` | 성공, 증가, 활성 |
| `negative`     | `ui-red`  | 에러, 감소, 실패 |
| `accent-color` | `ui-blue` | 강조, 정보, 링크 |

### 채도 범위

- **Light**: Lightness 0.59~0.62, Chroma 0.065~0.101
- **Dark**: Lightness 0.69~0.72, Chroma 0.051~0.087
- Light → Dark: 명도 +0.1, 채도 약간 낮춤

---

## 차트 컬러

`--chart-1` ~ `--chart-9`가 muted 팔레트를 참조합니다.

| chart 변수  | 참조           |
| ----------- | -------------- |
| `--chart-1` | `ui-blue`   |
| `--chart-2` | `ui-teal`   |
| `--chart-3` | `ui-coral`  |
| `--chart-4` | `ui-amber`  |
| `--chart-5` | `ui-purple` |
| `--chart-6` | `ui-pink`   |
| `--chart-7` | `ui-green`  |
| `--chart-8` | `ui-gray`   |
| `--chart-9` | `ui-red`    |

### 색상 선택 지침

- **색은 의미를 인코딩해야 한다**: chart-1부터 순서대로 쓰지 않는다. 데이터의 의미에 맞는 색을 직접 선택한다.
- **한 차트에 색은 2~3개가 이상적**: 범주형 데이터일 때만 다색 사용을 허용한다.
- **UI 관습 색상에 주의**: blue(정보), teal/green(성공), red(위험), amber(경고)는 이미 의미가 있으므로, 그 의미와 맞지 않는 범주형 데이터에는 `purple`, `coral`, `pink`, `gray`를 우선 사용한다.

```
// 비용 vs 이익 → 의미에 맞는 색 선택
API 비용: ui-red (비용=부정)    // ✅
순이익: ui-teal (이익=긍정)     // ✅

// 범주형 카테고리 (의미 없는 구분) → 관습 색 피하기
프로젝트: ui-blue     // ⚠️ 정보 의미와 겹칠 수 있음
라이브러리: ui-purple // ✅ 중립적
AI 레시피: ui-coral   // ✅ 중립적
앱: ui-pink           // ✅ 중립적
```

recharts 등 SVG 기반 차트에서는 CSS 변수를 직접 사용합니다:

```tsx
<Bar fill="var(--ui-teal)" />
<Area stroke="var(--ui-purple)" />
<linearGradient>
  <stop stopColor="var(--ui-blue)" />
</linearGradient>
```

---

## 장식 요소 최소화

> "Flat, clean, white surfaces. No gradients, drop shadows, blur, glow, or neon effects."
>
> 덜어내는 것이 원칙, 더하는 건 기능적 이유가 있을 때만.

### 핵심 철학

섀도우나 굵은 border로 계층을 표현하지 않는다. 대신 **여백(whitespace)**과 **배경색 차이**로 계층을 만든다.

### Border 규칙

모든 border는 0.5px + 낮은 투명도가 기본.

| 용도               | 스펙                                   |
| ------------------ | -------------------------------------- |
| 기본 (default)     | `0.5px solid` — 약 15% 불투명도        |
| 호버/강조          | `0.5px solid` — 약 30% 불투명도        |
| 강한 구분선        | `0.5px solid` — 약 40% 불투명도        |
| 추천/Featured 카드 | `2px solid` — 유일한 예외, 의도적 강조 |

### 금지 장식

- **Gradient** — 배경, 버튼, 카드 전부 금지. flat fill만 사용
- **Blur / Backdrop-filter** — 금지
- **Glow / Neon** — 금지
- **Drop shadow** — 금지. 여백과 배경색으로 계층 표현
- **Rounded corner 남용** — `border-radius`는 전체 border가 있을 때만. `border-left` 같은 한쪽 accent에는 `border-radius: 0` 필수

### 그리드/테이블

- 그리드 라인은 **수평만**, 얇고 연하게
- 불필요한 hover 하이라이트 절제
- 애니메이션 최소화 — 기능적 피드백(로딩, 전환)에만 사용

### 아이콘

- 이모지 사용 지양, **lucide-react 아이콘** 사용
- 아이콘 장식 배경 최소화 (필요하면 `/20` opacity 정도)

---

## 금지 패턴

```tsx
// Tailwind 기본 팔레트 직접 사용 금지
bg-blue-100 text-blue-600    // ❌
bg-green-100 text-green-700  // ❌
text-red-500                 // ❌
fill="#3b82f6"               // ❌

// 대신 muted 팔레트 사용
bg-ui-blue/20 text-ui-blue   // ✅
bg-ui-teal/20 text-ui-teal   // ✅
text-negative                // ✅
fill="var(--ui-blue)"           // ✅
```

```tsx
// 과도한 타이포그래피 금지
text-3xl font-bold    // ❌ 지표 숫자에 과도함
text-2xl font-semibold // ✅ 절제된 표현
```

```tsx
// 폰트 크기 직접 px 지정 금지
style={{ fontSize: '14px' }}  // ❌
className="text-sm"            // ✅
```

```tsx
// HTML 네이티브 요소 직접 사용 금지
<button onClick={handleClick}>저장</button>     // ❌
<Button onClick={handleClick}>저장</Button>      // ✅

<input type="text" />                            // ❌
<Input type="text" />                            // ✅

<table><tr><td>...</td></tr></table>             // ❌
<Table><TableRow><TableCell>...</TableCell></TableRow></Table> // ✅
```
