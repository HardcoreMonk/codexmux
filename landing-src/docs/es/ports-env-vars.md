---
title: Puertos y variables de entorno
description: Cada puerto que purplemux abre y cada variable de entorno que influye en cómo corre.
eyebrow: Referencia
permalink: /es/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux pretende ser una instalación de una sola línea, pero el runtime es configurable. Esta página lista cada puerto que abre y cada variable de entorno que el servidor lee.

## Puertos

| Puerto | Por defecto | Sobrescribir | Notas |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux` | Si `8022` ya está en uso, el servidor avisa con un warning y enlaza a un puerto libre aleatorio. |
| Next.js interno (producción) | aleatorio | — | En `pnpm start` / `purplemux start` el servidor exterior hace proxy a un Next.js standalone enlazado a `127.0.0.1:<aleatorio>`. No expuesto. |

`8022` es `web` + `ssh` pegados. La elección es humor, no protocolo.

{% call callout('note', 'La interfaz enlazada sigue la política de acceso') %}
purplemux solo enlaza a `0.0.0.0` si la política de acceso permite clientes externos. Las configuraciones solo-localhost enlazan a `127.0.0.1` para que otras máquinas de la LAN ni siquiera puedan abrir una conexión TCP. Consulta `HOST` abajo.
{% endcall %}

## Variables de entorno del servidor

Leídas por `server.ts` y los módulos que carga al arrancar.

| Variable | Por defecto | Efecto |
|---|---|---|
| `PORT` | `8022` | Puerto de escucha HTTP/WS. Cae a un puerto aleatorio en `EADDRINUSE`. |
| `HOST` | sin definir | Spec separado por comas de CIDR/keyword para qué clientes están permitidos. Keywords: `localhost`, `tailscale`, `lan`, `all` (o `*` / `0.0.0.0`). Ejemplos: `HOST=localhost`, `HOST=localhost,tailscale`, `HOST=10.0.0.0/8,localhost`. Cuando se define vía env, el **Configuración → Acceso de red** dentro de la app queda bloqueado. |
| `NODE_ENV` | `production` (en `purplemux start`), `development` (en `pnpm dev`) | Selecciona entre el pipeline de dev (`tsx watch`, Next dev) y el de prod (bundle de `tsup` haciendo proxy al standalone de Next). |
| `__PMUX_APP_DIR` | `process.cwd()` | Sobrescribe el directorio que contiene `dist/server.js` y `.next/standalone/`. Lo establece automáticamente `bin/purplemux.js`; normalmente no deberías tocarlo. |
| `__PMUX_APP_DIR_UNPACKED` | sin definir | Variante de `__PMUX_APP_DIR` para la ruta asar-unpacked dentro de la app Electron de macOS. |
| `__PMUX_ELECTRON` | sin definir | Cuando el proceso main de Electron arranca el servidor in-process, lo establece para que `server.ts` salte el auto `start()` y deje que Electron dirija el ciclo de vida. |
| `PURPLEMUX_CLI` | `1` (lo establece `bin/purplemux.js`) | Marcador para que módulos compartidos sepan que el proceso es el CLI/servidor, no Electron. Usado por `pristine-env.ts`. |
| `__PMUX_PRISTINE_ENV` | sin definir | Snapshot JSON del env del shell padre, capturado por `bin/purplemux.js` para que los procesos hijos (claude, tmux) hereden el `PATH` del usuario en lugar de uno saneado. Interno — se establece automáticamente. |
| `AUTH_PASSWORD` | sin definir | Lo establece el servidor desde el hash scrypt de `config.json` antes de que arranque Next. NextAuth lo lee de ahí. No lo pongas manualmente. |
| `NEXTAUTH_SECRET` | sin definir | Misma historia — se rellena desde `config.json` al arrancar. |

## Variables de entorno de logging

Leídas por `src/lib/logger.ts`.

| Variable | Por defecto | Efecto |
|---|---|---|
| `LOG_LEVEL` | `info` | Nivel raíz para todo lo que no esté en `LOG_LEVELS`. |
| `LOG_LEVELS` | sin definir | Sobrescrituras por módulo como pares `name=level` separados por comas. |

Niveles, en orden: `trace` · `debug` · `info` · `warn` · `error` · `fatal`.

```bash
LOG_LEVEL=debug purplemux

# solo depurar el módulo de hook de Claude
LOG_LEVELS=hooks=debug purplemux

# varios módulos a la vez
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux
```

Los nombres de módulo más útiles:

| Módulo | Fuente | Qué ves |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`, partes de `status-manager.ts` | Recepción/proceso de hook, transiciones de estado |
| `status` | `status-manager.ts` | Polling, watcher de JSONL, broadcast |
| `tmux` | `lib/tmux.ts` | Cada comando tmux y su resultado |
| `server`, `lock`, etc. | `lib/*.ts` correspondientes | Ciclo de vida del proceso |

Los archivos de log aterrizan en `~/.purplemux/logs/` independientemente del nivel.

## Archivos (equivalentes a env)

Algunos valores se comportan como variables de entorno pero viven en disco para que el CLI y los scripts de hook puedan encontrarlos sin un handshake:

| Archivo | Contiene | Usado por |
|---|---|---|
| `~/.purplemux/port` | puerto actual del servidor (texto plano) | `bin/cli.js`, `status-hook.sh`, `statusline.sh` |
| `~/.purplemux/cli-token` | token CLI hex de 32 bytes | `bin/cli.js`, scripts de hook (enviado como `x-pmux-token`) |

El CLI también acepta estos vía env, que tienen precedencia:

| Variable | Por defecto | Efecto |
|---|---|---|
| `PMUX_PORT` | contenido de `~/.purplemux/port` | Puerto al que habla el CLI. |
| `PMUX_TOKEN` | contenido de `~/.purplemux/cli-token` | Bearer token enviado como `x-pmux-token`. |

Consulta [Referencia del CLI](/purplemux/es/docs/cli-reference/) para la superficie completa.

## Combinándolo todo

Algunas combinaciones comunes:

```bash
# Por defecto: solo localhost, puerto 8022
purplemux

# Enlazar en todas partes (LAN + Tailscale + remoto)
HOST=all purplemux

# Solo localhost + Tailscale
HOST=localhost,tailscale purplemux

# Puerto personalizado + tracing detallado de hooks
PORT=9000 LOG_LEVELS=hooks=debug purplemux

# Combo total para debug
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux
```

{% call callout('tip') %}
Para una instalación persistente, define estos en el bloque `Environment=` de tu unidad launchd / systemd. Consulta [Instalación](/purplemux/es/docs/installation/#arranque-al-inicio) para un ejemplo de archivo de unidad.
{% endcall %}

## Siguientes pasos

- **[Instalación](/purplemux/es/docs/installation/)** — donde suelen ir estas variables.
- **[Directorio de datos](/purplemux/es/docs/data-directory/)** — cómo `port` y `cli-token` interactúan con los scripts de hook.
- **[Referencia del CLI](/purplemux/es/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` en contexto.
