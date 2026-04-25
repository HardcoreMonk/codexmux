---
title: Ports & Umgebungsvariablen
description: Jeder Port, den purplemux öffnet, und jede Umgebungsvariable, die beeinflusst, wie es läuft.
eyebrow: Referenz
permalink: /de/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux soll eine Ein-Zeilen-Installation sein, aber die Runtime ist konfigurierbar. Diese Seite listet jeden Port, den es öffnet, und jede Umgebungsvariable, die der Server liest.

## Ports

| Port | Default | Override | Hinweise |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux` | Ist `8022` schon belegt, loggt der Server eine Warnung und bindet stattdessen auf einen zufälligen freien Port. |
| Internes Next.js (Production) | zufällig | — | In `pnpm start` / `purplemux start` proxyt der Outer-Server an ein Next.js-Standalone, gebunden auf `127.0.0.1:<random>`. Nicht exponiert. |

`8022` ist `web` + `ssh` zusammengeklebt. Die Wahl ist Humor, kein Protokoll.

{% call callout('note', 'Gebundenes Interface folgt der Access-Policy') %}
purplemux bindet nur dann auf `0.0.0.0`, wenn die Access-Policy externe Clients tatsächlich erlaubt. Reine Localhost-Setups binden auf `127.0.0.1`, sodass andere Maschinen im LAN nicht mal eine TCP-Verbindung öffnen können. Siehe `HOST` unten.
{% endcall %}

## Server-Umgebungsvariablen

Gelesen von `server.ts` und den Modulen, die es beim Startup lädt.

| Variable | Default | Effekt |
|---|---|---|
| `PORT` | `8022` | HTTP/WS-Listen-Port. Fällt auf einen zufälligen Port bei `EADDRINUSE` zurück. |
| `HOST` | nicht gesetzt | Komma-getrennte CIDR-/Keyword-Spec für erlaubte Clients. Keywords: `localhost`, `tailscale`, `lan`, `all` (oder `*` / `0.0.0.0`). Beispiele: `HOST=localhost`, `HOST=localhost,tailscale`, `HOST=10.0.0.0/8,localhost`. Wenn per Env gesetzt, ist die in-App-**Einstellungen → Netzwerk-Zugriff** gesperrt. |
| `NODE_ENV` | `production` (in `purplemux start`), `development` (in `pnpm dev`) | Wählt zwischen Dev-Pipeline (`tsx watch`, Next dev) und Prod-Pipeline (`tsup`-Bundle, das an Next-Standalone proxyt). |
| `__PMUX_APP_DIR` | `process.cwd()` | Override für das Verzeichnis, das `dist/server.js` und `.next/standalone/` hält. Wird automatisch von `bin/purplemux.js` gesetzt; normalerweise solltest du es nicht anfassen. |
| `__PMUX_APP_DIR_UNPACKED` | nicht gesetzt | Variante von `__PMUX_APP_DIR` für den asar-unpacked-Pfad innerhalb der macOS-Electron-App. |
| `__PMUX_ELECTRON` | nicht gesetzt | Wenn der Electron-Main-Prozess den Server in-process startet, setzt er das, sodass `server.ts` den auto-`start()`-Call überspringt und Electron den Lifecycle steuern lässt. |
| `PURPLEMUX_CLI` | `1` (gesetzt von `bin/purplemux.js`) | Marker, der Shared-Modulen zeigt, dass der Prozess die CLI/Server ist, nicht Electron. Genutzt von `pristine-env.ts`. |
| `__PMUX_PRISTINE_ENV` | nicht gesetzt | JSON-Snapshot des Parent-Shell-Envs, von `bin/purplemux.js` gefangen, sodass Child-Prozesse (claude, tmux) den User-`PATH` erben statt einer sanitisierten Variante. Intern — wird automatisch gesetzt. |
| `AUTH_PASSWORD` | nicht gesetzt | Vom Server aus dem scrypt-Hash in `config.json` gesetzt, bevor Next startet. NextAuth liest es von dort. Setz es nicht manuell. |
| `NEXTAUTH_SECRET` | nicht gesetzt | Gleiche Geschichte — beim Startup aus `config.json` befüllt. |

## Logging-Umgebungsvariablen

Gelesen von `src/lib/logger.ts`.

| Variable | Default | Effekt |
|---|---|---|
| `LOG_LEVEL` | `info` | Root-Level für alles, was nicht in `LOG_LEVELS` steht. |
| `LOG_LEVELS` | nicht gesetzt | Pro-Modul-Overrides als `name=level`-Paare, durch Kommas getrennt. |

Levels in Reihenfolge: `trace` · `debug` · `info` · `warn` · `error` · `fatal`.

```bash
LOG_LEVEL=debug purplemux

# nur das Claude-Hook-Modul debuggen
LOG_LEVELS=hooks=debug purplemux

# mehrere Module gleichzeitig
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux
```

Die nützlichsten Modul-Namen:

| Modul | Quelle | Was du siehst |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`, Teile von `status-manager.ts` | Hook-Empfang / -Verarbeitung / Zustands-Übergänge |
| `status` | `status-manager.ts` | Polling, JSONL-Watcher, Broadcast |
| `tmux` | `lib/tmux.ts` | Jeder tmux-Befehl und sein Ergebnis |
| `server`, `lock` usw. | passende `lib/*.ts` | Prozess-Lifecycle |

Log-Dateien landen unabhängig vom Level unter `~/.purplemux/logs/`.

## Dateien (env-äquivalent)

Ein paar Werte verhalten sich wie Umgebungsvariablen, leben aber auf der Disk, sodass die CLI und Hook-Skripte sie ohne Env-Handshake finden:

| Datei | Hält | Genutzt von |
|---|---|---|
| `~/.purplemux/port` | aktueller Server-Port (Plain-Text) | `bin/cli.js`, `status-hook.sh`, `statusline.sh` |
| `~/.purplemux/cli-token` | 32-Byte-Hex-CLI-Token | `bin/cli.js`, Hook-Skripte (gesendet als `x-pmux-token`) |

Die CLI akzeptiert sie auch via Env, was Vorrang hat:

| Variable | Default | Effekt |
|---|---|---|
| `PMUX_PORT` | Inhalt von `~/.purplemux/port` | Port, mit dem die CLI redet. |
| `PMUX_TOKEN` | Inhalt von `~/.purplemux/cli-token` | Bearer-Token, gesendet als `x-pmux-token`. |

Siehe [CLI-Referenz](/purplemux/de/docs/cli-reference/) für die volle Oberfläche.

## Zusammen genommen

Ein paar gängige Kombinationen:

```bash
# Default: nur localhost, Port 8022
purplemux

# Überall binden (LAN + Tailscale + Remote)
HOST=all purplemux

# Nur Localhost + Tailscale
HOST=localhost,tailscale purplemux

# Custom-Port + verbose Hook-Tracing
PORT=9000 LOG_LEVELS=hooks=debug purplemux

# Maximaler Debug-Mode
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux
```

{% call callout('tip') %}
Bei einer persistenten Installation setzt du diese im `Environment=`-Block deiner launchd-/systemd-Unit. Siehe [Installation](/purplemux/de/docs/installation/#beim-booten-starten) für eine Beispiel-Unit-Datei.
{% endcall %}

## Wie es weitergeht

- **[Installation](/purplemux/de/docs/installation/)** — wo diese Variablen üblicherweise hingehören.
- **[Daten-Verzeichnis](/purplemux/de/docs/data-directory/)** — wie `port` und `cli-token` mit Hook-Skripten interagieren.
- **[CLI-Referenz](/purplemux/de/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` im Kontext.
