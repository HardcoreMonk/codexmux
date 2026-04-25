---
title: Guardar y restaurar disposiciones
description: Por qué tus pestañas vuelven exactamente donde las dejaste, incluso después de reiniciar el servidor.
eyebrow: Espacios de trabajo y terminal
permalink: /es/docs/save-restore/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux se construye sobre la idea de que cerrar una pestaña en el navegador no debería terminar una sesión. Dos piezas trabajan juntas: tmux mantiene los shells en marcha, y `~/.purplemux/workspaces.json` recuerda la disposición.

## Qué se persiste

Cualquier cosa visible en un espacio de trabajo:

- Las pestañas y su orden
- Las divisiones de paneles y sus proporciones
- El tipo de panel de cada pestaña — Terminal, Claude, Diff, Navegador web
- El directorio de trabajo de cada shell
- Los grupos, nombres y orden de espacios de trabajo

`workspaces.json` se actualiza transaccionalmente en cada cambio de disposición, así que el archivo siempre refleja el estado actual. Consulta [Directorio de datos](/purplemux/es/docs/data-directory/) para el mapa de archivos en disco.

## Cerrar el navegador

Cierra la pestaña, refresca o cierra la tapa del portátil. Nada de eso mata las sesiones.

Cada shell vive en una sesión de tmux sobre el socket dedicado `purple` — totalmente aislado de tu `~/.tmux.conf` personal. Vuelve a abrir `http://localhost:8022` una hora después y el WebSocket se reconecta a la misma sesión de tmux, reproduce el scrollback y devuelve el PTY en directo a xterm.js.

No restauras nada; te reconectas.

{% call callout('tip', 'También en el móvil') %}
Lo mismo aplica en el móvil. Cierra la PWA, bloquea el dispositivo, vuelve mañana — el panel se reconecta con todo en su sitio.
{% endcall %}

## Recuperarse tras reiniciar el servidor

Un reinicio sí mata los procesos de tmux — son procesos del sistema operativo. purplemux gestiona esto en el siguiente arranque:

1. **Lee la disposición** — `workspaces.json` describe cada espacio, panel y pestaña.
2. **Recrea sesiones en paralelo** — para cada pestaña se lanza una nueva sesión de tmux en su directorio de trabajo guardado.
3. **Auto-resume de Claude** — las pestañas que tenían una sesión de Claude se relanzan con `claude --resume {sessionId}` para continuar la conversación donde quedó.

La parte "en paralelo" importa: si tenías diez pestañas, las diez sesiones de tmux suben a la vez en lugar de una tras otra. Cuando abras el navegador, la disposición ya está ahí.

## Lo que no vuelve

Hay algunas cosas que no se pueden persistir:

- **Estado en memoria del shell** — variables de entorno que hayas establecido, jobs en segundo plano, REPLs a medio pensar.
- **Avisos de permisos en curso** — si Claude estaba esperando una decisión de permiso cuando murió el servidor, verás el aviso de nuevo al reanudar.
- **Procesos en primer plano distintos de `claude`** — buffers de `vim`, `htop`, `docker logs -f`. El shell vuelve al mismo directorio; el proceso no.

Es el contrato estándar de tmux: el shell sobrevive, los procesos dentro de él no necesariamente.

## Control manual

Normalmente no necesitas tocar esto, pero por si acaso:

- El socket de tmux se llama `purple`. Inspecciónalo con `tmux -L purple ls`.
- Las sesiones se llaman `pt-{workspaceId}-{paneId}-{tabId}`.
- Editar `workspaces.json` mientras purplemux corre no es seguro — el servidor lo tiene abierto y escribe a través de él.

Para la historia más profunda (protocolo binario, backpressure, vigilancia de JSONL) consulta [Cómo funciona](/purplemux/#how) en la página principal.

## Siguientes pasos

- **[Espacios de trabajo y grupos](/purplemux/es/docs/workspaces-groups/)** — qué se guarda por espacio.
- **[Pestañas y paneles](/purplemux/es/docs/tabs-panes/)** — qué se guarda por pestaña.
- **[Compatibilidad de navegadores](/purplemux/es/docs/browser-support/)** — particularidades conocidas con pestañas móviles en segundo plano y reconexiones.
