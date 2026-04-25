---
title: Notas (informe diario de IA)
description: Un resumen de fin de día de cada sesión de Claude Code, escrito por un LLM, almacenado localmente en Markdown.
eyebrow: Claude Code
permalink: /es/docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

Cuando termina el día, purplemux puede leer los logs de las sesiones del día y redactarte un brief de una línea más un resumen Markdown por proyecto. Vive en la barra lateral como **Notas** y existe para que las retros, dailies y 1:1 dejen de empezar con "¿qué hice ayer?".

## Qué obtienes por día

Cada entrada tiene dos capas:

- **Brief de una línea** — una sola frase que captura la forma del día. Visible directamente en la lista de Notas.
- **Vista detallada** — expande el brief para ver un informe Markdown agrupado por proyecto, con secciones H3 por tema y puntos con los puntos destacados debajo.

El brief es lo que escaneas; la vista detallada es lo que pegas en un documento de retro.

Una pequeña cabecera en cada día muestra el conteo de sesiones y el coste total — los mismos números que usa el [dashboard de estadísticas](/purplemux/es/docs/usage-rate-limits/), en forma de resumen.

## Generar un informe

Los informes se generan bajo demanda, no automáticamente. Desde la vista de Notas:

- **Generar** junto a un día que falta crea el informe de ese día desde los transcripts JSONL.
- **Regenerar** sobre una entrada existente reconstruye el mismo día con contenido fresco (útil si has añadido contexto o cambiado de idioma).
- **Generar todo** recorre cada día faltante y los rellena secuencialmente. Puedes parar el lote en cualquier momento.

El LLM procesa cada sesión individualmente antes de fusionarlas por proyecto, así que el contexto no se pierde en días largos con muchas pestañas.

{% call callout('note', 'El idioma sigue al de la app') %}
Los informes se escriben en el idioma al que esté configurado purplemux. Cambiar el idioma de la app y regenerar te da el mismo contenido en el nuevo locale.
{% endcall %}

## Dónde vive

| Superficie | Ruta |
|---|---|
| Barra lateral | Entrada **Notas**, abre la vista de lista |
| Atajo | <kbd>⌘⇧E</kbd> en macOS, <kbd>Ctrl⇧E</kbd> en Linux |
| Almacenamiento | `~/.purplemux/stats/daily-reports/<date>.json` |

Cada día es un archivo JSON con el brief, el Markdown detallado, el locale y los metadatos de sesión. Nada sale de tu máquina excepto la propia llamada al LLM, que va a través de la cuenta de Claude Code que tengas configurada en el host.

## Estructura por proyecto

Dentro de la vista detallada, un día típico se ve así:

```markdown
**purplemux**

### Borrador de la landing
- Diseñé la estructura de ocho secciones con disposiciones Hero / Por qué / Móvil / Stats
- Convertí el morado de marca en una variable OKLCH
- Apliqué frames de mockup de captura de escritorio/móvil

### Mockups de tarjetas de funcionalidades
- Reproduje los indicadores reales de spinner/pulso en el dashboard multisesión
- Ajusté el CSS de los mockups de Git Diff, espacio de trabajo y self-hosted
```

Las sesiones que trabajaron en el mismo proyecto se fusionan bajo un mismo encabezado de proyecto; los temas dentro de un proyecto se convierten en secciones H3. Puedes copiar el Markdown renderizado directo a una plantilla de retro.

## Cuando un día no tiene sentido resumir

Un día sin sesiones de Claude no tiene entrada. Un día con una sesión diminuta puede producir un brief muy corto — está bien; volverá a generar más largo cuando realmente trabajes.

El generador por lotes salta los días que ya tienen un informe en el locale actual y solo rellena huecos reales.

## Privacidad

El texto que se usa para construir un informe son los mismos transcripts JSONL que puedes leer tú en `~/.claude/projects/`. La petición de resumen es una sola llamada al LLM por día; la salida cacheada se queda en `~/.purplemux/`. No hay telemetría, ni subida, ni caché compartida.

## Siguientes pasos

- **[Uso y límites de tasa](/purplemux/es/docs/usage-rate-limits/)** — el dashboard de donde vienen los conteos y costes de sesiones.
- **[Vista de sesión en directo](/purplemux/es/docs/live-session-view/)** — los datos fuente, en tiempo real.
- **[Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/)** — incluyendo <kbd>⌘⇧E</kbd> para Notas.
