---
title: Sicherheit & Auth
description: Wie purplemux dein Dashboard schützt — scrypt-gehashtes Passwort, nur lokale Daten und HTTPS für externen Zugriff.
eyebrow: Mobile & Remote
permalink: /de/docs/security-auth/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux ist self-hosted und bleibt auf deiner Maschine. Es gibt keine externen Server, keine Telemetrie und keinen Cloud-Account. Alles unten beschreibt die wenigen Bausteine, die dein Dashboard tatsächlich bewachen.

## Passwort-Setup

Beim ersten Öffnen von purplemux fragt der Onboarding-Screen nach einem Passwort. Nach dem Absenden:

- Das Passwort wird mit **scrypt** gehasht (zufälliges 16-Byte-Salt, 64-Byte-Derived-Key).
- Der Hash wird als `scrypt:{salt}:{hash}` in `~/.purplemux/config.json` geschrieben — der Klartext wird nie gespeichert.
- Ein separates `authSecret` (zufälliges Hex) wird generiert und daneben abgelegt. purplemux nutzt es, um den Session-Cookie nach dem Login zu signieren.

Folge-Besuche zeigen einen Login-Screen, der dein Passwort mit `crypto.timingSafeEqual` gegen den gespeicherten Hash prüft.

{% call callout('note', 'Passwort-Länge') %}
Das Minimum ist kurz (4 Zeichen), damit reine Localhost-Setups nicht nerven. Wenn du purplemux einem Tailnet — oder anderswo — exponierst, wähl etwas Stärkeres. Fehlgeschlagene Logins sind auf 16 Versuche pro 15 Minuten pro Prozess gerate-limited.
{% endcall %}

## Passwort zurücksetzen

Vergessen? Du brauchst nur Shell-Zugriff auf den Host:

```bash
rm ~/.purplemux/config.json
```

Starte purplemux neu (`pnpm start`, `npx purplemux` oder wie auch immer du es gestartet hast), und der Onboarding-Screen erscheint, damit du ein neues Passwort wählen kannst.

Das löscht andere Einstellungen aus derselben Datei (Theme, Locale, Schriftgröße, Notifications-Toggle usw.). Deine Workspaces und Tabs leben in `workspaces.json` und dem `workspaces/`-Verzeichnis, Layouts bleiben also unberührt.

## HTTPS für externen Zugriff

Der Default-Bind ist `localhost`, ausgeliefert über plain HTTP. Auf derselben Maschine ist das okay — aber sobald du purplemux von einem anderen Gerät aus erreichst, solltest du auf HTTPS sein.

- **Tailscale Serve** ist der empfohlene Pfad: WireGuard-Verschlüsselung plus automatische Let's-Encrypt-Zertifikate. Siehe [Tailscale-Zugriff](/purplemux/de/docs/tailscale/).
- **Reverse-Proxy** (Nginx, Caddy usw.) funktioniert auch, solange du die WebSocket-`Upgrade`- und `Connection`-Header forwardest.

iOS Safari verlangt zusätzlich HTTPS für PWA-Installation und Web-Push-Registrierung. Siehe [PWA-Setup](/purplemux/de/docs/pwa-setup/) und [Web Push](/purplemux/de/docs/web-push/).

## Was in `~/.purplemux/` lebt

Alles ist lokal. Berechtigungen auf sensiblen Dateien sind `0600`.

| Datei | Was sie hält |
|---|---|
| `config.json` | scrypt-Passwort-Hash, Session-Secret, App-Präferenzen |
| `workspaces.json` + `workspaces/` | Workspace-Liste und pro-Workspace-Panel-/Tab-Layouts |
| `vapid-keys.json` | Web-Push-VAPID-Keypair (auto-generiert) |
| `push-subscriptions.json` | Pro-Gerät-Push-Abonnements |
| `cli-token` | Shared-Token, mit dem Hooks/CLI mit dem lokalen Server reden |
| `pmux.lock` | Single-Instance-Lock (`pid`, `port`, `startedAt`) |
| `logs/` | rollende pino-Log-Dateien |

Für die vollständige Inventur und Reset-Tabelle siehe das Source-of-Truth-Listing in [docs/DATA-DIR.md](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md).

## Keine Telemetrie

purplemux macht von sich aus keine ausgehenden Anfragen. Die einzigen Netzwerk-Calls, die es initiiert:

- Web-Push-Notifications, die du abonniert hast, gesendet über die OS-Push-Services.
- Was die Claude-CLI selbst tut — das ist zwischen dir und Anthropic, nicht purplemux.

Code- und Session-Daten verlassen deine Maschine nie.

## Wie es weitergeht

- **[Tailscale-Zugriff](/purplemux/de/docs/tailscale/)** — der sichere Pfad zu externem HTTPS.
- **[PWA-Setup](/purplemux/de/docs/pwa-setup/)** — sobald die Auth steht, auf den Home-Bildschirm installieren.
- **[Web-Push-Notifications](/purplemux/de/docs/web-push/)** — Background-Alerts.
