---
title: Architektur
description: Wie Browser, Node.js-Server, tmux und die Claude-CLI zusammenpassen.
eyebrow: Referenz
permalink: /de/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux sind drei zusammengenähte Schichten: ein Browser-Frontend, ein Node.js-Server auf `:8022` und tmux + die Claude-CLI auf dem Host. Alles dazwischen ist entweder ein binärer WebSocket oder ein kleiner HTTP-POST.

## Die drei Schichten

```
Browser                         Node.js-Server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple-Socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL-Watcher ──liest── ~/.claude/projects/**/*.jsonl
```

Jeder WebSocket hat einen einzigen Zweck; sie multiplexen nicht. Authentifizierung ist ein NextAuth-JWT-Cookie, der beim WS-Upgrade verifiziert wird.

## Browser

Das Frontend ist eine Next.js-(Pages-Router-)App. Die Teile, die mit dem Server reden:

| Komponente | Bibliothek | Zweck |
|---|---|---|
| Terminal-Panel | `xterm.js` | Rendert Bytes von `/api/terminal`. Emittiert Tastendrücke, Resize-Events, Title-Changes (`onTitleChange`). |
| Session-Timeline | React + `useTimeline` | Rendert Claude-Turns von `/api/timeline`. Keine `cliState`-Ableitung — das ist alles server-seitig. |
| Status-Indikatoren | Zustand `useTabStore` | Tab-Badges, Sidebar-Punkte, Notification-Counts, getrieben durch `/api/status`-Nachrichten. |
| Multi-Device-Sync | `useSyncClient` | Beobachtet Workspace-/Layout-Edits von einem anderen Gerät via `/api/sync`. |

Tab-Titel und der Vordergrundprozess kommen aus xterm.js' `onTitleChange`-Event — tmux ist (`src/config/tmux.conf`) so konfiguriert, dass es alle zwei Sekunden `#{pane_current_command}|#{pane_current_path}` emittiert, und `lib/tab-title.ts` parst das.

## Node.js-Server

`server.ts` ist ein Custom-HTTP-Server, der Next.js plus vier `ws`-`WebSocketServer`-Instanzen auf demselben Port hostet.

### WebSocket-Endpunkte

| Pfad | Handler | Richtung | Zweck |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | bidirektional, binär | Terminal-I/O via `node-pty`, an eine tmux-Session gebunden |
| `/api/timeline` | `timeline-server.ts` | Server → Client | Streamt Claude-Session-Einträge, geparst aus JSONL |
| `/api/status` | `status-server.ts` | bidirektional, JSON | `status:sync` / `status:update` / `status:hook-event` vom Server, `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` vom Client |
| `/api/sync` | `sync-server.ts` | bidirektional, JSON | Cross-Device-Workspace-State |

Plus `/api/install` für den First-Run-Installer (keine Auth nötig).

### Terminal-Binärprotokoll

`/api/terminal` nutzt ein winziges Binärprotokoll, definiert in `src/lib/terminal-protocol.ts`:

| Code | Name | Richtung | Payload |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | Client → Server | Key-Bytes |
| `0x01` | `MSG_STDOUT` | Server → Client | Terminal-Output |
| `0x02` | `MSG_RESIZE` | Client → Server | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | beide | 30 s Intervall, 90 s Timeout |
| `0x04` | `MSG_KILL_SESSION` | Client → Server | Beendet die zugrundeliegende tmux-Session |
| `0x05` | `MSG_WEB_STDIN` | Client → Server | Web-Eingabeleisten-Text (geliefert nach Copy-Mode-Ausstieg) |

Backpressure: `pty.pause` wenn WS `bufferedAmount > 1 MB`, Resume unter `256 KB`. Maximal 32 gleichzeitige Verbindungen pro Server, älteste werden darüber hinaus verworfen.

### Status-Manager

`src/lib/status-manager.ts` ist die einzige Quelle der Wahrheit für `cliState`. Hook-Events fließen durch `/api/status/hook` (token-authentifiziertes POST), werden sequenziert (`eventSeq` pro Tab) und durch `deriveStateFromEvent` zu `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` reduziert. Der JSONL-Watcher aktualisiert nur Metadaten, mit Ausnahme eines synthetischen `interrupt`-Events.

