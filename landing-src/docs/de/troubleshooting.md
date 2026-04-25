---
title: Troubleshooting & FAQ
description: Häufige Probleme, schnelle Antworten und die Fragen, die am meisten kommen.
eyebrow: Referenz
permalink: /de/docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

Wenn etwas hier nicht zu dem passt, was du siehst, [eröffne bitte ein Issue](https://github.com/subicura/purplemux/issues) mit deiner Plattform, deinem Browser und der relevanten Log-Datei aus `~/.purplemux/logs/`.

## Installation & Startup

### `tmux: command not found`

purplemux braucht tmux 3.0+ auf dem Host. Installier es:

```bash
# macOS (Homebrew)
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

Verifizieren mit `tmux -V`. tmux 2.9+ besteht den Preflight-Check technisch, aber 3.0+ ist das, wogegen wir testen.

### `node: command not found` oder „Node.js 20 oder neuer"

Installier Node 20 LTS oder neuer. Prüfen mit `node -v`. Die native macOS-App bringt ihr eigenes Node mit, das gilt also nur für die `npx` / `npm install -g`-Pfade.

### „purplemux is already running (pid=…, port=…)"

Eine andere purplemux-Instanz lebt und antwortet auf `/api/health`. Entweder die nutzen (gedruckte URL öffnen) oder zuerst stoppen:

```bash
# finden
ps aux | grep purplemux

# oder via Lock-File killen
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### Veraltete Lock — startet nicht, aber kein Prozess läuft

`~/.purplemux/pmux.lock` ist übrig geblieben. Entfernen:

```bash
rm ~/.purplemux/pmux.lock
```

Falls du purplemux jemals mit `sudo` gestartet hast, gehört die Datei evtl. root — `sudo rm` einmalig.

### `Port 8022 is in use, finding an available port...`

Ein anderer Prozess hält `8022`. Der Server fällt auf einen zufälligen freien Port zurück und gibt die neue URL aus. Um den Port selbst zu wählen:

```bash
PORT=9000 purplemux
```

Finde, was `8022` hält, mit `lsof -iTCP:8022 -sTCP:LISTEN -n -P`.

### Funktioniert es unter Windows?

**Nicht offiziell.** purplemux hängt an `node-pty` und tmux, beide laufen nicht nativ unter Windows. WSL2 funktioniert meistens (du bist effektiv unter Linux), ist aber außerhalb unserer Test-Matrix.

## Sessions & Restore

### Browser geschlossen hat alles getötet

Sollte nicht — tmux hält jede Shell auf dem Server offen. Wenn ein Refresh die Tabs nicht zurückbringt:

1. Prüf, dass der Server noch läuft (`http://localhost:8022/api/health`).
2. Prüf, dass die tmux-Sessions existieren: `tmux -L purple ls`.
3. Schau in `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log` nach Fehlern während `autoResumeOnStartup`.

Sagt tmux „no server running", hat der Host rebooted oder etwas hat tmux gekillt. Sessions sind weg, aber das Layout (Workspaces, Tabs, Arbeitsverzeichnisse) bleibt in `~/.purplemux/workspaces/{wsId}/layout.json` erhalten und wird beim nächsten purplemux-Start neu gestartet.

### Eine Claude-Session lässt sich nicht resumen

`autoResumeOnStartup` führt das gespeicherte `claude --resume <uuid>` für jeden Tab erneut aus, aber wenn die zugehörige `~/.claude/projects/.../sessionId.jsonl` nicht mehr existiert (gelöscht, archiviert oder Projekt verschoben), schlägt der Resume fehl. Öffne den Tab und starte eine neue Konversation.

### Meine Tabs zeigen alle „unknown"

`unknown` bedeutet, ein Tab war `busy` vor einem Server-Restart, und Recovery läuft noch. `resolveUnknown` läuft im Hintergrund und bestätigt `idle` (Claude beendet) oder `ready-for-review` (finale Assistant-Nachricht vorhanden). Steht ein Tab länger als zehn Minuten in `unknown`, kippt das **Busy-Stuck-Sicherheitsnetz** ihn still auf `idle`. Siehe [STATUS.md](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) für die vollständige State-Machine.

## Browser & UI

### Web-Push-Notifications feuern nie

Geh diese Checkliste durch:

1. **Nur iOS Safari ≥ 16.4.** Frühere iOS hat überhaupt kein Web Push.
2. **Auf iOS muss es eine PWA sein.** Tipp **Teilen → Zum Home-Bildschirm** zuerst; Push feuert nicht aus einem normalen Safari-Tab.
3. **HTTPS erforderlich.** Selbstsignierte Zertifikate funktionieren nicht — Web Push verweigert die Registrierung still. Nutz Tailscale Serve (kostenloses Let's Encrypt) oder eine echte Domain hinter Nginx / Caddy.
4. **Notification-Berechtigung erteilt.** **Einstellungen → Notification → An** in purplemux *und* die Browser-Berechtigung müssen beide erlaubt sein.
5. **Abonnements existieren.** `~/.purplemux/push-subscriptions.json` sollte einen Eintrag fürs Gerät haben. Falls leer, erteil die Berechtigung neu.

Siehe [Browser-Unterstützung](/purplemux/de/docs/browser-support/) für die vollständige Kompatibilitätsmatrix.

### iOS Safari 16.4+, aber trotzdem keine Notifications

Manche iOS-Versionen verlieren das Abonnement nach langer PWA-geschlossen-Phase. Öffne die PWA, lehn die Notification-Berechtigung ab und erteile sie neu, und prüf `push-subscriptions.json` erneut.

### Safari-Privatfenster persistiert nichts

IndexedDB ist in Safari 17+ Privatfenstern deaktiviert, der Workspace-Cache überlebt also keinen Restart. Nutz ein normales Fenster.

### Mobile-Terminal verschwindet nach Backgrounding

iOS Safari baut den WebSocket nach ca. 30 s Backgrounding ab. tmux hält die eigentliche Session am Leben — wenn du zum Tab zurückkehrst, verbindet sich purplemux neu und rendert neu. Das ist iOS, nicht wir.

### Firefox + Tailscale Serve = Zertifikats-Warnung

Wenn dein Tailnet eine Custom-Domain nutzt, die nicht `*.ts.net` ist, ist Firefox bei HTTPS-Trust pingeliger als Chrome. Akzeptier das Zertifikat einmal — danach bleibt es.

### „Browser zu alt" oder Features fehlen

Führ **Einstellungen → Browser-Check** für einen Pro-API-Bericht aus. Alles unter den Mindestversionen in [Browser-Unterstützung](/purplemux/de/docs/browser-support/) verliert Features graceful, ist aber nicht unterstützt.

## Netzwerk & Remote-Zugriff

### Kann ich purplemux ins Internet exponieren?

Ja, aber immer über HTTPS. Empfohlen:

1. **Tailscale Serve** — `tailscale serve --bg 8022` gibt WireGuard-Verschlüsselung + automatische Zertifikate. Kein Port-Forwarding nötig.
2. **Reverse-Proxy** — Nginx / Caddy / Traefik. Stell sicher, die `Upgrade`- und `Connection`-Header zu forwarden, sonst brechen WebSockets.

Plain HTTP über das offene Internet ist eine schlechte Idee — der Auth-Cookie ist HMAC-signiert, aber die WebSocket-Payloads (Terminal-Bytes!) sind nicht verschlüsselt.

### Andere Geräte im LAN erreichen purplemux nicht

Standardmäßig erlaubt purplemux nur Localhost. Öffne den Zugriff via Env oder in den App-Einstellungen:

```bash
HOST=lan,localhost purplemux       # LAN-freundlich
HOST=tailscale,localhost purplemux # tailnet-freundlich
HOST=all purplemux                 # alles
```

Oder **Einstellungen → Netzwerk-Zugriff** in der App, das in `~/.purplemux/config.json` schreibt. (Wenn `HOST` per Env gesetzt ist, ist das Feld gesperrt.) Siehe [Ports & Umgebungsvariablen](/purplemux/de/docs/ports-env-vars/) für Keyword- und CIDR-Syntax.

### Reverse-Proxy-WebSocket-Probleme

Wenn `/api/terminal` verbindet und sofort wieder abbricht, strippt der Proxy `Upgrade` / `Connection`-Header. Minimales Nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy: WebSocket-Forwarding ist Default; einfach `reverse_proxy 127.0.0.1:8022`.

## Daten & Speicherung

### Wo sind meine Daten?

Alles ist lokal unter `~/.purplemux/`. Nichts verlässt deine Maschine. Das Login-Passwort ist ein scrypt-Hash in `config.json`. Siehe [Daten-Verzeichnis](/purplemux/de/docs/data-directory/) für das vollständige Layout.

### Ich habe mein Passwort vergessen

Lösch `~/.purplemux/config.json` und starte neu. Onboarding läuft erneut. Workspaces, Layouts und History bleiben (das sind separate Dateien).

### Tab-Indikator hängt für immer auf „Busy"

Das `Busy-Stuck-Sicherheitsnetz` kippt einen Tab nach zehn Minuten still auf `idle`, falls der Claude-Prozess gestorben ist. Wenn du nicht warten willst, schließ den Tab und öffne ihn neu — das resettet lokalen State, und das nächste Hook-Event nimmt von einem sauberen Stand auf. Für Root-Cause-Analyse mit `LOG_LEVELS=hooks=debug,status=debug` laufen lassen.

### Konfligiert es mit meiner bestehenden tmux-Config?

Nein. purplemux betreibt ein isoliertes tmux auf einem dedizierten Socket (`-L purple`) mit eigener Config (`src/config/tmux.conf`). Deine `~/.tmux.conf` und alle bestehenden tmux-Sessions bleiben unangetastet.

## Kosten & Nutzung

### Spart purplemux mir Geld?

Direkt nicht. Was es tut: **Nutzung transparent machen** — heutige / monatliche / pro-Projekt-Kosten, pro-Modell-Token-Aufschlüsselungen und 5h- / 7d-Rate-Limit-Countdowns sind alle auf einem Bildschirm, sodass du dein Tempo dosieren kannst, bevor du an die Wand knallst.

### Ist purplemux selbst kostenpflichtig?

Nein. purplemux ist MIT-lizensierte Open Source. Claude-Code-Nutzung wird separat von Anthropic abgerechnet.

### Werden meine Daten irgendwohin gesendet?

Nein. purplemux ist vollständig self-hosted. Die einzigen Netzwerk-Calls sind zu deiner lokalen Claude-CLI (die selbst mit Anthropic redet) und der Versions-Check via `update-notifier` beim Start. Versions-Check mit `NO_UPDATE_NOTIFIER=1` deaktivieren.

## Wie es weitergeht

- **[Browser-Unterstützung](/purplemux/de/docs/browser-support/)** — detaillierte Kompatibilitätsmatrix und bekannte Browser-Eigenheiten.
- **[Daten-Verzeichnis](/purplemux/de/docs/data-directory/)** — was jede Datei tut und was sicher gelöscht werden kann.
- **[Architektur](/purplemux/de/docs/architecture/)** — wie die Teile zusammenpassen, wenn etwas tieferes Graben braucht.
