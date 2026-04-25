---
title: CLI-Referenz
description: Jeder Subcommand und jedes Flag der purplemux- und pmux-Binaries.
eyebrow: Referenz
permalink: /de/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux` liefert zwei Wege, das Binary zu nutzen: als Server-Starter (`purplemux` / `purplemux start`) und als HTTP-API-Wrapper (`purplemux <subcommand>`), der mit einem laufenden Server redet. Der kurze Alias `pmux` ist identisch.

## Zwei Rollen, ein Binary

| Form | Was es tut |
|---|---|
| `purplemux` | Server starten. Genau wie `purplemux start`. |
| `purplemux <subcommand>` | Mit der CLI-HTTP-API eines laufenden Servers reden. |
| `pmux ...` | Alias für `purplemux ...`. |

Der Dispatcher in `bin/purplemux.js` schält das erste Argument ab: bekannte Subcommands routen zu `bin/cli.js`, alles andere (oder kein Argument) startet den Server.

## Server starten

```bash
purplemux              # Default
purplemux start        # dasselbe, explizit
PORT=9000 purplemux    # Custom-Port
HOST=all purplemux     # überall binden
```

Siehe [Ports & Umgebungsvariablen](/purplemux/de/docs/ports-env-vars/) für die volle Env-Oberfläche.

Der Server gibt seine gebundenen URLs, den Modus und den Auth-Status aus:

```
  ⚡ purplemux  v0.x.x
  ➜  Verfügbar auf:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Modus:  production
  ➜  Auth:   konfiguriert
```

Ist `8022` schon belegt, warnt der Server und bindet stattdessen auf einen zufälligen freien Port.

## Subcommands

Alle Subcommands brauchen einen laufenden Server. Sie lesen den Port aus `~/.purplemux/port` und das Auth-Token aus `~/.purplemux/cli-token`, beide werden beim Server-Start automatisch geschrieben.

| Befehl | Zweck |
|---|---|
| `purplemux workspaces` | Workspaces auflisten |
| `purplemux tab list [-w WS]` | Tabs auflisten (optional auf einen Workspace beschränkt) |
| `purplemux tab create -w WS [-n NAME] [-t TYPE]` | Neuen Tab erstellen |
| `purplemux tab send -w WS TAB_ID CONTENT...` | Eingabe an einen Tab senden |
| `purplemux tab status -w WS TAB_ID` | Status eines Tabs inspizieren |
| `purplemux tab result -w WS TAB_ID` | Aktuellen Inhalt des Tab-Panels erfassen |
| `purplemux tab close -w WS TAB_ID` | Tab schließen |
| `purplemux tab browser ...` | Einen `web-browser`-Tab steuern (nur Electron) |
| `purplemux api-guide` | Vollständige HTTP-API-Referenz drucken |
| `purplemux help` | Nutzung anzeigen |

Output ist JSON, sofern nicht anders angegeben. `--workspace` und `-w` sind austauschbar.

### `tab create`-Panel-Typen

Das `-t` / `--type`-Flag wählt den Panel-Typ. Gültige Werte:

| Wert | Panel |
|---|---|
| `terminal` | Plain-Shell |
| `claude-code` | Shell mit bereits laufendem `claude` |
| `web-browser` | Eingebetteter Browser (nur Electron) |
| `diff` | Git-Diff-Panel |

Ohne `-t` bekommst du ein Plain-Terminal.

### `tab browser`-Subcommands

Diese funktionieren nur, wenn der Panel-Typ des Tabs `web-browser` ist, und nur in der macOS-Electron-App — sonst gibt die Bridge 503 zurück.

| Subcommand | Was es zurückgibt |
|---|---|
| `purplemux tab browser url -w WS TAB_ID` | aktuelle URL + Page-Titel |
| `purplemux tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG. Mit `-o` auf Disk speichern; ohne, gibt base64 zurück. `--full` erfasst die ganze Seite. |
| `purplemux tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | letzte Console-Einträge (Ringbuffer, 500 Einträge) |
| `purplemux tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | letzte Netzwerk-Einträge; `--request ID` holt einen Body |
| `purplemux tab browser eval -w WS TAB_ID EXPR` | wertet einen JS-Ausdruck aus und serialisiert das Ergebnis |

## Beispiele

```bash
# Finde deinen Workspace
purplemux workspaces

# Erstelle einen Claude-Tab im Workspace ws-MMKl07
purplemux tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# Schick einen Prompt (TAB_ID kommt aus `tab list`)
purplemux tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# Status beobachten
purplemux tab status -w ws-MMKl07 tb-abc

# Snapshot des Panels
purplemux tab result -w ws-MMKl07 tb-abc

# Full-Page-Screenshot eines Web-Browser-Tabs
purplemux tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## Authentifizierung

Jeder Subcommand sendet `x-pmux-token: $(cat ~/.purplemux/cli-token)` und wird server-seitig via `timingSafeEqual` verifiziert. Die Datei `~/.purplemux/cli-token` wird beim ersten Server-Start mit `randomBytes(32)` generiert und mit Mode `0600` gespeichert.

Wenn du die CLI aus einer anderen Shell oder einem Skript betreiben musst, das `~/.purplemux/` nicht sehen kann, setz stattdessen die Env-Variablen:

| Variable | Default | Effekt |
|---|---|---|
| `PMUX_PORT` | Inhalt von `~/.purplemux/port` | Port, mit dem die CLI redet |
| `PMUX_TOKEN` | Inhalt von `~/.purplemux/cli-token` | Bearer-Token, gesendet als `x-pmux-token` |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux workspaces
```

{% call callout('warning') %}
Das CLI-Token gewährt vollen Server-Zugriff. Behandle es wie ein Passwort. Klebe es nicht in Chats, committe es nicht und exponiere es nicht als Build-Env-Var. Rotieren durch Löschen von `~/.purplemux/cli-token` und Server-Restart.
{% endcall %}

## update-notifier

`purplemux` prüft beim Start (via `update-notifier`) npm auf eine neuere Version und druckt ein Banner, falls eine existiert. Deaktiviere mit `NO_UPDATE_NOTIFIER=1` oder einer der [Standard-`update-notifier`-Opt-outs](https://github.com/yeoman/update-notifier#user-settings).

## Vollständige HTTP-API

`purplemux api-guide` druckt die vollständige HTTP-API-Referenz für jeden `/api/cli/*`-Endpunkt, inklusive Request-Bodies und Response-Shapes — nützlich, wenn du purplemux direkt aus `curl` oder einer anderen Runtime ansteuern willst.

## Wie es weitergeht

- **[Ports & Umgebungsvariablen](/purplemux/de/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` in der breiteren Env-Oberfläche.
- **[Architektur](/purplemux/de/docs/architecture/)** — womit die CLI tatsächlich redet.
- **[Troubleshooting](/purplemux/de/docs/troubleshooting/)** — wenn die CLI „läuft der Server?" sagt.
