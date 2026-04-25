---
title: Web-Browser-Panel
description: Ein eingebauter Browser-Tab zum Testen von Dev-Output, steuerbar über die purplemux-CLI, mit einem Geräte-Emulator für Mobile-Viewports.
eyebrow: Workspaces & Terminal
permalink: /de/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

Setz einen Web-Browser-Tab neben dein Terminal und deine Claude-Session. Er rendert deinen lokalen Dev-Server, die Staging-Site, alles Erreichbare — und du kannst ihn aus der `purplemux`-CLI steuern, ohne die Shell zu verlassen.

## Browser-Tab öffnen

Füge einen neuen Tab hinzu und wähle **Web Browser** als Panel-Typ. Tipp eine URL in die Adressleiste — `localhost:3000`, eine IP oder eine vollständige https-URL. Die Adressleiste normalisiert die Eingabe: bare Hostnames und IPs gehen auf `http://`, alles andere auf `https://`.

Das Panel läuft als echter Chromium-Webview, wenn purplemux die native macOS-App ist (Electron-Build), und fällt aus einem normalen Browser auf ein iframe zurück. Der iframe-Pfad deckt die meisten Seiten ab, kann aber keine Sites laden, die `X-Frame-Options: deny` senden; der Electron-Pfad hat dieses Limit nicht.

{% call callout('note', 'Am besten in der nativen App') %}
Geräte-Emulation, CLI-Screenshots und Console-/Netzwerk-Capture funktionieren nur im Electron-Build. Der Browser-Tab-Fallback gibt dir Adressleiste, Zurück/Vorwärts und Reload, aber die tieferen Integrationen brauchen einen Webview.
{% endcall %}

## CLI-gesteuerte Navigation

Das Panel exponiert eine kleine HTTP-API, die die mitgelieferte `purplemux`-CLI wrappt. Aus jedem Terminal — auch aus dem direkt neben dem Browser-Panel — kannst du:

```bash
# Tabs auflisten und eine Web-Browser-Tab-ID finden
purplemux tab list -w <workspace-id>

# aktuelle URL + Titel lesen
purplemux tab browser url -w <ws> <tabId>

# Screenshot in eine Datei (oder Full-Page mit --full)
purplemux tab browser screenshot -w <ws> <tabId> -o shot.png --full

# letzte Console-Logs anzeigen (500-Eintrag-Ringbuffer)
purplemux tab browser console -w <ws> <tabId> --since 60000 --level error

# Netzwerk-Aktivität inspizieren, optional einen Response-Body abrufen
purplemux tab browser network -w <ws> <tabId> --method POST --status 500
purplemux tab browser network -w <ws> <tabId> --request <id>

# JavaScript im Tab auswerten und das serialisierte Ergebnis bekommen
purplemux tab browser eval -w <ws> <tabId> "document.title"
```

Die CLI authentifiziert sich über ein Token in `~/.purplemux/cli-token` und liest den Port aus `~/.purplemux/port`. Auf derselben Maschine sind keine Flags nötig. Führe `purplemux help` für die volle Oberfläche aus oder `purplemux api-guide` für die zugrundeliegenden HTTP-Endpunkte.

Genau das macht das Panel für Claude nützlich: Bitte Claude, einen Screenshot zu machen, die Console nach dem Fehler zu durchsuchen oder ein Probe-Skript auszuführen — und Claude hat dieselbe CLI wie du.

## Geräte-Emulator

Für Mobile-Arbeit schaltest du das Panel in den Mobile-Modus. Ein Geräte-Picker bietet Presets für iPhone SE bis 14 Pro Max, Pixel 7, Galaxy S20 Ultra, iPad Mini und iPad Pro 12.9". Jedes Preset enthält:

- Breite / Höhe
- Device Pixel Ratio
- Einen passenden Mobile-User-Agent

Schalte zwischen Hochformat und Querformat und wähle ein Zoom-Level (`fit` zur Skalierung aufs Panel oder fest `50% / 75% / 100% / 125% / 150%`). Wenn du das Gerät wechselst, lädt der Webview mit dem neuen UA neu, sodass server-seitige Mobile-Erkennung sieht, was dein Handy sähe.

## Wie es weitergeht

- **[Tabs & Panels](/purplemux/de/docs/tabs-panes/)** — den Browser in einen Split neben Claude legen.
- **[Git-Workflow-Panel](/purplemux/de/docs/git-workflow/)** — der andere zweckgebundene Panel-Typ.
- **[Installation](/purplemux/de/docs/installation/)** — die native macOS-App, in der die volle Webview-Integration lebt.
