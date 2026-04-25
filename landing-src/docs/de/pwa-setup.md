---
title: PWA-Setup
description: purplemux auf iOS Safari und Android Chrome auf den Home-Bildschirm legen — für ein Vollbild-, App-artiges Erlebnis.
eyebrow: Mobile & Remote
permalink: /de/docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux als Progressive Web App zu installieren, verwandelt den Browser-Tab in ein eigenständiges Icon auf deinem Home-Bildschirm, mit Vollbild-Layout und passenden Splash-Screens. Auf iOS ist das außerdem die Voraussetzung für Web Push.

## Was du bekommst

- **Vollbild-Layout** — kein Browser-Chrome, mehr vertikaler Platz für Terminal und Timeline.
- **App-Icon** — purplemux startet vom Home-Bildschirm wie jede native App.
- **Splash-Screens** — purplemux liefert pro Gerät passende Splash-Bilder für iPhones, sodass sich der Launch-Übergang nativ anfühlt.
- **Web Push** (nur iOS) — Push-Notifications feuern erst nach PWA-Installation.

Das Manifest wird unter `/api/manifest` ausgeliefert und registriert `display: standalone` mit dem purplemux-Mark und der Theme-Farbe.

## Bevor du installierst

Die Seite muss über **HTTPS** erreichbar sein, damit PWAs funktionieren. Aus `localhost` klappt es in Chrome (Loopback-Ausnahme), aber iOS Safari verweigert die Installation über plain HTTP. Der saubere Pfad ist Tailscale Serve — siehe [Tailscale-Zugriff](/purplemux/de/docs/tailscale/).

{% call callout('warning', 'iOS braucht Safari 16.4 oder neuer') %}
Frühere iOS-Releases können die PWA installieren, liefern aber keinen Web Push. Wenn dir Push wichtig ist, aktualisiere zuerst iOS. Browser-by-Browser-Details unter [Browser-Unterstützung](/purplemux/de/docs/browser-support/).
{% endcall %}

## iOS Safari

1. Öffne die purplemux-URL in **Safari** (andere iOS-Browser exponieren Add to Home Screen für PWAs nicht).
2. Tipp das **Teilen**-Icon in der unteren Toolbar.
3. Scroll im Action-Sheet und wähle **Zum Home-Bildschirm**.
4. Bearbeite den Namen, falls gewünscht, und tipp **Hinzufügen** oben rechts.
5. Starte purplemux vom neuen Home-Bildschirm-Icon — es öffnet im Vollbild.

Der erste Start vom Icon ist der Moment, in dem iOS es als echte PWA behandelt. Ein eventueller Push-Berechtigungs-Prompt sollte aus diesem Standalone-Fenster heraus ausgelöst werden, nicht aus einem normalen Safari-Tab.

## Android Chrome

Chrome erkennt ein installierbares Manifest automatisch und bietet ein Banner. Falls du es nicht siehst:

1. Öffne die purplemux-URL in **Chrome**.
2. Tipp das **⋮**-Menü oben rechts.
3. Wähle **App installieren** (manchmal als **Zum Startbildschirm hinzufügen** beschriftet).
4. Bestätige. Das Icon erscheint auf deinem Home-Bildschirm und in der App-Drawer.

Samsung Internet verhält sich genauso — der Install-Prompt erscheint typischerweise automatisch.

## Installation verifizieren

Öffne purplemux vom Home-Bildschirm-Icon. Die Browser-Adressleiste sollte weg sein. Siehst du immer noch Browser-UI, hat sich das Manifest nicht angewandt — meist, weil die Seite über plain HTTP oder einen ungewöhnlichen Proxy geladen wird.

Du kannst auch unter **Einstellungen → Notification** prüfen — sobald die PWA installiert ist und Web Push unterstützt wird, wird der Toggle aktiv.

## PWA aktualisieren

Du musst nichts tun. Die PWA lädt dasselbe `index.html`, das deine purplemux-Instanz ausliefert; ein purplemux-Upgrade aktualisiert die installierte App beim nächsten Start.

Zum Entfernen lange auf das Icon drücken und die OS-native Deinstallationsaktion wählen.

## Wie es weitergeht

- **[Web-Push-Notifications](/purplemux/de/docs/web-push/)** — Background-Alerts einschalten, jetzt da die PWA installiert ist.
- **[Tailscale-Zugriff](/purplemux/de/docs/tailscale/)** — die HTTPS-URL bekommen, die iOS verlangt.
- **[Browser-Unterstützung](/purplemux/de/docs/browser-support/)** — vollständige Kompatibilitätsmatrix.
