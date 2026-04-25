---
title: Temas y fuentes
description: Claro, oscuro o sistema; tres tamaños de fuente; un panel de configuración.
eyebrow: Personalización
permalink: /es/docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux trae un look único y coherente y un pequeño grupo de interruptores: tema de la app, tamaño de fuente y una paleta separada para la terminal. Esta página cubre los dos primeros — los colores de terminal viven en su propia página.

## Abrir Configuración

Pulsa <kbd>⌘,</kbd> (macOS) o <kbd>Ctrl,</kbd> (Linux) para abrir Configuración. La pestaña **General** es donde viven el tema y el tamaño de fuente.

También puedes hacer clic en el icono del engranaje en la barra superior.

## Tema de la app

Tres modos, aplicados al instante:

| Modo | Comportamiento |
|---|---|
| **Claro** | Fuerza el tema claro independientemente de la preferencia del SO. |
| **Oscuro** | Fuerza el tema oscuro. |
| **Sistema** | Sigue al SO — cambia automáticamente cuando macOS / GNOME / KDE alterna entre claro y oscuro. |

El tema se almacena en `~/.purplemux/config.json` bajo `appTheme` y se sincroniza con cada pestaña de navegador conectada al servidor. En la app nativa de macOS, la barra de título del SO también se actualiza.

{% call callout('note', 'Diseñado dark-first') %}
La marca está construida alrededor de un neutro tintado de morado profundo, y el modo oscuro mantiene el chroma a cero para una superficie estrictamente acromática. El modo claro aplica un tinte morado apenas perceptible (tono 287) por calidez. Ambos están afinados para sesiones largas; elige el que prefieran tus ojos.
{% endcall %}

## Tamaño de fuente

Tres presets, expuestos como un grupo de botones:

- **Normal** — el por defecto; el tamaño raíz sigue al navegador.
- **Grande** — tamaño raíz a `18px`.
- **Extra grande** — tamaño raíz a `20px`.

Como toda la UI está dimensionada en `rem`, cambiar de preset escala toda la interfaz — barra lateral, diálogos, terminal — a la vez. El cambio se aplica en tiempo real sin recargar.

## Qué cambia, qué no

El tamaño de fuente escala el **chrome de la UI y el texto de terminal**. No cambia:

- La jerarquía de encabezados (los tamaños relativos se mantienen)
- El espaciado — las proporciones se preservan
- El estilo de sintaxis de los bloques de código

Si quieres ajustar elementos individuales (p. ej. solo la terminal, o solo la barra lateral), consulta [CSS personalizado](/purplemux/es/docs/custom-css/).

## Por dispositivo, no por navegador

Los ajustes se almacenan en el servidor, no en localStorage. Cambiar a oscuro en el portátil cambiará también el móvil — abre `https://<host>/` desde el móvil y el cambio ya está ahí.

Si prefieres mantener móvil y escritorio diferentes, eso no está soportado actualmente; abre una issue si lo necesitas.

## Siguientes pasos

- **[CSS personalizado](/purplemux/es/docs/custom-css/)** — sobrescribe colores y espaciado individuales.
- **[Temas de terminal](/purplemux/es/docs/terminal-themes/)** — paleta separada para xterm.js.
- **[Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/)** — todos los atajos en una tabla.
