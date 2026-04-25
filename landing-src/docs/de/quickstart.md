---
title: Schnellstart
description: Bring purplemux mit Node.js und tmux in unter einer Minute zum Laufen.
eyebrow: Erste Schritte
permalink: /de/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux ist ein web-nativer Multiplexer, der jede Claude-Code-Session auf einem Dashboard verwaltet, mit `tmux` als Persistenz-Layer — gemacht für die Nutzung am Schreibtisch und am Handy.

## Bevor du loslegst

Du brauchst zwei Dinge auf der Maschine, die purplemux hosten soll.

- **Node.js 20 oder neuer** — prüfe mit `node -v`.
- **tmux** — prüfe mit `tmux -V`. Ab Version 3.0 ist alles in Ordnung.

{% call callout('note', 'Nur macOS / Linux') %}
Windows wird nicht offiziell unterstützt. purplemux setzt auf `node-pty` und tmux, die unter Windows nicht nativ laufen. WSL2 funktioniert meistens, ist aber außerhalb unserer Test-Matrix.
{% endcall %}

## Ausführen

Ein Befehl. Keine globale Installation nötig.

```bash
npx purplemux
```

purplemux startet auf Port `8022`. Öffne den Browser:

```
http://localhost:8022
```

Beim ersten Start wirst du durchs Anlegen eines Passworts und deines ersten Workspaces geführt.

{% call callout('tip') %}
Lieber persistent installieren? `pnpm add -g purplemux && purplemux` funktioniert genauso. Updates sind ein `pnpm up -g purplemux` entfernt.
{% endcall %}

## Eine Claude-Session öffnen

Im Dashboard:

1. Klicke **Neuer Tab** in einem beliebigen Workspace.
2. Wähle das **Claude**-Template (oder führe einfach `claude` in einem normalen Terminal aus).
3. purplemux erkennt die laufende Claude-CLI und zeigt Status, die Live-Timeline und Berechtigungs-Prompts in Echtzeit.

Deine Session bleibt bestehen, auch wenn du den Browser schließt — tmux hält den Prozess auf dem Server am Leben.

## Vom Handy aus erreichen

Standardmäßig lauscht purplemux nur auf `localhost`. Für sicheren externen Zugriff nutzt du Tailscale Serve (WireGuard + automatisches HTTPS, kein Port-Forwarding):

```bash
tailscale serve --bg 8022
```

Öffne `https://<machine>.<tailnet>.ts.net` auf deinem Handy, tippe **Teilen → Zum Home-Bildschirm**, und purplemux wird zur PWA, die auch im Hintergrund Web-Push-Benachrichtigungen empfängt.

Siehe [Tailscale-Zugriff](/purplemux/de/docs/tailscale/) für die vollständige Einrichtung oder [PWA-Setup](/purplemux/de/docs/pwa-setup/) für iOS- und Android-Details.

## Wie es weitergeht

- **[Installation](/purplemux/de/docs/installation/)** — Plattform-Details, native macOS-App, Autostart.
- **[Browser-Unterstützung](/purplemux/de/docs/browser-support/)** — Kompatibilitätsmatrix für Desktop und Mobile.
- **[Erste Session](/purplemux/de/docs/first-session/)** — geführte Tour durchs Dashboard.
- **[Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/)** — alle Bindings auf einen Blick.
