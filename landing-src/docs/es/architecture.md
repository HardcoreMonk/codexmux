---
title: Arquitectura
description: Cómo encajan el navegador, el servidor de Node.js, tmux y el CLI de Claude.
eyebrow: Referencia
permalink: /es/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux son tres capas cosidas: un front-end de navegador, un servidor Node.js en `:8022`, y tmux + el CLI de Claude en el host. Todo lo que pasa entre ellos es o un WebSocket binario o un pequeño POST HTTP.

## Las tres capas

```
Navegador                       Servidor Node.js (:8022)          Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (socket purple)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──lee── ~/.claude/projects/**/*.jsonl
```

Cada WebSocket tiene un único propósito; no se multiplexan. La autenticación es una cookie JWT de NextAuth verificada durante el upgrade del WS.

## Navegador

El front-end es una app Next.js (Pages Router). Las piezas que hablan con el servidor:

| Componente | Librería | Propósito |
|---|---|---|
| Panel de terminal | `xterm.js` | Renderiza bytes de `/api/terminal`. Emite pulsaciones, eventos de redimensionado, cambios de título (`onTitleChange`). |
| Línea de tiempo de sesión | React + `useTimeline` | Renderiza turnos de Claude desde `/api/timeline`. Sin derivación de `cliState` — eso es todo del lado del servidor. |
| Indicadores de estado | Zustand `useTabStore` | Insignias de pestaña, puntos de barra lateral, conteos de notificaciones dirigidos por mensajes de `/api/status`. |
| Sincronización multi-dispositivo | `useSyncClient` | Vigila ediciones de espacio/disposición hechas en otro dispositivo vía `/api/sync`. |

Los títulos de pestaña y el proceso en primer plano vienen del evento `onTitleChange` de xterm.js — tmux está configurado (`src/config/tmux.conf`) para emitir `#{pane_current_command}|#{pane_current_path}` cada dos segundos, y `lib/tab-title.ts` lo parsea.

## Servidor Node.js

`server.ts` es un servidor HTTP personalizado que aloja Next.js más cuatro instancias `WebSocketServer` de `ws` en el mismo puerto.

### Endpoints WebSocket

| Ruta | Handler | Dirección | Uso |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | bidireccional, binario | E/S de terminal vía `node-pty` adjuntado a una sesión tmux |
| `/api/timeline` | `timeline-server.ts` | servidor → cliente | Stream de entradas de sesión Claude parseadas desde JSONL |
| `/api/status` | `status-server.ts` | bidireccional, JSON | `status:sync` / `status:update` / `status:hook-event` desde el servidor, `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` desde el cliente |
| `/api/sync` | `sync-server.ts` | bidireccional, JSON | Estado de espacio de trabajo entre dispositivos |

Más `/api/install` para el instalador de primer uso (sin auth requerida).

### Protocolo binario de terminal

`/api/terminal` usa un pequeño protocolo binario definido en `src/lib/terminal-protocol.ts`:

| Código | Nombre | Dirección | Carga útil |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | cliente → servidor | Bytes de teclas |
| `0x01` | `MSG_STDOUT` | servidor → cliente | Salida de terminal |
| `0x02` | `MSG_RESIZE` | cliente → servidor | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | ambos | Intervalo 30 s, timeout 90 s |
| `0x04` | `MSG_KILL_SESSION` | cliente → servidor | Terminar la sesión tmux subyacente |
| `0x05` | `MSG_WEB_STDIN` | cliente → servidor | Texto de la barra de input web (entregado tras salir del modo copy) |

Backpressure: `pty.pause` cuando el `bufferedAmount` del WS > 1 MB, reanudar bajo 256 KB. Como máximo 32 conexiones concurrentes por servidor, descartando la más antigua si se supera.

### Status manager

`src/lib/status-manager.ts` es la fuente única de verdad para `cliState`. Los eventos de hook fluyen por `/api/status/hook` (POST autenticado por token), se secuencian (`eventSeq` por pestaña) y se reducen a `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` por `deriveStateFromEvent`. El watcher JSONL solo actualiza metadatos excepto por un evento sintético `interrupt`.

