---
title: Temas de terminal
description: Una paleta de colores separada para la terminal xterm.js — elige uno para claro, otro para oscuro.
eyebrow: Personalización
permalink: /es/docs/terminal-themes/index.html
---
{% from "docs/callouts.njk" import callout %}

El panel de terminal usa xterm.js con su propia paleta de colores, independiente del resto de la UI. Eliges un tema oscuro y un tema claro; purplemux alterna entre ellos a la vez que cambia el tema de la app.

## Abrir el selector

Configuración (<kbd>⌘,</kbd>) → pestaña **Terminal**. Verás dos sub-pestañas etiquetadas Oscuro y Claro, cada una con una rejilla de tarjetas de tema. Haz clic en una — se aplica en directo a cada terminal abierta.

## Por qué una paleta separada

Las apps de terminal dependen de la paleta ANSI de 16 colores (rojo, verde, amarillo, azul, magenta, cian, más sus variantes brillantes). La paleta de la UI está apagada por diseño y haría ilegible la salida del terminal. Una paleta dedicada permite que `vim`, `git diff`, el resaltado de sintaxis y las herramientas TUI se rendericen correctamente.

Cada tema define:

- Fondo, primer plano, cursor, selección
- Ocho colores ANSI base (negro, rojo, verde, amarillo, azul, magenta, cian, blanco)
- Ocho variantes brillantes

## Temas incluidos

**Oscuros**

- Snazzy *(por defecto)*
- Dracula
- One Dark
- Tokyo Night
- Nord
- Catppuccin Mocha

**Claros**

- Catppuccin Latte *(por defecto)*
- GitHub Light
- One Light
- Solarized Light
- Tokyo Night Light
- Nord Light

La vista previa de la tarjeta muestra los siete colores ANSI principales sobre el fondo del tema, así puedes evaluar el contraste antes de elegir.

## Cómo funciona el cambio claro/oscuro

Eliges **un tema oscuro** y **un tema claro** independientemente. El tema activo lo decide el tema resuelto de la app:

- Tema de la app **Oscuro** → tu tema oscuro elegido.
- Tema de la app **Claro** → tu tema claro elegido.
- Tema de la app **Sistema** → sigue al SO, intercambia automáticamente.

Así, eligiendo Sistema para el tema de la app y configurando ambos lados, tienes una terminal que sigue el día/noche del SO sin más cableado.

{% call callout('tip', 'Iguálalo o contrástalo con la app') %}
A algunos les gusta que la terminal pegue con el resto de la UI. Otros prefieren una terminal Dracula o Tokyo Night de alto contraste incluso en una app clara. Las dos formas funcionan; el selector no impone nada.
{% endcall %}

## Por tema, no por pestaña

La elección es global. Cada panel de terminal y cada sesión de Claude usa el mismo tema activo. No hay sobrescritura por pestaña; si lo necesitas, abre una issue.

## Añadir el tuyo propio

Las entradas de tema personalizadas no forman parte de la UI actualmente. La lista incluida vive en `src/lib/terminal-themes.ts`. Si compilas desde el código, puedes añadir el tuyo; en otro caso, el camino soportado es abrir un PR con el tema nuevo.

## Siguientes pasos

- **[Temas y fuentes](/purplemux/es/docs/themes-fonts/)** — tema de la app y tamaño de fuente.
- **[CSS personalizado](/purplemux/es/docs/custom-css/)** — sobrescribe el resto de la UI.
- **[Integración con el editor](/purplemux/es/docs/editor-integration/)** — abre archivos en un editor externo.
