---
title: Tailscale-Zugriff
description: Erreich purplemux vom Handy aus über HTTPS via Tailscale Serve — ohne Port-Forwarding, ohne Zertifikats-Jonglage.
eyebrow: Mobile & Remote
permalink: /de/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

Standardmäßig lauscht purplemux nur lokal. Tailscale Serve ist der sauberste Weg, es deinen anderen Geräten verfügbar zu machen: WireGuard-verschlüsselt, automatische Let's-Encrypt-Zertifikate, und keine Firewall-Änderungen.

## Warum Tailscale

- **WireGuard** — jede Verbindung ist Gerät-zu-Gerät verschlüsselt.
- **Automatisches HTTPS** — Tailscale provisioniert ein echtes Zertifikat für `*.<tailnet>.ts.net`.
- **Kein Port-Forwarding** — deine Maschine öffnet nie einen Port ins öffentliche Internet.
- **HTTPS ist auf iOS Pflicht** — PWA-Installation und Web Push verweigern beide ohne. Siehe [PWA-Setup](/purplemux/de/docs/pwa-setup/) und [Web Push](/purplemux/de/docs/web-push/).

## Voraussetzungen

- Ein Tailscale-Account, mit dem `tailscale`-Daemon installiert und auf der Maschine, die purplemux betreibt, eingeloggt.
- HTTPS auf dem Tailnet aktiviert (Admin-Konsole → DNS → HTTPS Certificates aktivieren, falls nicht schon geschehen).
- purplemux läuft auf dem Default-Port `8022` (oder wo immer du `PORT` gesetzt hast).

## Ausführen

Eine Zeile:

```bash
tailscale serve --bg 8022
```

Tailscale wickelt dein lokales `http://localhost:8022` in HTTPS und exponiert es im Tailnet unter:

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` ist der Hostname der Box; `<tailnet>` ist das MagicDNS-Suffix deines Tailnets. Öffne diese URL auf einem anderen Gerät, das im selben Tailnet eingeloggt ist, und du bist drin.

Zum Stoppen:

```bash
tailscale serve --bg off 8022
```

## Was du tun kannst, sobald es läuft

- Öffne die URL auf dem Handy, tipp **Teilen → Zum Home-Bildschirm**, und folge dem [PWA-Setup](/purplemux/de/docs/pwa-setup/).
- Push aus dem Standalone-PWA aktivieren: [Web Push](/purplemux/de/docs/web-push/).
- Erreich dasselbe Dashboard von Tablet, Laptop oder einem anderen Desktop — Workspace-Zustand synchronisiert in Echtzeit.

{% call callout('tip', 'Funnel vs. Serve') %}
`tailscale serve` hält purplemux privat in deinem Tailnet — fast immer das, was du willst. `tailscale funnel` würde es ins öffentliche Internet exponieren, was für einen persönlichen Multiplexer übertrieben (und riskant) ist.
{% endcall %}

## Reverse-Proxy-Fallback

Wenn Tailscale keine Option ist, tut es jeder Reverse-Proxy mit echtem TLS-Zertifikat. Die eine Sache, die du richtig machen musst, sind **WebSocket-Upgrades** — purplemux nutzt sie für Terminal-I/O, Status-Sync und die Live-Timeline.

Nginx (Skizze):

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy ist einfacher — `reverse_proxy 127.0.0.1:8022` handhabt Upgrade-Header automatisch.

Ohne `Upgrade`-/`Connection`-Forwarding rendert das Dashboard, aber Terminals verbinden sich nicht und der Status hängt fest. Wenn etwas halb-funktional wirkt, verdächtige zuerst diese Header.

## Troubleshooting

- **HTTPS noch nicht provisioniert** — das erste Zertifikat kann eine Minute dauern. Ein erneuter `tailscale serve --bg 8022` nach kurzer Wartezeit löst das meist.
- **Browser warnt vor Zertifikat** — stell sicher, dass du genau die `<machine>.<tailnet>.ts.net`-URL nutzt, nicht die LAN-IP.
- **Mobile sagt „nicht erreichbar"** — bestätige, dass das Handy im selben Tailnet eingeloggt und Tailscale in den OS-Einstellungen aktiv ist.
- **Selbstsignierte Zertifikate** — Web Push registriert sich nicht. Nutz Tailscale Serve oder ein echtes ACME-ausgestelltes Zertifikat über deinen Reverse-Proxy.

## Wie es weitergeht

- **[PWA-Setup](/purplemux/de/docs/pwa-setup/)** — auf den Home-Bildschirm installieren, jetzt da du HTTPS hast.
- **[Web-Push-Notifications](/purplemux/de/docs/web-push/)** — Background-Alerts einschalten.
- **[Sicherheit & Auth](/purplemux/de/docs/security-auth/)** — Passwort, Hashing und was die Tailnet-Exposition impliziert.
