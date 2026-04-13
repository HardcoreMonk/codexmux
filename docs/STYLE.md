# Style Guide

Aim for the calm, professional tone of an enterprise system.
Avoid using Tailwind's high-saturation/high-lightness defaults directly; rely on the Muted Palette to keep the look consistent.

## Design Principles

- **Muted Palette**: Lower saturation to reduce the "AI-generated" feel and aim for an enterprise SaaS aesthetic
- **No direct Tailwind base colors**: Use custom muted tokens like `text-ui-blue`, `bg-ui-teal/20` instead of Tailwind defaults like `text-blue-600` or `bg-green-100`
- **Restrained typography**: For numbers and metrics use `text-2xl font-semibold` (avoid heavy `text-3xl font-bold`)
- **Use Tailwind utilities for font size**: Use `text-sm`, `text-base`, etc. instead of writing `font-size: 14px` directly
- **Prefer shadcn/ui**: Use shadcn/ui's `Button`, `Input`, `Table`, etc. instead of native HTML elements like `<button>`, `<input>`, `<table>`

---

## Theme Composition

### Base: Purple-tinted Neutral

The shadcn base color is Neutral, but in light mode a subtle tint toward hue 287 (purple) is applied. This is intentional, to subconsciously reinforce the "purplemux" brand.

- Light mode: chroma 0.003–0.015 (hue 287) — barely perceivable individually, providing an overall warm cohesion
- Dark mode: chroma 0 (pure achromatic) — dark mode stays achromatic
- Primary: dark purple-tinted Neutral (light) / bright Neutral (dark)

### Radius: 0.5rem (8px)

A trim corner that fits enterprise SaaS — not too round (casual), not too sharp (rigid).

---

## Muted Palette

Composed of 9 colors plus 3 semantic aliases. Light/dark values differ per token.

### Color Tokens

| Token       | Purpose                       | Light (oklch)       | Dark (oklch)        |
| ----------- | ----------------------------- | ------------------- | ------------------- |
| `ui-blue`   | Info, links, projects         | `0.596 0.068 243.5` | `0.69 0.056 243.5`  |
| `ui-teal`   | Success, completion, positive | `0.589 0.071 171.9` | `0.69 0.07 171.5`   |
| `ui-coral`  | Warm accent                   | `0.624 0.079 44`    | `0.711 0.071 43.9`  |
| `ui-amber`  | Warning, caution, money       | `0.606 0.086 82.8`  | `0.715 0.081 78`    |
| `ui-purple` | AX index, analytics           | `0.608 0.065 287.5` | `0.71 0.051 289`    |
| `ui-pink`   | Image, creative               | `0.601 0.081 358.3` | `0.704 0.069 359.6` |
| `ui-green`  | Nature, environment           | `0.594 0.093 131.6` | `0.694 0.087 130.6` |
| `ui-gray`   | Disabled, secondary           | `0.619 0.012 100.9` | `0.708 0.01 100.1`  |
| `ui-red`    | Error, delete, danger         | `0.592 0.101 20.5`  | `0.703 0.085 19.4`  |

### Semantic Aliases

| Token          | Refers to    | Purpose                       |
| -------------- | ------------ | ----------------------------- |
| `positive`     | `ui-teal`    | Success, increase, active     |
| `negative`     | `ui-red`     | Error, decrease, failure      |
| `accent-color` | `ui-blue`    | Emphasis, info, links         |

### Saturation Range

- **Light**: Lightness 0.59–0.62, Chroma 0.065–0.101
- **Dark**: Lightness 0.69–0.72, Chroma 0.051–0.087
- Light → Dark: lightness +0.1, chroma slightly lower

---

## Chart Colors

`--chart-1` through `--chart-9` reference the muted palette.

| Chart variable | Refers to   |
| -------------- | ----------- |
| `--chart-1`    | `ui-blue`   |
| `--chart-2`    | `ui-teal`   |
| `--chart-3`    | `ui-coral`  |
| `--chart-4`    | `ui-amber`  |
| `--chart-5`    | `ui-purple` |
| `--chart-6`    | `ui-pink`   |
| `--chart-7`    | `ui-green`  |
| `--chart-8`    | `ui-gray`   |
| `--chart-9`    | `ui-red`    |

