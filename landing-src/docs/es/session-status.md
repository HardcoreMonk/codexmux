---
title: Estado de la sesión
description: Cómo purplemux convierte la actividad de Claude Code en una insignia de cuatro estados — y por qué se actualiza casi al instante.
eyebrow: Claude Code
permalink: /es/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

Cada sesión en la barra lateral lleva un punto de color que te dice, de un vistazo, qué está haciendo Claude. Esta página explica de dónde vienen esos cuatro estados y cómo se mantienen sincronizados sin que tengas que mirar la terminal.

## Los cuatro estados

| Estado | Indicador | Significado |
|---|---|---|
| **Inactivo** | ninguno / gris | Claude espera tu siguiente prompt. |
| **Ocupado** | spinner morado | Claude está procesando — leyendo, editando, ejecutando herramientas. |
| **Necesita entrada** | pulso ámbar | Un aviso de permisos o pregunta espera respuesta. |
| **Revisión** | pulso morado | Claude terminó y hay algo para que revises. |

Un quinto valor, **desconocido**, aparece brevemente en pestañas que estaban `ocupado` cuando se reinició el servidor. Se resuelve por sí solo en cuanto purplemux puede reverificar la sesión.

## Los hooks son la fuente de verdad

purplemux instala una configuración de hooks de Claude Code en `~/.purplemux/hooks.json` y un pequeño shell script en `~/.purplemux/status-hook.sh`. El script está registrado para cinco eventos de hook de Claude Code y POSTea cada uno al servidor local con un token CLI:

| Hook de Claude Code | Estado resultante |
|---|---|
| `SessionStart` | inactivo |
| `UserPromptSubmit` | ocupado |
| `Notification` (solo permisos) | necesita-entrada |
| `Stop` / `StopFailure` | revisión |
| `PreCompact` / `PostCompact` | muestra el indicador de compactación (estado sin cambios) |

Como los hooks se disparan en el momento en que Claude Code transiciona, la barra lateral se actualiza antes de que lo notes en la terminal.

{% call callout('note', 'Solo notificaciones de permisos') %}
El hook `Notification` de Claude se dispara por varios motivos. purplemux solo cambia a **necesita-entrada** cuando la notificación es `permission_prompt` o `worker_permission_prompt`. Los recordatorios de inactividad y otros tipos de notificación no cambian la insignia.
{% endcall %}

## La detección de proceso corre en paralelo

Si el CLI de Claude está realmente en marcha se rastrea por separado del estado de trabajo. Dos rutas cooperan:

- **Cambios de título de tmux** — cada panel reporta `pane_current_command|pane_current_path` como su título. xterm.js entrega el cambio vía `onTitleChange`, y purplemux pingea `/api/check-claude` para confirmar.
- **Recorrido del árbol de procesos** — del lado del servidor, `detectActiveSession` mira el PID del shell del panel, recorre sus hijos y los compara con los archivos PID que Claude escribe en `~/.claude/sessions/`.

Si el directorio no existe, la UI muestra una pantalla de "Claude no instalado" en lugar de un punto de estado.

## El watcher de JSONL llena los huecos

Claude Code escribe un transcript JSONL para cada sesión en `~/.claude/projects/`. Mientras una pestaña está `ocupado`, `necesita-entrada`, `desconocido` o `lista-para-revisión`, purplemux observa ese archivo con `fs.watch` por dos razones:

- **Metadatos** — herramienta actual, último fragmento del asistente, conteo de tokens. Estos fluyen a la línea de tiempo y a la barra lateral sin cambiar el estado.
- **Interrupción sintética** — cuando pulsas Esc a mitad de stream, Claude escribe `[Request interrupted by user]` en el JSONL pero no dispara hook. El watcher detecta esa línea y sintetiza un evento `interrupt` para que la pestaña vuelva a inactivo en vez de quedarse atascada en ocupado.

## El polling es una red de seguridad, no el motor

Una pasada de metadatos cada 30–60 segundos según el número de pestañas. **No** decide el estado — eso es estrictamente la ruta de los hooks. El polling existe para:

- Descubrir nuevos paneles de tmux
- Recuperar cualquier sesión que lleve más de 10 minutos ocupada con un proceso de Claude muerto
- Refrescar info de proceso, puertos y títulos

Es el "polling de respaldo de 5–15s" mencionado en la página principal, ralentizado y restringido tras comprobar que los hooks son fiables.

## Sobrevivir a un reinicio del servidor

Los hooks no pueden dispararse mientras purplemux está caído, así que cualquier estado en vuelo podría quedar obsoleto. La regla de recuperación es conservadora:

- Un `ocupado` persistido pasa a `desconocido` y se reverifica: si Claude ya no está en marcha, la pestaña pasa silenciosamente a inactivo; si el JSONL termina limpiamente, pasa a revisión.
- Cualquier otro estado — `inactivo`, `necesita-entrada`, `lista-para-revisión` — tiene la pelota en tu campo, así que se mantiene intacto.

Ningún cambio automático de estado durante la recuperación dispara push. Solo recibirás aviso cuando *nuevo* trabajo cruce a necesita-entrada o revisión.

## Dónde aparece el estado

- Punto de la fila de sesión en la barra lateral
- Punto en la barra de pestañas de cada panel
- Punto del espacio de trabajo (estado de mayor prioridad en el espacio)
- Conteos del icono de campana y la hoja de notificaciones
- Título de la pestaña del navegador (cuenta los elementos que reclaman atención)
- Web Push y notificaciones de escritorio para `necesita-entrada` y `lista-para-revisión`

## Siguientes pasos

- **[Avisos de permisos](/purplemux/es/docs/permission-prompts/)** — el flujo detrás del estado **necesita-entrada**.
- **[Vista de sesión en directo](/purplemux/es/docs/live-session-view/)** — qué muestra la línea de tiempo cuando una pestaña está `ocupado`.
- **[Primera sesión](/purplemux/es/docs/first-session/)** — el recorrido por el panel, en contexto.
