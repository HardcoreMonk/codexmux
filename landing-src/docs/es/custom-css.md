---
title: CSS personalizado
description: Sobrescribe variables CSS para reajustar colores, espaciado y superficies individuales.
eyebrow: Personalización
permalink: /es/docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux está construido sobre un sistema de variables CSS. Puedes cambiar casi cualquier cosa visual sin tocar el código fuente — pega reglas en la pestaña **Apariencia**, haz clic en Aplicar, y surten efecto inmediatamente en cada cliente conectado.

## Dónde ponerlo

Abre Configuración (<kbd>⌘,</kbd>) y elige **Apariencia**. Verás un único textarea etiquetado CSS personalizado.

1. Escribe tus reglas.
2. Haz clic en **Aplicar**. El CSS se inyecta en una etiqueta `<style>` en cada página.
3. Haz clic en **Reiniciar** para borrar todas las sobrescrituras.

El CSS se almacena en el servidor en `~/.purplemux/config.json` (`customCSS`), así que se aplica en cada dispositivo que se conecta.

{% call callout('note', 'A nivel de servidor, no por dispositivo') %}
El CSS personalizado vive en la configuración del servidor y te sigue a cada navegador. Si quieres que un dispositivo se vea distinto a otro, eso no está soportado actualmente.
{% endcall %}

## Cómo funciona

La mayoría de colores, superficies y acentos en purplemux se exponen como variables CSS bajo `:root` (claro) y `.dark`. Sobrescribir la variable propaga el cambio a todas partes donde se usa — barra lateral, diálogos, gráficos, insignias de estado.

Cambiar una sola variable casi siempre es mejor que sobrescribir selectores de componente directamente. Las clases de los componentes no son una API estable; las variables sí.

## Un ejemplo mínimo

Da un toque más cálido a la barra lateral en modo claro y oscurece más la superficie en modo oscuro:

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

O recolorea la marca sin tocar nada más:

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## Grupos de variables

El panel Apariencia expone la lista completa bajo **Variables disponibles**. Los grupos principales son:

- **Surface** — `--background`, `--card`, `--popover`, `--muted`, `--secondary`, `--accent`, `--sidebar`
- **Text** — `--foreground` y las variantes `*-foreground` correspondientes
- **Interactive** — `--primary`, `--primary-foreground`, `--destructive`
- **Border** — `--border`, `--input`, `--ring`
- **Palette** — `--ui-blue`, `--ui-teal`, `--ui-coral`, `--ui-amber`, `--ui-purple`, `--ui-pink`, `--ui-green`, `--ui-gray`, `--ui-red`
- **Semantic** — `--positive`, `--negative`, `--accent-color`, `--brand`, `--focus-indicator`, `--claude-active`

Para la lista completa de tokens con valores oklch por defecto y la justificación de diseño, consulta [`docs/STYLE.md`](https://github.com/subicura/purplemux/blob/main/docs/STYLE.md) en el repo. Ese documento es la fuente de verdad.

## Apuntar solo a un modo

Envuelve las reglas en `:root` para claro y `.dark` para oscuro. La clase la pone en `<html>` `next-themes`.

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

Si solo necesitas cambiar un modo, deja el otro intacto.

## ¿Y la terminal?

La terminal xterm.js usa su propia paleta, elegida de una lista curada — no la dirigen estas variables CSS. Cámbiala en la pestaña **Terminal**. Consulta [Temas de terminal](/purplemux/es/docs/terminal-themes/).

## Siguientes pasos

- **[Temas y fuentes](/purplemux/es/docs/themes-fonts/)** — claro, oscuro, sistema; presets de tamaño de fuente.
- **[Temas de terminal](/purplemux/es/docs/terminal-themes/)** — paleta separada para el área de terminal.
- **[Barra lateral y opciones de Claude](/purplemux/es/docs/sidebar-options/)** — reordena elementos, alterna flags de Claude.
