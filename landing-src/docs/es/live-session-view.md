---
title: Vista de sesión en directo
description: Qué muestra realmente el panel de línea de tiempo — mensajes, llamadas a herramientas, tareas y prompts presentados como eventos en lugar del scrollback del CLI.
eyebrow: Claude Code
permalink: /es/docs/live-session-view/index.html
---
{% from "docs/callouts.njk" import callout %}

Cuando una pestaña ejecuta Claude Code, purplemux sustituye la vista de terminal cruda por una línea de tiempo estructurada. La misma sesión, el mismo transcript JSONL — pero presentado como eventos discretos que puedes escanear, recorrer y enlazar.

## Por qué una línea de tiempo gana al scrollback

El CLI de Claude es interactivo. Mirar lo que hizo hace quince minutos en una terminal significa desplazar a través de todo lo ocurrido desde entonces, leer líneas envueltas, y adivinar dónde acaba una llamada a herramienta y empieza la siguiente.

La línea de tiempo conserva los mismos datos y añade estructura:

- Una fila por mensaje, llamada a herramienta, tarea o prompt
- Entradas y salidas de herramientas agrupadas
- Anclas permanentes — los eventos no se deslizan por arriba cuando el buffer se llena
- El paso actual queda siempre fijado abajo con un contador de tiempo transcurrido

Aún puedes saltar a la terminal en cualquier momento con el alternador de modo de la barra superior. La línea de tiempo es una vista sobre la misma sesión, no una sesión separada.

## Qué verás

Cada fila de la línea de tiempo se corresponde con una entrada del transcript JSONL de Claude Code:

| Tipo | Lo que muestra |
|---|---|
| **Mensaje del usuario** | Tu prompt como burbuja de chat. |
| **Mensaje del asistente** | La respuesta de Claude, renderizada como Markdown. |
| **Llamada a herramienta** | El nombre de la herramienta, los argumentos clave y la respuesta — `read`, `edit`, `bash`, etc. |
| **Grupo de herramientas** | Llamadas consecutivas colapsadas en una tarjeta. |
| **Tarea / plan** | Planes multi-paso con progreso por casillas. |
| **Sub-agente** | Invocaciones de agentes agrupadas con su propio progreso. |
| **Aviso de permisos** | El aviso interceptado con las mismas opciones que ofrece Claude. |
| **Compactación** | Un indicador sutil cuando Claude auto-compacta el contexto. |

Los mensajes largos del asistente se colapsan en un fragmento con opción de expandir; las salidas largas de herramientas se truncan con un alternador "mostrar más".

## Cómo se mantiene en vivo

La línea de tiempo se alimenta por un WebSocket en `/api/timeline`. El servidor ejecuta un `fs.watch` sobre el archivo JSONL activo, parsea las entradas añadidas y las empuja al navegador a medida que ocurren. No hay polling ni re-fetch completo — la carga inicial envía las entradas existentes, y todo lo posterior es incremental.

Mientras Claude está `ocupado`, también ves:

- Un spinner con el tiempo transcurrido en directo del paso actual
- La llamada a herramienta actual (p. ej. "Leyendo src/lib/auth.ts")
- Un breve fragmento del último texto del asistente

Estos vienen del paso de metadatos del watcher de JSONL y se actualizan sin cambiar el estado de la sesión.

## Desplazamiento, anclas e historial

La línea de tiempo se autodesplaza cuando ya estás abajo, y se queda quieta cuando subes para leer algo. Aparece un botón flotante **Ir abajo** cuando estás más de una pantalla por encima de la última entrada.

En sesiones largas, las entradas antiguas se cargan bajo demanda al subir. El ID de sesión de Claude se preserva entre reanudaciones, así que retomar una sesión de ayer te lleva donde la dejaste.

{% call callout('tip', 'Saltar al input') %}
Pulsa <kbd>⌘I</kbd> desde cualquier lugar de la línea de tiempo para enfocar la barra de entrada de abajo. <kbd>Esc</kbd> envía una interrupción al proceso de Claude en marcha.
{% endcall %}

## Avisos de permisos en línea

Cuando Claude pide ejecutar una herramienta o editar un archivo, el aviso aparece en línea dentro de la línea de tiempo en lugar de como modal. Puedes hacer clic en la opción, pulsar la tecla numérica correspondiente, o ignorarlo y responder desde el móvil vía Web Push. Consulta [Avisos de permisos](/purplemux/es/docs/permission-prompts/) para el flujo completo.

## Modos en una sola pestaña

La barra superior te deja cambiar lo que muestra el panel derecho para la misma sesión:

- **Claude** — la línea de tiempo (por defecto)
- **Terminal** — la vista cruda de xterm.js
- **Diff** — los cambios de Git para el directorio de trabajo

Cambiar de modo no reinicia nada. La sesión sigue corriendo en tmux detrás de las tres vistas.

Atajos: <kbd>⌘⇧C</kbd> · <kbd>⌘⇧T</kbd> · <kbd>⌘⇧F</kbd>.

## Siguientes pasos

- **[Avisos de permisos](/purplemux/es/docs/permission-prompts/)** — el flujo de aprobación en línea.
- **[Estado de la sesión](/purplemux/es/docs/session-status/)** — las insignias que dirigen los indicadores de la línea de tiempo.
- **[Prompts rápidos y adjuntos](/purplemux/es/docs/quick-prompts-attachments/)** — qué puede hacer la barra de entrada de abajo.
