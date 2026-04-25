---
title: Web-Push-Notifications
description: Background-Push-Alerts für Eingabe-nötig- und Task-Completion-Zustände, auch wenn der Browser-Tab geschlossen ist.
eyebrow: Mobile & Remote
permalink: /de/docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

Web Push lässt purplemux dich anstupsen, wenn eine Claude-Session deine Aufmerksamkeit braucht — ein Berechtigungs-Prompt, ein abgeschlossener Task — auch nachdem du den Tab geschlossen hast. Tipp die Notification, und du landest direkt in dieser Session.

## Was eine Notification triggert

purplemux feuert einen Push für dieselben Übergänge, die du als farbige Badges in der Seitenleiste siehst.

- **Eingabe nötig** — Claude hat einen Berechtigungs-Prompt oder eine Frage.
- **Task-Abschluss** — Claude hat einen Turn beendet (der **Review**-Zustand).

Idle- und Busy-Übergänge werden absichtlich nicht gepusht. Sie sind Rauschen.

## Aktivieren

Der Toggle liegt unter **Einstellungen → Notification**. Schritte:

1. Öffne **Einstellungen → Notification** und schalte ihn **An**.
2. Der Browser fragt nach Notification-Berechtigung — erteile sie.
3. purplemux registriert ein Web-Push-Abonnement gegen die VAPID-Keys des Servers.

Das Abonnement wird in `~/.purplemux/push-subscriptions.json` gespeichert und identifiziert deinen spezifischen Browser/Gerät. Wiederhol die Schritte auf jedem Gerät, auf dem du benachrichtigt werden willst.

{% call callout('warning', 'iOS verlangt Safari 16.4 + eine PWA') %}
Auf iPhone und iPad funktioniert Web Push erst, nachdem du purplemux zum Home-Bildschirm hinzugefügt und vom Icon gestartet hast. Öffne die Einstellungs-Seite aus dem Standalone-PWA-Fenster — der Notification-Berechtigungs-Prompt ist in einem normalen Safari-Tab ein No-op. Richte zuerst die PWA ein: [PWA-Setup](/purplemux/de/docs/pwa-setup/).
{% endcall %}

## VAPID-Keys

purplemux generiert beim ersten Start ein Application-Server-VAPID-Keypair und speichert es in `~/.purplemux/vapid-keys.json` (Mode `0600`). Du musst nichts tun — der Public Key wird automatisch an den Browser ausgeliefert, wenn du abonnierst.

Wenn du jemals alle Abonnements zurücksetzen willst (z. B. nach einem Key-Rotate), lösch `vapid-keys.json` und `push-subscriptions.json` und starte purplemux neu. Jedes Gerät muss neu abonnieren.

## Background-Zustellung

Sobald abonniert, empfängt dein Handy die Notification über den OS-Push-Service:

- **iOS** — APNs, über Safaris Web-Push-Bridge. Zustellung ist Best-Effort und kann coalesced werden, wenn dein Handy stark gedrosselt ist.
- **Android** — FCM via Chrome. Generell sofort.

Die Notification kommt an, egal ob purplemux im Vordergrund ist oder nicht. Wenn das Dashboard aktuell auf _irgendeinem_ deiner Geräte sichtbar ist, überspringt purplemux den Push, um Doppel-Buzzes zu vermeiden.

## Tippen, um einzusteigen

Eine Notification anzutippen öffnet purplemux direkt in der Session, die sie ausgelöst hat. Wenn die PWA schon läuft, wechselt der Fokus zum richtigen Tab; ansonsten startet die App und navigiert direkt dorthin.

## Troubleshooting

- **Toggle ausgegraut** — Service Workers oder Notifications API werden nicht unterstützt. Führ **Einstellungen → Browser-Check** aus oder siehe [Browser-Unterstützung](/purplemux/de/docs/browser-support/).
- **Berechtigung wurde abgelehnt** — lösch die Notification-Berechtigung der Site in deinen Browser-Einstellungen und schalte in purplemux neu um.
- **Keine Pushes auf iOS** — bestätige, dass du vom Home-Bildschirm-Icon startest, nicht aus Safari. Bestätige, dass iOS **16.4 oder neuer** ist.
- **Selbstsigniertes Zertifikat** — Web Push verweigert die Registrierung. Nutz Tailscale Serve oder einen Reverse-Proxy mit echtem Zertifikat. Siehe [Tailscale-Zugriff](/purplemux/de/docs/tailscale/).

## Wie es weitergeht

- **[PWA-Setup](/purplemux/de/docs/pwa-setup/)** — für iOS-Push erforderlich.
- **[Tailscale-Zugriff](/purplemux/de/docs/tailscale/)** — HTTPS für externe Zustellung.
- **[Sicherheit & Auth](/purplemux/de/docs/security-auth/)** — was sonst noch unter `~/.purplemux/` lebt.