Für die vollständige State-Machine siehe [Session-Status (STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md).

## tmux-Schicht

purplemux betreibt ein isoliertes tmux auf einem dedizierten Socket — `-L purple` — mit eigener Config in `src/config/tmux.conf`. Deine `~/.tmux.conf` wird nie gelesen.

Sessions heißen `pt-{workspaceId}-{paneId}-{tabId}`. Ein Terminal-Panel im Browser entspricht einer tmux-Session, angebunden via `node-pty`.

```
tmux-Socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← Browser-Tab 1
├── pt-ws-MMKl07-pa-1-tb-2   ← Browser-Tab 2
└── pt-ws-MMKl07-pa-2-tb-1   ← Split-Panel, Tab 1
```

`prefix` ist deaktiviert, die Status-Bar ist aus (xterm.js zeichnet das Chrome), `set-titles` ist an, und `mouse on` legt das Mausrad in den Copy-Modus. tmux ist der Grund, warum Sessions einen geschlossenen Browser, einen WLAN-Drop oder einen Server-Restart überleben.

Für das vollständige tmux-Setup, den Command-Wrapper und die Prozess-Detection siehe [tmux & Prozess-Detection (TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md).

## Claude-CLI-Integration

purplemux forkt oder wrappt Claude nicht — das `claude`-Binary ist genau das, was du installiert hast. Zwei Dinge werden ergänzt:

1. **Hook-Settings** — beim Startup schreibt `ensureHookSettings()` `~/.purplemux/hooks.json`, `status-hook.sh` und `statusline.sh`. Jeder Claude-Tab startet mit `--settings ~/.purplemux/hooks.json`, sodass `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `PreCompact`, `PostCompact` alle an den Server zurück-POSTen.
2. **JSONL-Reads** — `~/.claude/projects/**/*.jsonl` wird von `timeline-server.ts` für die Live-Konversations-Ansicht geparst und von `session-detection.ts` beobachtet, um einen laufenden Claude-Prozess über die PID-Dateien unter `~/.claude/sessions/` zu erkennen.

Hook-Skripte lesen `~/.purplemux/port` und `~/.purplemux/cli-token` und POSTen mit `x-pmux-token`. Sie schlagen still fehl, wenn der Server down ist, sodass das Schließen von purplemux während Claude läuft nichts crasht.

## Startup-Sequenz

`server.ts:start()` läuft diese in Reihenfolge durch:

1. `acquireLock(port)` — Single-Instance-Guard via `~/.purplemux/pmux.lock`
2. `initConfigStore()` + `initShellPath()` (löst den Login-Shell-`PATH` des Users auf)
3. `initAuthCredentials()` — lädt scrypt-gehashtes Passwort und HMAC-Secret in die Env
4. `scanSessions()` + `applyConfig()` — räumt tote tmux-Sessions auf, wendet `tmux.conf` an
5. `initWorkspaceStore()` — lädt `workspaces.json` und pro-Workspace-`layout.json`
6. `autoResumeOnStartup()` — startet Shells in gespeicherten Verzeichnissen neu, versucht Claude-Resume
7. `getStatusManager().init()` — startet das Metadaten-Polling
8. `app.prepare()` (Next.js dev) oder `require('.next/standalone/server.js')` (prod)
9. `listenWithFallback()` auf `bindPlan.host:port` (`0.0.0.0` oder `127.0.0.1` je nach Access-Policy)
10. `ensureHookSettings(result.port)` — schreibt oder aktualisiert Hook-Skripte mit dem tatsächlichen Port
11. `getCliToken()` — liest oder generiert `~/.purplemux/cli-token`
12. `writeAllClaudePromptFiles()` — refreshet jedes Workspace-`claude-prompt.md`

Das Fenster zwischen Port-Auflösung und Schritt 10 ist der Grund, warum Hook-Skripte bei jedem Start regeneriert werden: Sie brauchen den Live-Port eingebrannt.

## Custom-Server vs. Next.js-Modul-Graph

{% call callout('warning', 'Zwei Modul-Graphen in einem Prozess') %}
Der Outer-Custom-Server (`server.ts`) und Next.js (Pages + API-Routes) teilen sich einen Node-Prozess, aber **nicht** ihre Modul-Graphen. Alles unter `src/lib/*`, das von beiden Seiten importiert wird, wird zweimal instanziiert. Singletons, die geteilt werden müssen (StatusManager, WebSocket-Client-Sets, CLI-Token, File-Write-Locks), hängen an `globalThis.__pt*`-Keys. Siehe `CLAUDE.md §18` für die vollständige Begründung.
{% endcall %}

## Wo du mehr lesen kannst

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — tmux-Config, Command-Wrapper, Process-Tree-Walking, Terminal-Binärprotokoll.
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — Claude-CLI-State-Machine, Hook-Flow, synthetisches Interrupt-Event, JSONL-Watcher.
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — jede Datei, die purplemux schreibt.

## Wie es weitergeht

- **[Daten-Verzeichnis](/purplemux/de/docs/data-directory/)** — jede Datei, die die obige Architektur berührt.
- **[CLI-Referenz](/purplemux/de/docs/cli-reference/)** — von außerhalb des Browsers mit dem Server reden.
- **[Troubleshooting](/purplemux/de/docs/troubleshooting/)** — diagnostizieren, wenn etwas hier daneben läuft.
