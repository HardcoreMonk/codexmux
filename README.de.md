# purplemux

**Claude Code, viele Aufgaben gleichzeitig. Schneller.**

Alle Sessions auf einem Bildschirm. Unterbrechungsfrei, auch auf dem Handy.

<a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | Deutsch | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.ru.md">Русский</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.tr.md">Türkçe</a>

![purplemux](docs/images/screenshot.png)

## Installation

```bash
npx purplemux
```

Öffne [http://localhost:8022](http://localhost:8022) im Browser. Fertig.

> Erfordert Node.js 18+ und tmux. macOS oder Linux.

## Warum purplemux

- **Multi-Session-Dashboard** — Behalte „arbeitet / wartet auf Eingabe"-Status aller Claude-Code-Sessions auf einen Blick im Überblick
- **Rate-Limit-Überwachung** — Restkontingent für 5 Stunden / 7 Tage samt Reset-Countdown
- **Push-Benachrichtigungen** — Desktop- und Mobile-Hinweise, wenn eine Aufgabe fertig ist oder Eingaben nötig sind
- **Mobil & geräteübergreifend** — Dieselbe Session vom Handy, Tablet oder einem anderen Desktop aus erreichen
- **Live-Session-Ansicht** — Kein Scrollen durch CLI-Ausgaben mehr. Der Fortschritt wird als Timeline aufbereitet

Außerdem

- **Unterbrechungsfreie Sessions** — Basiert auf tmux. Browser schließen, und alles bleibt wie es war. Beim Wiederverbinden sind Tabs, Panels und Verzeichnisse exakt dort, wo du aufgehört hast
- **Selbst gehostet & Open Source** — Code und Session-Daten verlassen deine Maschine nie. Keine externen Server
- **Verschlüsselter Fernzugriff** — HTTPS von überall über Tailscale

## Unterschied zur offiziellen Remote Control

> Die offizielle Remote Control konzentriert sich auf die Fernsteuerung einer einzelnen Session. purplemux ist das Richtige, wenn du Multi-Session-Management, Push-Benachrichtigungen und persistente Sessions brauchst.

## Funktionen

### Terminal

- **Panel-Splits** — Horizontal / vertikal frei teilen, Größe per Drag verändern
- **Tab-Management** — Mehrere Tabs, Reihenfolge per Drag, automatische Titel auf Basis der Prozessnamen
- **Tastenkürzel** — Splits, Tab-Wechsel, Fokusbewegung
- **Terminal-Themes** — Dark-/Light-Modus, mehrere Farbschemata
- **Workspaces** — Panel-Layouts, Tabs und Arbeitsverzeichnisse pro Workspace speichern und wiederherstellen
- **Git-Diff-Viewer** — Git-Diffs direkt im Terminal-Panel einsehen. Umschaltbar zwischen Side-by-side / Line-by-line, mit Syntax-Highlighting
- **Webbrowser-Panel** — Eingebetteter Browser neben dem Terminal zum Prüfen der Entwicklungsausgabe (Electron)

### Claude-Code-Integration

- **Echtzeit-Status** — „Arbeitet / wartet auf Eingabe"-Anzeigen, Wechsel zwischen Sessions
- **Live-Session-Ansicht** — Nachrichten, Tool-Aufrufe, Tasks, Berechtigungsanfragen, Thinking-Blöcke
- **Ein-Klick-Resume** — Unterbrochene Sessions direkt im Browser wieder aufnehmen
- **Auto-Resume** — Stellt beim Serverstart vorherige Claude-Sessions automatisch wieder her
- **Schnell-Prompts** — Häufig genutzte Prompts hinterlegen und mit einem Klick senden
- **Nachrichtenverlauf** — Frühere Nachrichten wiederverwenden
- **Nutzungsstatistik** — Tokens (input / output / cache read / cache write), Kosten, Auswertung pro Projekt, tägliche KI-Berichte
- **Rate-Limits** — Restkontingent 5 Stunden / 7 Tage mit Reset-Countdown

### Mobil & Zugänglichkeit

- **Responsive UI** — Terminal und Timeline auf Handys und Tablets
- **PWA** — Zum Home-Bildschirm hinzufügen für ein natives App-Gefühl
- **Web Push** — Benachrichtigungen auch dann, wenn der Tab geschlossen ist
- **Multi-Device-Sync** — Workspace-Änderungen werden in Echtzeit übernommen
- **Tailscale** — HTTPS-Zugriff von außen über einen WireGuard-verschlüsselten Tunnel
- **Passwort-Authentifizierung** — scrypt-Hashing, sicher auch bei externer Exposition
- **Mehrsprachig** — 11 Sprachen inklusive 한국어, English, 日本語, 中文

### KI-Agenten (Beta)

Lege eigenständige KI-Agenten an, weise ihnen Rollen und Persönlichkeiten (souls) zu und führe Aufgaben parallel über mehrere Tabs aus. Jeder Agent besitzt eigenen Chat, Speicher und Workspace.

## Unterstützte Plattformen

| Plattform | Status | Hinweise |
|---|---|---|
| macOS (Apple Silicon / Intel) | ✅ | Electron-App inklusive |
| Linux | ✅ | Ohne Electron |
| Windows | ❌ | Nicht unterstützt |

## Installationsdetails

### Voraussetzungen

- macOS 13+ oder Linux
- [Node.js](https://nodejs.org/) 18+
- [tmux](https://github.com/tmux/tmux)

### npx (am schnellsten)

```bash
npx purplemux
```

### Globale Installation

```bash
npm install -g purplemux
purplemux
```

### Aus dem Quellcode

```bash
git clone https://github.com/subicura/purplemux.git
cd purplemux
pnpm install
pnpm start
```

Entwicklungsmodus:

```bash
pnpm dev
```

#### Log-Level

Das Gesamt-Level wird über `LOG_LEVEL` (Standard `info`) eingestellt.

```bash
LOG_LEVEL=debug pnpm dev
```

Um nur bestimmte Module zu aktivieren, liste `modul=level`-Paare kommagetrennt in `LOG_LEVELS` auf. Verfügbare Level: `trace` / `debug` / `info` / `warn` / `error` / `fatal`.

```bash
# Nur das Verhalten der Claude-Code-Hooks auf debug verfolgen
LOG_LEVELS=hooks=debug pnpm dev

# Mehrere Module gleichzeitig
LOG_LEVELS=hooks=debug,status=warn pnpm dev
```

Module, die nicht in `LOG_LEVELS` stehen, verwenden den Wert von `LOG_LEVEL`.

## Externer Zugriff (Tailscale Serve)

```bash
tailscale serve --bg 8022
```

Zugriff über `https://<machine>.<tailnet>.ts.net`. Deaktivieren:

```bash
tailscale serve --bg off 8022
```

## Sicherheit

### Passwort

Beim ersten Zugriff legst du ein Passwort fest. Es wird mit scrypt gehasht und in `~/.purplemux/config.json` gespeichert.

Zum Zurücksetzen die Datei `~/.purplemux/config.json` löschen und neu starten — der Onboarding-Bildschirm erscheint wieder.

### HTTPS

Standard ist HTTP. Bei externer Erreichbarkeit unbedingt HTTPS verwenden:

- **Tailscale Serve** — WireGuard-Verschlüsselung plus automatische Zertifikate
- **Nginx / Caddy** — Muss die WebSocket-Upgrade-Header (`Upgrade`, `Connection`) weiterreichen

### Datenverzeichnis (`~/.purplemux/`)

| Datei | Beschreibung |
|---|---|
| `config.json` | Zugangsdaten (gehasht) und App-Einstellungen |
| `workspaces.json` | Workspace-Layouts, Tabs, Verzeichnisse |
| `vapid-keys.json` | Web-Push-VAPID-Schlüssel (automatisch generiert) |
| `push-subscriptions.json` | Push-Abonnementdaten |
| `hooks/` | Benutzerdefinierte Hooks |

## Architektur

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

**Terminal-I/O** — xterm.js verbindet sich über WebSocket mit node-pty; node-pty hängt an tmux-Sessions. Ein Binärprotokoll übernimmt stdin/stdout/resize mit Backpressure-Kontrolle.

**Statuserkennung** — Claude-Code-Event-Hooks (`SessionStart`, `Stop`, `Notification`) liefern sofortige Updates per HTTP POST. Alle 5–15 s werden Prozessbäume geprüft und die letzten 8 KB der JSONL-Dateien analysiert.

**Timeline** — Überwacht JSONL-Session-Logs unter `~/.claude/projects/`, parst bei Änderungen neue Zeilen und streamt strukturierte Einträge an den Browser.

**tmux-Isolation** — Nutzt einen eigenen `purple`-Socket, vollständig getrennt von deinem bestehenden tmux. Kein Prefix-Key, keine Statusleiste.

**Auto-Recovery** — Beim Serverstart werden vorherige Claude-Sessions via `claude --resume {sessionId}` wiederhergestellt.

## License

[MIT](LICENSE)