Para la máquina de estados completa consulta [Estado de la sesión (STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md).

## Capa tmux

purplemux ejecuta un tmux aislado sobre un socket dedicado — `-L purple` — usando su propia config en `src/config/tmux.conf`. Tu `~/.tmux.conf` nunca se lee.

Las sesiones se llaman `pt-{workspaceId}-{paneId}-{tabId}`. Un panel de terminal en el navegador se mapea a una sesión tmux, anclada vía `node-pty`.

```
socket tmux: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← pestaña 1 del navegador
├── pt-ws-MMKl07-pa-1-tb-2   ← pestaña 2 del navegador
└── pt-ws-MMKl07-pa-2-tb-1   ← panel dividido, pestaña 1
```

`prefix` está desactivado, la barra de estado off (xterm.js dibuja el chrome), `set-titles` on, y `mouse on` pone la rueda en modo copy. tmux es la razón por la que las sesiones sobreviven a un navegador cerrado, una caída de Wi-Fi o un reinicio del servidor.

Para la configuración tmux completa, el wrapper de comandos y los detalles de detección de procesos consulta [tmux y detección de procesos (TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md).

## Integración con el CLI de Claude

purplemux no hace fork ni envuelve a Claude — el binario `claude` es el que tengas instalado. Se añaden dos cosas:

1. **Configuración de hook** — al arrancar, `ensureHookSettings()` escribe `~/.purplemux/hooks.json`, `status-hook.sh` y `statusline.sh`. Cada pestaña Claude se lanza con `--settings ~/.purplemux/hooks.json`, así `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `PreCompact`, `PostCompact` POSTean al servidor.
2. **Lecturas de JSONL** — `~/.claude/projects/**/*.jsonl` lo parsea `timeline-server.ts` para la vista de conversación en directo, y lo observa `session-detection.ts` para detectar un proceso Claude en marcha vía los archivos PID en `~/.claude/sessions/`.

Los scripts de hook leen `~/.purplemux/port` y `~/.purplemux/cli-token` y POSTean con `x-pmux-token`. Fallan en silencio si el servidor está caído, así que cerrar purplemux mientras Claude corre no rompe nada.

## Secuencia de arranque

`server.ts:start()` ejecuta esto en orden:

1. `acquireLock(port)` — guarda de instancia única vía `~/.purplemux/pmux.lock`
2. `initConfigStore()` + `initShellPath()` (resuelve el `PATH` del shell de login del usuario)
3. `initAuthCredentials()` — carga la contraseña hasheada con scrypt y el secreto HMAC en el env
4. `scanSessions()` + `applyConfig()` — limpia sesiones tmux muertas, aplica `tmux.conf`
5. `initWorkspaceStore()` — carga `workspaces.json` y los `layout.json` por espacio
6. `autoResumeOnStartup()` — relanza shells en directorios guardados, intenta resume de Claude
7. `getStatusManager().init()` — arranca el polling de metadatos
8. `app.prepare()` (Next.js dev) o `require('.next/standalone/server.js')` (prod)
9. `listenWithFallback()` en `bindPlan.host:port` (`0.0.0.0` o `127.0.0.1` según política)
10. `ensureHookSettings(result.port)` — escribe o refresca scripts de hook con el puerto real
11. `getCliToken()` — lee o genera `~/.purplemux/cli-token`
12. `writeAllClaudePromptFiles()` — refresca el `claude-prompt.md` de cada espacio

La ventana entre la resolución del puerto y el paso 10 es por la que los scripts de hook se regeneran en cada arranque: necesitan tener el puerto real metido.

## Servidor personalizado vs. grafo de módulos de Next.js

{% call callout('warning', 'Dos grafos de módulos en un proceso') %}
El servidor exterior personalizado (`server.ts`) y Next.js (pages + API routes) comparten un proceso de Node pero **no** sus grafos de módulos. Cualquier cosa bajo `src/lib/*` importada desde ambos lados se instancia dos veces. Los singletons que necesitan compartirse (el StatusManager, los sets de clientes WebSocket, el token CLI, los locks de escritura de archivos) cuelgan de claves `globalThis.__pt*`. Consulta `CLAUDE.md §18` para la justificación completa.
{% endcall %}

## Dónde leer más

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — config tmux, wrapper de comandos, recorrido del árbol de procesos, protocolo binario de terminal.
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — máquina de estados del CLI de Claude, flujo de hook, evento de interrupción sintético, watcher JSONL.
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — cada archivo que escribe purplemux.

## Siguientes pasos

- **[Directorio de datos](/purplemux/es/docs/data-directory/)** — cada archivo que la arquitectura anterior toca.
- **[Referencia del CLI](/purplemux/es/docs/cli-reference/)** — hablar con el servidor desde fuera del navegador.
- **[Solución de problemas](/purplemux/es/docs/troubleshooting/)** — diagnosticar cuando algo aquí se porta mal.
