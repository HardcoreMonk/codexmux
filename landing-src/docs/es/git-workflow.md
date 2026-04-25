---
title: Panel de flujo de Git
description: Un visor de diffs, navegador de historial y controles de sincronización junto a tu terminal — con un traspaso a Claude de un clic cuando algo se rompe.
eyebrow: Espacios de trabajo y terminal
permalink: /es/docs/git-workflow/index.html
---
{% from "docs/callouts.njk" import callout %}

El panel de Git es un tipo de pestaña, igual que una terminal. Ábrelo junto a una sesión de Claude y podrás leer cambios, recorrer el historial y hacer push sin salir del panel. Cuando git se porta mal, "Preguntar a Claude" entrega el problema a una sesión con un solo clic.

## Abrir el panel

Añade una nueva pestaña y elige **Diff** como tipo de panel, o cámbialo desde el menú de tipo de panel en una pestaña existente. El panel se ata al mismo directorio de trabajo que sus pestañas hermanas — si tu pestaña está en `~/code/api`, el panel de diff lee ese repositorio.

| Acción | macOS | Linux / Windows |
|---|---|---|
| Cambiar la pestaña activa al modo Diff | <kbd>⌘⇧F</kbd> | <kbd>Ctrl+Shift+F</kbd> |

Si el directorio no es un repo de git, el panel lo dice y se quita de en medio.

## El visor de diffs

La pestaña Cambios muestra los cambios del árbol de trabajo por archivo.

- **Lado a lado o en línea** — alterna en la cabecera del panel. Lado a lado refleja la vista dividida de GitHub; en línea es la vista unificada.
- **Resaltado de sintaxis** — detección completa de lenguajes para los que tu editor resaltaría.
- **Expansión de hunks en línea** — haz clic en las líneas de contexto alrededor de un hunk para expandir el código sin salir del panel.
- **Lista de archivos** — navega entre archivos cambiados en la barra lateral del panel.

Los cambios se refrescan cada 10 segundos mientras el panel está visible, e inmediatamente cuando guardas en otra herramienta.

## Historial de commits

Cambia a la pestaña **Historial** para ver el log de commits paginado de la rama actual. Cada entrada muestra hash, asunto, autor y hora; haz clic para ver el diff que entró en ese commit. Útil cuando quieres recordar por qué un archivo está como está sin volver a la terminal a hacer `git log`.

## Panel de sincronización

La cabecera muestra la rama actual, el upstream y un contador adelante/atrás. Tres acciones:

- **Fetch** — `git fetch` contra el upstream cada 3 minutos en segundo plano, además de bajo demanda.
- **Pull** — fast-forward cuando es posible.
- **Push** — empuja al upstream configurado.

La sincronización es deliberadamente estrecha. Rechaza cualquier cosa que requiera una decisión — ramas divergentes, árbol de trabajo sucio, falta de upstream — y te dice por qué.

{% call callout('warning', 'Cuando la sincronización no avanza') %}
Fallos comunes que el panel reporta con claridad:

- **Sin upstream** — todavía no se ha ejecutado `git push -u`.
- **Auth** — credenciales ausentes o rechazadas.
- **Diverged** — local y remoto tienen commits únicos; haz rebase o merge primero.
- **Cambios locales** — trabajo sin commitear bloquea el pull.
- **Rejected** — push rechazado por no-fast-forward.
{% endcall %}

## Preguntar a Claude

Cuando la sincronización falla, el aviso de error ofrece un botón **Preguntar a Claude**. Al hacer clic, canaliza el contexto del fallo — el tipo de error, la salida relevante de `git` y el estado de la rama actual — a la pestaña de Claude del mismo espacio en forma de prompt. Claude entonces guía la recuperación: rebase, resolución de conflictos, configurar un upstream, lo que el error pidiera.

Esa es la apuesta principal del panel: utilidades para el caso común, un LLM para la cola larga. No cambias de contexto; el prompt llega a la sesión que ya ibas a usar.

## Siguientes pasos

- **[Pestañas y paneles](/purplemux/es/docs/tabs-panes/)** — dividir el panel de diff junto a una sesión de Claude.
- **[Primera sesión](/purplemux/es/docs/first-session/)** — cómo aparecen los avisos de permisos de Claude en el panel.
- **[Panel de navegador web](/purplemux/es/docs/web-browser-panel/)** — el otro tipo de panel que merece la pena ejecutar junto a una terminal.
