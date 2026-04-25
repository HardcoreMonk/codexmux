---
title: Daten-Verzeichnis
description: Was unter ~/.purplemux/ lebt, was sicher gelöscht werden kann und wie du es sicherst.
eyebrow: Referenz
permalink: /de/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

Jeder persistente Zustand, den purplemux behält — Einstellungen, Layouts, Session-History, Caches — lebt unter `~/.purplemux/`. Sonst nichts. Kein `localStorage`, kein System-Keychain, kein externer Service.

## Layout auf einen Blick

```
~/.purplemux/
├── config.json              # App-Config (Auth, Theme, Locale, …)
├── workspaces.json          # Workspace-Liste + Sidebar-State
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # Panel-/Tab-Tree
│       ├── message-history.json  # Eingabe-History pro Workspace
│       └── claude-prompt.md      # --append-system-prompt-file-Inhalt
├── hooks.json               # Claude-Code-Hook- + Statusline-Config (generiert)
├── status-hook.sh           # Hook-Skript (generiert, 0755)
├── statusline.sh            # Statusline-Skript (generiert, 0755)
├── rate-limits.json         # neueste Statusline-JSON
├── session-history.json     # abgeschlossene Claude-Session-Logs (workspace-übergreifend)
├── quick-prompts.json       # Custom-Quick-Prompts + deaktivierte Built-ins
├── sidebar-items.json       # Custom-Sidebar-Items + deaktivierte Built-ins
├── vapid-keys.json          # Web-Push-VAPID-Keypair (generiert)
├── push-subscriptions.json  # Web-Push-Endpunkt-Abonnements
├── cli-token                # CLI-Auth-Token (generiert)
├── port                     # aktueller Server-Port
├── pmux.lock                # Single-Instance-Lock {pid, port, startedAt}
├── logs/                    # pino-roll-Log-Dateien
├── uploads/                 # über die Chat-Eingabeleiste angehängte Bilder
└── stats/                   # Claude-Nutzungsstatistik-Cache
```

Dateien mit Geheimnissen (Config, Tokens, Layouts, VAPID-Keys, Lock) werden mit Mode `0600` über ein `tmpFile → rename`-Pattern geschrieben.

## Top-Level-Dateien

| Datei | Was sie speichert | Sicher zu löschen? |
|---|---|---|
| `config.json` | scrypt-gehashtes Login-Passwort, HMAC-Session-Secret, Theme, Locale, Schriftgröße, Notification-Toggle, Editor-URL, Netzwerk-Zugriff, Custom CSS | Ja — Onboarding läuft erneut |
| `workspaces.json` | Workspace-Index, Sidebar-Breite/Eingeklappt-State, aktive Workspace-ID | Ja — löscht alle Workspaces und Tabs |
| `hooks.json` | Claude-Code-`--settings`-Mapping (Event → Skript) + `statusLine.command` | Ja — wird beim nächsten Start regeneriert |
| `status-hook.sh`, `statusline.sh` | POST an `/api/status/hook` und `/api/status/statusline` mit `x-pmux-token` | Ja — wird beim nächsten Start regeneriert |
| `rate-limits.json` | neueste Claude-Statusline-JSON: `ts`, `model`, `five_hour`, `seven_day`, `context`, `cost` | Ja — füllt sich nach, sobald Claude läuft |
| `session-history.json` | letzte 200 abgeschlossene Claude-Sessions (Prompts, Ergebnisse, Dauer, Tools, Dateien) | Ja — leert die History |
| `quick-prompts.json`, `sidebar-items.json` | `{ custom: […], disabledBuiltinIds: […], order: […] }`-Overlays auf den Built-in-Listen | Ja — stellt Defaults wieder her |
| `vapid-keys.json` | Web-Push-VAPID-Keypair, beim ersten Start generiert | Nicht löschen, außer du löschst auch `push-subscriptions.json` (existierende Abonnements brechen) |
| `push-subscriptions.json` | Pro-Browser-Push-Endpunkte | Ja — auf jedem Gerät erneut abonnieren |
| `cli-token` | 32-Byte-Hex-Token für `purplemux`-CLI und Hook-Skripte (`x-pmux-token`-Header) | Ja — wird beim nächsten Start regeneriert; bereits generierte Hook-Skripte behalten aber das alte Token, bis der Server überschreibt |
| `port` | Plain-Text-Aktueller-Port, gelesen von Hook-Skripten und der CLI | Ja — wird beim nächsten Start regeneriert |
| `pmux.lock` | Single-Instance-Guard `{ pid, port, startedAt }` | Nur, wenn kein purplemux-Prozess lebt |

{% call callout('warning', 'Lock-File-Fallen') %}
Wenn purplemux mit „already running" startet, aber kein Prozess lebt, ist `pmux.lock` veraltet. `rm ~/.purplemux/pmux.lock` und nochmal versuchen. Falls du purplemux jemals mit `sudo` gestartet hast, gehört das Lock-File evtl. root — `sudo rm` einmalig.
{% endcall %}

