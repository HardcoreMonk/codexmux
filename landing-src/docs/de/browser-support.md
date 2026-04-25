---
title: Browser-Unterstützung
description: Kompatibilitätsmatrix für Desktop und Mobile, mit Hinweisen zu browser-spezifischen Eigenheiten.
eyebrow: Erste Schritte
permalink: /de/docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux ist eine Web-App, daher hängt das Erlebnis vom verwendeten Browser ab. Die folgenden Versionen testen wir aktiv — ältere Browser funktionieren möglicherweise, sind aber nicht supportet.

## Desktop

| Browser | Mindestversion | Hinweise |
|---|---|---|
| Chrome | 110+ | Empfohlen. Vollständige PWA + Web Push. |
| Edge | 110+ | Gleiche Engine wie Chrome, gleicher Support. |
| Safari | 17+ | Vollständige PWA ab macOS Sonoma. Web Push erfordert macOS 13+ und eine installierte PWA. |
| Firefox | 115+ ESR | Funktioniert gut. PWA-Installation ist manuell (kein Install-Prompt). |

Alle Features — xterm.js-Terminal, Live-Timeline, Claude-Session-Ansicht, Git-Diff-Panel — funktionieren in allen Engines identisch.

## Mobile

| Browser | Mindestversion | Hinweise |
|---|---|---|
| iOS Safari | **16.4+** | Erforderlich für Web Push. Muss zuerst per **Zum Home-Bildschirm** installiert werden; Push feuert nicht aus einem normalen Tab. |
| Android Chrome | 110+ | Web Push funktioniert auch aus einem normalen Tab, wir empfehlen aber die PWA-Installation für ein Vollbild-Layout. |
| Samsung Internet | 22+ | Funktioniert. Install-Prompt erscheint automatisch. |

{% call callout('warning', 'iOS Safari ≥ 16.4 ist die Grenze') %}
Apple hat Web Push erst in Safari 16.4 (März 2023) zu iOS hinzugefügt. Frühere iOS-Versionen können das Dashboard zwar nutzen, bekommen aber selbst nach PWA-Installation keine Push-Benachrichtigungen.
{% endcall %}

## Feature-Anforderungen

purplemux setzt auf eine Handvoll moderner Browser-APIs. Fehlt eine davon, fällt die App graceful zurück, verliert aber das jeweilige Feature.

| API | Wofür | Fallback |
|---|---|---|
| WebSocket | Terminal-I/O, Status-Sync, Timeline | Harte Anforderung — kein Fallback. |
| Clipboard API | `npx purplemux`-Kopie, Code-Block-Kopie | Button wird ausgeblendet, wenn nicht verfügbar. |
| Notifications API | Desktop- / Mobile-Push | Übersprungen — In-App-Status bleibt sichtbar. |
| Service Workers | PWA + Web Push | Wird nur als normale Web-App ausgeliefert. |
| IntersectionObserver | Live-Session-Timeline, Nav-Reveal | Elemente werden ohne Animation gerendert. |
| `backdrop-filter` | Transluzente Nav, Modals | Fällt auf einen massiven, getönten Hintergrund zurück. |
| CSS `color-mix()` + OKLCH | Theme-Variablen | Safari < 16.4 verliert manche getönten Zustände. |

## Ist mein Browser okay?

purplemux liefert einen integrierten Self-Check unter **Einstellungen → Browser-Check**. Er führt dieselben Probes wie oben aufgeführt aus und zeigt pro Feature ein grünes / gelbes / rotes Badge — du musst kein Spec-Sheet lesen.

## Bekannte Eigenheiten

- **Safari 17 + privates Fenster** — IndexedDB ist deaktiviert, dein Workspace-Cache überlebt also keinen Neustart. Nutze ein normales Fenster.
- **iOS Safari + Hintergrund-Tab** — Terminals werden nach ca. 30 s im Hintergrund automatisch abgebaut. tmux hält die eigentliche Session am Leben; die UI verbindet sich neu, sobald du zurückkommst.
- **Firefox + Tailscale-Serve-Zertifikat** — wenn du einen Custom-Tailnet-Namen außerhalb von `ts.net` nutzt, ist Firefox bei HTTPS-Trust pingeliger als Chrome. Akzeptiere das Zertifikat einmal — danach bleibt es.
- **Selbstsignierte Zertifikate** — Web Push registriert sich gar nicht erst. Nutze Tailscale Serve (automatisches Let's Encrypt) oder eine echte Domain + Reverse-Proxy.

## Nicht unterstützt

- **Internet Explorer** — wird niemals unterstützt.
- **UC Browser, Opera Mini, Puffin** — Proxy-basierte Browser brechen WebSocket. Funktioniert nicht.
- **Jeder Browser, der älter als 3 Jahre ist** — unser CSS nutzt OKLCH-Farben und Container Queries, die eine Engine aus 2023 oder neuer brauchen.

Wenn du in einem ungewöhnlichen Setup steckst und etwas nicht funktioniert, [eröffne bitte ein Issue](https://github.com/subicura/purplemux/issues) mit deinem User Agent und der Self-Check-Ausgabe.
