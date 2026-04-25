---
title: Avisos de permisos
description: Cómo purplemux intercepta los diálogos "¿puedo ejecutar esto?" de Claude Code y te deja aprobar desde el panel, el teclado o el móvil.
eyebrow: Claude Code
permalink: /es/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Claude Code se bloquea por defecto en los diálogos de permisos — para llamadas a herramientas, escrituras de archivo y similares. purplemux atrapa esos diálogos en el momento que aparecen y los enruta al dispositivo que tengas más a mano.

## Qué se intercepta

Claude Code dispara un hook `Notification` por varios motivos. purplemux solo trata dos tipos de notificación como avisos de permisos:

- `permission_prompt` — el diálogo estándar "¿Permitir que esta herramienta se ejecute?"
- `worker_permission_prompt` — lo mismo desde un sub-agente

Cualquier otra cosa (recordatorios de inactividad, etc.) se ignora del lado del estado y no cambiará la pestaña a **necesita-entrada** ni enviará push.

## Qué pasa cuando se dispara uno

1. Claude Code emite un hook `Notification`. El shell script en `~/.purplemux/status-hook.sh` POSTea el evento y el tipo de notificación al servidor local.
2. El servidor cambia el estado de la pestaña a **necesita-entrada** (pulso ámbar) y emite el cambio por el WebSocket de estado.
3. El panel renderiza el aviso **en línea dentro de la línea de tiempo**, con las mismas opciones que ofrece Claude — sin modal, sin cambio de contexto.
4. Si has concedido permiso de notificaciones, se dispara un Web Push y/o una notificación de escritorio para `necesita-entrada`.

El CLI de Claude sigue esperando en stdin. purplemux lee las opciones del aviso desde tmux y reenvía tu elección de vuelta cuando seleccionas una.

## Cómo responder

Tres formas equivalentes:

- **Hacer clic** en la opción dentro de la línea de tiempo.
- **Pulsar el número** — <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> — coincidiendo con el índice de la opción.
- **Tocar el push** en el móvil, que abre directamente el aviso; elige desde ahí.

Una vez seleccionas, purplemux envía la entrada a tmux, la pestaña vuelve a **ocupado** y Claude continúa a mitad de stream. No tienes que confirmar nada más — el clic *es* la confirmación.

{% call callout('tip', 'Avisos consecutivos se actualizan automáticamente') %}
Si Claude hace varias preguntas seguidas, el aviso en línea se vuelve a renderizar con las nuevas opciones en cuanto llega la siguiente `Notification`. No hace falta descartar el anterior.
{% endcall %}

## Flujo móvil

Con la PWA instalada y los permisos de notificación concedidos, Web Push se dispara aunque la pestaña del navegador esté abierta, en segundo plano o cerrada:

- La notificación dice "Se requiere entrada" e identifica la sesión.
- Tocarla abre purplemux en esa pestaña.
- El aviso en línea ya está renderizado; elige una opción con un toque.

Esta es la razón principal para configurar [Tailscale + PWA](/purplemux/es/docs/quickstart/#acceder-desde-el-móvil) — deja que las aprobaciones te sigan fuera del escritorio.

## Cuando las opciones no se pueden parsear

En casos raros (un aviso que se desplazó fuera del scrollback de tmux antes de que purplemux pudiera leerlo), la lista de opciones vuelve vacía. La línea de tiempo muestra una tarjeta "no se pudo leer el aviso" y reintenta hasta cuatro veces con backoff. Si aun así falla, cambia al modo **Terminal** de esa pestaña y responde en el CLI crudo — el proceso de Claude subyacente sigue esperando.

## ¿Y los recordatorios de inactividad?

Los otros tipos de notificación de Claude — por ejemplo, recordatorios de inactividad — siguen llegando al endpoint del hook. El servidor los registra pero no cambia el estado de la pestaña, no envía push ni muestra UI. Es intencional: solo los eventos que *bloquean* a Claude necesitan tu atención.

## Siguientes pasos

- **[Estado de la sesión](/purplemux/es/docs/session-status/)** — qué significa el estado **necesita-entrada** y cómo se detecta.
- **[Vista de sesión en directo](/purplemux/es/docs/live-session-view/)** — donde se renderiza el aviso en línea.
- **[Compatibilidad de navegadores](/purplemux/es/docs/browser-support/)** — requisitos de Web Push (especialmente iOS Safari 16.4+).