## Pro-Workspace-Verzeichnis (`workspaces/{wsId}/`)

Jeder Workspace hat seinen eigenen Ordner, benannt nach der generierten Workspace-ID.

| Datei | Inhalt |
|---|---|
| `layout.json` | Rekursiver Panel-/Tab-Tree: Leaf-`pane`-Knoten mit `tabs[]`, `split`-Knoten mit `children[]` und einem `ratio`. Jeder Tab trägt seinen tmux-Session-Namen (`pt-{wsId}-{paneId}-{tabId}`), den gecachten `cliState`, `claudeSessionId` und den letzten Resume-Befehl. |
| `message-history.json` | Pro-Workspace-Claude-Eingabe-History. Auf 500 Einträge gekappt. |
| `claude-prompt.md` | Der `--append-system-prompt-file`-Inhalt, der jedem Claude-Tab in diesem Workspace übergeben wird. Wird bei Workspace-Erstellung/Umbenennung/Verzeichniswechsel regeneriert. |

Lösch ein einzelnes `workspaces/{wsId}/layout.json`, um das Layout dieses Workspaces auf ein Default-Panel zurückzusetzen, ohne die anderen anzufassen.

## `logs/`

Pino-roll-Output, eine Datei pro UTC-Tag, mit numerischem Suffix bei Größenüberschreitungen:

```
logs/purplemux.2026-04-19.1.log
```

Default-Level ist `info`. Override mit `LOG_LEVEL` oder pro Modul mit `LOG_LEVELS` — siehe [Ports & Umgebungsvariablen](/purplemux/de/docs/ports-env-vars/).

Logs rotieren wöchentlich (7-Datei-Limit). Jederzeit sicher zu löschen.

## `uploads/`

Bilder, die über die Chat-Eingabeleiste angehängt wurden (Drag, Paste, Büroklammer):

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- Erlaubt: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Max. 10 MB pro Datei, Mode `0600`
- Auto-Cleanup beim Server-Start: alles, was älter als 24 Stunden ist, wird entfernt
- Manueller Cleanup unter **Einstellungen → System → Angehängte Bilder → Jetzt aufräumen**

## `stats/`

Reiner Cache. Abgeleitet aus `~/.claude/projects/**/*.jsonl` — purplemux liest dieses Verzeichnis nur.

| Datei | Inhalt |
|---|---|
| `cache.json` | Pro-Tag-Aggregate: Nachrichten, Sessions, Tool-Calls, stündliche Counts, pro-Modell-Token-Nutzung |
| `uptime-cache.json` | Pro-Tag-Uptime / Aktiv-Minuten-Roll-up |
| `daily-reports/{YYYY-MM-DD}.json` | AI-generiertes Daily-Briefing |

Lösch den ganzen Ordner, um beim nächsten Statistik-Request eine Neuberechnung zu erzwingen.

## Reset-Matrix

| Um zurückzusetzen… | Lösche |
|---|---|
| Login-Passwort (Re-Onboard) | `config.json` |
| Alle Workspaces und Tabs | `workspaces.json` + `workspaces/` |
| Layout eines Workspaces | `workspaces/{wsId}/layout.json` |
| Nutzungsstatistiken | `stats/` |
| Push-Abonnements | `push-subscriptions.json` |
| Festsitzendes „already running" | `pmux.lock` (nur wenn kein Prozess lebt) |
| Alles (Factory-Reset) | `~/.purplemux/` |

`hooks.json`, `status-hook.sh`, `statusline.sh`, `port`, `cli-token` und `vapid-keys.json` werden alle beim nächsten Start auto-regeneriert, das Löschen ist also harmlos.

## Backups

Das gesamte Verzeichnis ist plain JSON plus ein paar Shell-Skripte. Zum Sichern:

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

Zum Wiederherstellen auf einer frischen Maschine entpackst du es und startest purplemux. Hook-Skripte werden mit dem Port des neuen Servers neu geschrieben; alles andere (Workspaces, History, Einstellungen) trägt sich 1:1 rüber.

{% call callout('warning') %}
Stell `pmux.lock` nicht wieder her — es ist an eine bestimmte PID gebunden und blockiert den Start. Schließ es aus: `--exclude pmux.lock`.
{% endcall %}

## Alles wegwischen

```bash
rm -rf ~/.purplemux
```

Stell vorher sicher, dass kein purplemux läuft. Der nächste Start ist wieder das Erst-Start-Erlebnis.

## Wie es weitergeht

- **[Ports & Umgebungsvariablen](/purplemux/de/docs/ports-env-vars/)** — jede Variable, die dieses Verzeichnis beeinflusst.
- **[Architektur](/purplemux/de/docs/architecture/)** — wie die Dateien mit dem laufenden Server verbunden sind.
- **[Troubleshooting](/purplemux/de/docs/troubleshooting/)** — gängige Probleme und Lösungen.
