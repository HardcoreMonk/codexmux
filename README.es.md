# purplemux

**Claude Code, muchas tareas a la vez. Más rápido.**

Todas tus sesiones en una sola pantalla. Sin interrupciones, incluso desde el móvil.

<a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | Español | <a href="README.fr.md">Français</a> | <a href="README.ru.md">Русский</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.tr.md">Türkçe</a>

![purplemux](docs/images/screenshot.png)

## Instalación

```bash
npx purplemux
```

Abre [http://localhost:8022](http://localhost:8022) en tu navegador. Listo.

> Requiere Node.js 18+ y tmux. macOS o Linux.

## Por qué purplemux

- **Panel multisesión** — Consulta de un vistazo el estado «trabajando / requiere entrada» de todas tus sesiones de Claude Code
- **Monitor de límites** — Saldo de 5 horas / 7 días y cuenta atrás para el reinicio
- **Notificaciones push** — Avisos de escritorio y móvil cuando una tarea termina o requiere entrada
- **Móvil y multi-dispositivo** — Accede a la misma sesión desde el teléfono, la tablet u otro escritorio
- **Vista en vivo de la sesión** — Deja de desplazarte por la salida de la CLI: el progreso se organiza como una línea temporal

Además

- **Sesiones sin interrupciones** — Basado en tmux. Cierra el navegador y todo queda intacto. Al reconectarte, tus pestañas, paneles y directorios están exactamente donde los dejaste
- **Autoalojado y de código abierto** — El código y los datos de sesión nunca salen de tu máquina. Sin servidores externos
- **Acceso remoto cifrado** — HTTPS desde cualquier lugar vía Tailscale

## Diferencias con el Remote Control oficial

> El Remote Control oficial se centra en el control remoto de una única sesión. Usa purplemux cuando necesites gestión multisesión, notificaciones push y persistencia de sesiones.

## Características

### Terminal

- **Paneles divididos** — División horizontal / vertical libre, redimensionables con arrastrar
- **Gestión de pestañas** — Múltiples pestañas, reordenación por arrastre, títulos automáticos basados en el nombre del proceso
- **Atajos de teclado** — División, cambio de pestaña, movimiento de foco
- **Temas de terminal** — Modo oscuro / claro y varios esquemas de color
- **Workspaces** — Guarda y restaura diseños de paneles, pestañas y directorios de trabajo por workspace
- **Visor de git diff** — Inspecciona diffs directamente en un panel del terminal. Conmuta entre Side-by-side / Line-by-line, con resaltado de sintaxis
- **Panel de navegador web** — Navegador integrado junto al terminal para comprobar la salida de desarrollo (Electron)

### Integración con Claude Code

- **Estado en tiempo real** — Indicadores de trabajando / requiere entrada y cambio entre sesiones
- **Vista en vivo de la sesión** — Mensajes, llamadas a herramientas, tareas, solicitudes de permisos y bloques de thinking
- **Reanudación en un clic** — Retoma una sesión pausada directamente desde el navegador
- **Reanudación automática** — Recupera sesiones previas de Claude al arrancar el servidor
- **Prompts rápidos** — Registra prompts frecuentes y envíalos con un clic
- **Historial de mensajes** — Reutiliza mensajes anteriores
- **Estadísticas de uso** — Tokens (input / output / cache read / cache write), coste, desglose por proyecto e informes diarios de IA
- **Rate limits** — Saldo de 5 horas / 7 días y cuenta atrás para el reinicio

### Móvil y accesibilidad

- **Interfaz responsive** — Terminal y línea temporal en móviles y tablets
- **PWA** — Añádelo a la pantalla de inicio para sentirlo como una app nativa
- **Web Push** — Recibe notificaciones aunque hayas cerrado la pestaña
- **Sincronización multi-dispositivo** — Los cambios en el workspace se reflejan en tiempo real
- **Tailscale** — Acceso HTTPS desde el exterior mediante un túnel cifrado con WireGuard
- **Autenticación por contraseña** — Hashing scrypt, seguro incluso al exponerlo al exterior
- **Multilingüe** — 11 idiomas, entre ellos 한국어, English, 日本語, 中文

### Agentes de IA (Beta)

Crea agentes de IA independientes, asígnales roles y personalidades (souls) y ejecuta tareas en paralelo con varias pestañas. Cada agente tiene su propio chat, memoria y workspace.

## Plataformas soportadas

| Plataforma | Estado | Notas |
|---|---|---|
| macOS (Apple Silicon / Intel) | ✅ | App de Electron incluida |
| Linux | ✅ | Sin Electron |
| Windows | ❌ | No soportado |

## Detalles de instalación

### Requisitos

- macOS 13+ o Linux
- [Node.js](https://nodejs.org/) 18+
- [tmux](https://github.com/tmux/tmux)

### npx (el más rápido)

```bash
npx purplemux
```

### Instalación global

```bash
npm install -g purplemux
purplemux
```

### Desde el código fuente

```bash
git clone https://github.com/subicura/purplemux.git
cd purplemux
pnpm install
pnpm start
```

Modo desarrollo:

```bash
pnpm dev
```

#### Nivel de log

Ajusta el nivel global con `LOG_LEVEL` (por defecto `info`).

```bash
LOG_LEVEL=debug pnpm dev
```

Para activar módulos concretos, lista pares `módulo=nivel` separados por comas en `LOG_LEVELS`. Niveles disponibles: `trace` / `debug` / `info` / `warn` / `error` / `fatal`.

```bash
# Rastrea sólo los hooks de Claude Code en debug
LOG_LEVELS=hooks=debug pnpm dev

# Varios módulos a la vez
LOG_LEVELS=hooks=debug,status=warn pnpm dev
```

Los módulos no listados en `LOG_LEVELS` usan el valor de `LOG_LEVEL`.

## Acceso externo (Tailscale Serve)

```bash
tailscale serve --bg 8022
```

Accede en `https://<machine>.<tailnet>.ts.net`. Para desactivarlo:

```bash
tailscale serve --bg off 8022
```

## Seguridad

### Contraseña

Define una contraseña en el primer acceso. Se guarda con hashing scrypt en `~/.purplemux/config.json`.

Para reiniciarla, elimina `~/.purplemux/config.json` y reinicia: la pantalla de onboarding volverá a aparecer.

### HTTPS

Por defecto usa HTTP. Aplica siempre HTTPS al exponer la aplicación al exterior:

- **Tailscale Serve** — Cifrado WireGuard con certificados automáticos
- **Nginx / Caddy** — Debe reenviar las cabeceras de upgrade de WebSocket (`Upgrade`, `Connection`)

### Directorio de datos (`~/.purplemux/`)

| Archivo | Descripción |
|---|---|
| `config.json` | Credenciales (hash) y ajustes de la app |
| `workspaces.json` | Diseños de workspace, pestañas y directorios |
| `vapid-keys.json` | Claves VAPID de Web Push (autogeneradas) |
| `push-subscriptions.json` | Datos de suscripción push |
| `hooks/` | Hooks definidos por el usuario |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐   │
│  │  xterm.js │ │ Timeline  │ │ Status   │ │ Multi-device│   │
│  │  Terminal │ │           │ │          │ │ Sync        │   │
│  └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘   │
└────────┼─────────────┼────────────┼──────────────┼──────────┘
         │ws           │ws          │ws            │ws
         │/terminal    │/timeline   │/status       │/sync
         ▼             ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Server (:8022)                                     │
│  ┌──────────┐  ┌───────────────┐  ┌─────────────────────┐   │
│  │ node-pty │  │ JSONL Watcher │  │ Status Manager      │   │
│  │ PTY↔WS   │  │ File watch →  │  │ Process tree +      │   │
│  │ Binary   │  │ Parse → Send  │  │ JSONL tail analysis │   │
│  └────┬─────┘  └───────┬───────┘  └──────────┬──────────┘   │
└───────┼────────────────┼─────────────────────┼──────────────┘
        ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  System                                                     │
│  tmux (purple socket)         Claude Code                   │
│  ┌────────┐ ┌────────┐       ┌────────────────────────────┐ │
│  │Session1│ │Session2│  ...  │ ~/.claude/sessions/        │ │
│  │ (shell)│ │ (shell)│       │ ~/.claude/projects/        │ │
│  └────────┘ └────────┘       │   └─ {project}/{sid}.jsonl │ │
│                              └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**E/S del terminal** — xterm.js se conecta a node-pty mediante WebSocket y node-pty se acopla a las sesiones de tmux. Un protocolo binario gestiona stdin/stdout/resize con control de backpressure.

**Detección de estado** — Los hooks de eventos de Claude Code (`SessionStart`, `Stop`, `Notification`) envían actualizaciones inmediatas por HTTP POST. Cada 5–15 s se inspeccionan los árboles de procesos y se analizan los últimos 8 KB de los archivos JSONL.

**Timeline** — Observa los logs JSONL de sesiones bajo `~/.claude/projects/`, parsea las nuevas líneas al cambiar el archivo y envía entradas estructuradas al navegador.

**Aislamiento tmux** — Usa un socket `purple` dedicado, totalmente separado de tu tmux actual. Sin tecla prefix ni barra de estado.

**Recuperación automática** — Al iniciar el servidor, restaura las sesiones previas de Claude con `claude --resume {sessionId}`.

## License

[MIT](LICENSE)
