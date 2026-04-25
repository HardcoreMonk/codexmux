---
title: Editor-Integration
description: Öffne den aktuellen Ordner in deinem Editor — VS Code, Cursor, Zed, code-server oder eine Custom-URL — direkt aus dem Header.
eyebrow: Anpassung
permalink: /de/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

Jeder Workspace hat einen **EDITOR**-Button im Header. Ein Klick darauf öffnet den Ordner der aktiven Session im Editor deiner Wahl. Wähl ein Preset, zeig auf eine URL oder verlass dich auf den System-Handler — fertig.

## Den Picker öffnen

Einstellungen (<kbd>⌘,</kbd>) → Tab **Editor**. Du siehst eine Liste von Presets und, je nach Wahl, ein URL-Feld.

## Verfügbare Presets

| Preset | Was es tut |
|---|---|
| **Code Server (Web)** | Öffnet eine gehostete [code-server](https://github.com/coder/code-server)-Instanz mit `?folder=<path>`. Erfordert eine URL. |
| **VS Code** | Triggert `vscode://file/<path>?windowId=_blank`. |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<path>` |
| **Custom URL** | Ein URL-Template, das du kontrollierst, mit `{folder}`-/`{folderEncoded}`-Platzhaltern. |
| **Deaktiviert** | Versteckt den EDITOR-Button vollständig. |

Die vier Desktop-IDE-Presets (VS Code, Cursor, Windsurf, Zed) verlassen sich darauf, dass das OS einen URI-Handler registriert. Wenn du die IDE lokal installiert hast, funktioniert der Link wie erwartet.

## Web vs. lokal

Es gibt einen wichtigen Unterschied, wie jedes Preset einen Ordner öffnet:

- **code-server** läuft im Browser. Die URL zeigt auf den Server, den du hostest (deinen, im Netzwerk oder hinter Tailscale). Klick den EDITOR-Button, und ein neuer Tab lädt den Ordner.
- **Lokale IDEs** (VS Code, Cursor, Windsurf, Zed) verlangen, dass die IDE auf der *Maschine, auf der der Browser läuft*, installiert ist. Der Link wird ans OS übergeben, das den registrierten Handler startet.

Wenn du purplemux auf dem Handy nutzt, funktioniert nur das code-server-Preset — Handys können `vscode://`-URLs nicht in eine Desktop-App öffnen.

## code-server-Setup

Ein typisches lokales Setup, in der App angezeigt:

```bash
# Installation auf macOS
brew install code-server

# Ausführen
code-server --port 8080

# Externer Zugriff via Tailscale (optional)
tailscale serve --bg --https=8443 http://localhost:8080
```

Dann im Editor-Tab die URL auf die Adresse setzen, unter der code-server erreichbar ist — `http://localhost:8080` lokal oder `https://<machine>.<tailnet>.ts.net:8443`, falls du es hinter Tailscale Serve gepackt hast. purplemux validiert, dass die URL mit `http://` oder `https://` beginnt, und hängt automatisch `?folder=<absoluter Pfad>` an.

{% call callout('note', 'Wähl einen Port, der nicht 8022 ist') %}
purplemux lebt schon auf `8022`. Lass code-server auf einem anderen Port laufen (das Beispiel nutzt `8080`), damit sie sich nicht streiten.
{% endcall %}

## Custom-URL-Template

Das Custom-Preset lässt dich auf alles zeigen, das einen Ordner in seiner URL annimmt — Coder-Workspaces, Gitpod, Theia, ein internes Tool. Das Template **muss** mindestens einen der Platzhalter enthalten:

- `{folder}` — absoluter Pfad, unencoded.
- `{folderEncoded}` — URL-encoded.

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux validiert das Template beim Speichern und weigert sich bei einem ohne Platzhalter.

## Den Button deaktivieren

Wähl **Deaktiviert**. Der Button verschwindet aus dem Workspace-Header.

## Wie es weitergeht

- **[Seitenleiste & Claude-Optionen](/purplemux/de/docs/sidebar-options/)** — Sidebar-Items umsortieren, Claude-Flags umschalten.
- **[Custom CSS](/purplemux/de/docs/custom-css/)** — weiteres visuelles Tuning.
- **[Tailscale](/purplemux/de/docs/tailscale/)** — sicherer externer Zugriff auch für code-server.
