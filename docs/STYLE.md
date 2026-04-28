# 스타일 가이드

codexmux의 시각 톤은 차분한 enterprise SaaS에 맞춘다. Tailwind의 고채도 기본색을 직접 쓰지 않고, 낮은 채도의 muted palette와 얇은 구분선으로 계층을 만든다.

## 원칙

- Tailwind base color를 직접 쓰지 않는다. `text-blue-600` 대신 `text-ui-blue` 같은 token을 쓴다.
- 숫자와 metric은 절제한다. `text-3xl font-bold`보다 `text-2xl font-semibold`를 우선한다.
- font size는 `text-sm`, `text-base` 같은 utility를 사용한다.
- 기본 control은 shadcn/ui의 `Button`, `Input`, `Table` 등을 사용한다.
- emoji 대신 `lucide-react` icon을 사용한다.

## theme

- base color는 Neutral이며 light mode에는 아주 약한 cool tint만 둔다.
- dark mode는 거의 무채색으로 유지한다.
- radius는 `0.5rem` 또는 8px를 기본으로 한다.

## color token

| token | 용도 |
|---|---|
| `ui-blue` | info, link, project |
| `ui-teal` | success, completion, positive |
| `ui-coral` | warm accent |
| `ui-amber` | warning, caution, money |
| `ui-purple` | analytics |
| `ui-pink` | image, creative |
| `ui-green` | environment |
| `ui-gray` | disabled, secondary |
| `ui-red` | error, delete, danger |

Semantic alias는 `positive`, `negative`, `accent-color`를 사용한다.

## chart color

Chart 색상은 순서가 아니라 의미로 고른다. 비용은 red, 성공은 teal처럼 의미가 분명한 색을 사용한다. 의미 없는 category에는 convention이 강한 blue, green, red, amber보다 purple, coral, pink, gray를 우선한다.

```tsx
<Bar fill="var(--ui-teal)" />
<Area stroke="var(--ui-purple)" />
```

## 금지 장식

- gradient background, gradient button, gradient card.
- blur, backdrop-filter.
- glow, neon.
- drop shadow.
- full border가 없는 일방향 accent의 radius.

계층은 shadow가 아니라 whitespace와 background difference로 만든다. table과 grid는 얇은 가로선 위주로 구성하고 불필요한 hover highlight와 animation을 줄인다.

## 금지 패턴 예시

```tsx
bg-blue-100 text-blue-600
bg-green-100 text-green-700
text-red-500
fill="#3b82f6"
```

대신 다음처럼 쓴다.

```tsx
bg-ui-blue/20 text-ui-blue
bg-ui-teal/20 text-ui-teal
text-negative
fill="var(--ui-blue)"
```