### Color Selection Guidelines

- **Color must encode meaning**: Don't use chart-1 onward in order. Pick colors that fit the data's meaning.
- **2–3 colors per chart is ideal**: Multi-color is acceptable only for categorical data.
- **Beware UI conventions**: blue (info), teal/green (success), red (danger), and amber (warning) already carry meaning, so prefer `purple`, `coral`, `pink`, or `gray` for categorical data where those meanings don't apply.

```
// Cost vs profit → match meaning
API cost: ui-red (cost = negative)   // ✅
Net profit: ui-teal (profit = positive)  // ✅

// Categorical (no inherent meaning) → avoid convention colors
Project: ui-blue     // ⚠️ may collide with the "info" meaning
Library: ui-purple  // ✅ neutral
AI recipe: ui-coral // ✅ neutral
App: ui-pink         // ✅ neutral
```

For SVG-based charts (recharts, etc.), use the CSS variables directly:

```tsx
<Bar fill="var(--ui-teal)" />
<Area stroke="var(--ui-purple)" />
<linearGradient>
  <stop stopColor="var(--ui-blue)" />
</linearGradient>
```

---

## Minimal Decoration

> "Flat, clean, white surfaces. No gradients, drop shadows, blur, glow, or neon effects."
>
> Subtraction is the rule; addition only when there is a functional reason.

### Core Philosophy

Don't express hierarchy with shadows or thick borders. Instead, build hierarchy with **whitespace** and **background color differences**.

### Border Rules

All borders default to 0.5px with low opacity.

| Use                   | Spec                                              |
| --------------------- | ------------------------------------------------- |
| Default               | `0.5px solid` — about 15% opacity                 |
| Hover / emphasis      | `0.5px solid` — about 30% opacity                 |
| Strong divider        | `0.5px solid` — about 40% opacity                 |
| Featured / promoted   | `2px solid` — the only exception, intentional emphasis |

### Forbidden Decoration

- **Gradient** — not allowed for backgrounds, buttons, or cards. Use flat fills only
- **Blur / Backdrop-filter** — not allowed
- **Glow / Neon** — not allowed
- **Drop shadow** — not allowed. Use whitespace and background color for hierarchy
- **Overuse of rounded corners** — `border-radius` only when there is a full border. For one-sided accents like `border-left`, `border-radius: 0` is required

### Grids / Tables

- Grid lines should be **horizontal only**, thin and faint
- Suppress unnecessary hover highlights
- Minimize animation — only use it for functional feedback (loading, transitions)

### Icons

- Avoid emoji; use **lucide-react icons**
- Minimize decorative icon backgrounds (use about `/20` opacity if needed)

---

## Forbidden Patterns

```tsx
// Don't use Tailwind base palette directly
bg-blue-100 text-blue-600    // ❌
bg-green-100 text-green-700  // ❌
text-red-500                 // ❌
fill="#3b82f6"               // ❌

// Use the muted palette instead
bg-ui-blue/20 text-ui-blue   // ✅
bg-ui-teal/20 text-ui-teal   // ✅
text-negative                // ✅
fill="var(--ui-blue)"        // ✅
```

```tsx
// Don't overdo typography
text-3xl font-bold     // ❌ too heavy for a metric number
text-2xl font-semibold // ✅ restrained
```

```tsx
// Don't hardcode font size in px
style={{ fontSize: '14px' }}  // ❌
className="text-sm"           // ✅
```

```tsx
// Don't use raw HTML elements
<button onClick={handleClick}>Save</button>     // ❌
<Button onClick={handleClick}>Save</Button>      // ✅

<input type="text" />                            // ❌
<Input type="text" />                            // ✅

<table><tr><td>...</td></tr></table>             // ❌
<Table><TableRow><TableCell>...</TableCell></TableRow></Table> // ✅
```
