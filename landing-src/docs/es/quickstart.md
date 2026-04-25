---
title: Inicio rápido
description: Pon en marcha purplemux en menos de un minuto con Node.js y tmux.
eyebrow: Primeros pasos
permalink: /es/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux es un multiplexor nativo de la web que gestiona todas tus sesiones de Claude Code en un mismo panel, respaldado por `tmux` para mantenerlas vivas, y pensado para usarse tanto desde tu escritorio como desde tu móvil.

## Antes de empezar

Necesitas dos cosas en la máquina que va a alojar purplemux.

- **Node.js 20 o superior** — verifica con `node -v`.
- **tmux** — verifica con `tmux -V`. Cualquier versión 3.0+ sirve.

{% call callout('note', 'Solo macOS / Linux') %}
Windows no está soportado oficialmente. purplemux depende de `node-pty` y tmux, que no funcionan de forma nativa en Windows. WSL2 suele funcionar, pero queda fuera de nuestra matriz de pruebas.
{% endcall %}

## Ejecutar

Un solo comando. Sin instalación global.

```bash
npx purplemux
```

Verás que purplemux arranca en el puerto `8022`. Abre el navegador:

```
http://localhost:8022
```

El primer arranque te guía para crear una contraseña y tu primer espacio de trabajo.

{% call callout('tip') %}
¿Prefieres una instalación persistente? `pnpm add -g purplemux && purplemux` funciona igual. Las actualizaciones son un `pnpm up -g purplemux` de distancia.
{% endcall %}

## Abre una sesión de Claude

Desde el panel:

1. Haz clic en **Nueva pestaña** dentro de cualquier espacio de trabajo.
2. Elige la plantilla **Claude** (o ejecuta `claude` en una terminal normal).
3. purplemux detecta el CLI de Claude en marcha y empieza a mostrar el estado, la línea de tiempo en directo y los avisos de permisos.

Tu sesión persistirá aunque cierres el navegador — tmux mantiene el proceso vivo en el servidor.

## Acceder desde el móvil

Por defecto, purplemux solo escucha en `localhost`. Para un acceso externo seguro, usa Tailscale Serve (WireGuard + HTTPS automático, sin redireccionar puertos):

```bash
tailscale serve --bg 8022
```

Abre `https://<machine>.<tailnet>.ts.net` en el móvil, toca **Compartir → Añadir a pantalla de inicio**, y purplemux se convertirá en una PWA que recibe notificaciones Web Push en segundo plano.

Consulta [Acceso por Tailscale](/purplemux/es/docs/tailscale/) para la configuración completa, o salta a [Configuración de PWA](/purplemux/es/docs/pwa-setup/) para los detalles de iOS y Android.

## Siguientes pasos

- **[Instalación](/purplemux/es/docs/installation/)** — detalles por plataforma, app nativa para macOS, autoarranque.
- **[Compatibilidad de navegadores](/purplemux/es/docs/browser-support/)** — matriz de compatibilidad de escritorio y móvil.
- **[Primera sesión](/purplemux/es/docs/first-session/)** — un recorrido guiado por el panel.
- **[Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/)** — todos los atajos en una sola tabla.
