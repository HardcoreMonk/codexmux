---
title: Berechtigungs-Prompts
description: Wie purplemux Claude Codes „Darf ich das ausführen?"-Dialoge abfängt und dich vom Dashboard, der Tastatur oder dem Handy aus genehmigen lässt.
eyebrow: Claude Code
permalink: /de/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Claude Code blockiert standardmäßig auf Berechtigungs-Dialogen — für Tool-Calls, Datei-Schreibvorgänge und Ähnliches. purplemux fängt diese Dialoge im Moment ihres Erscheinens ab und routet sie auf das Gerät, das du gerade in der Hand hast.

## Was abgefangen wird

Claude Code feuert einen `Notification`-Hook aus mehreren Gründen. purplemux behandelt nur zwei Notification-Typen als Berechtigungs-Prompts:

- `permission_prompt` — der Standard-„Darf dieses Tool laufen?"-Dialog
- `worker_permission_prompt` — dasselbe von einem Sub-Agent

Alles andere (Idle-Erinnerungen usw.) wird auf der Status-Seite ignoriert und kippt den Tab nicht auf **Eingabe nötig** und sendet keinen Push.

## Was passiert, wenn einer feuert

1. Claude Code emittiert einen `Notification`-Hook. Das Shell-Skript unter `~/.purplemux/status-hook.sh` POSTet das Event und den Notification-Typ an den lokalen Server.
2. Der Server kippt den Tab-Zustand auf **Eingabe nötig** (gelber Puls) und broadcastet die Änderung über den Status-WebSocket.
3. Das Dashboard rendert den Prompt **inline in der Timeline**, mit denselben Optionen, die Claude angeboten hat — kein Modal, kein Kontextwechsel.
4. Wenn du Notification-Berechtigung erteilt hast, feuert ein Web Push und/oder eine Desktop-Benachrichtigung für `needs-input`.

Die Claude-CLI selbst wartet immer noch auf stdin. purplemux liest die Optionen des Prompts aus tmux und leitet deine Wahl zurück, sobald du eine triffst.

## Wie du antwortest

Drei gleichwertige Wege:

- **Klicke** die Option in der Timeline.
- **Drück die Zahl** — <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> — passend zum Optionsindex.
- **Tipp die Push-Notification** auf dem Handy, die direkt zum Prompt deeplinkt; wähle dort.

Sobald du wählst, schickt purplemux die Eingabe an tmux, der Tab wechselt zurück auf **Busy**, und Claude macht mitten im Stream weiter. Du musst nichts weiter bestätigen — der Klick *ist* die Bestätigung.

{% call callout('tip', 'Aufeinanderfolgende Prompts werden automatisch neu geladen') %}
Wenn Claude mehrere Fragen hintereinander stellt, rendert sich der Inline-Prompt mit den neuen Optionen, sobald die nächste `Notification` ankommt. Du musst die vorherige nicht erst dismissen.
{% endcall %}

## Mobiler Flow

Mit installierter PWA und erteilten Notifications feuert Web Push, egal ob der Browser-Tab offen, im Hintergrund oder geschlossen ist:

- Die Notification heißt „Eingabe erforderlich" und identifiziert die Session.
- Tippen darauf öffnet purplemux fokussiert auf diesem Tab.
- Der Inline-Prompt ist schon gerendert; wähle eine Option mit einem Tipp.

Das ist der Hauptgrund, [Tailscale + PWA](/purplemux/de/docs/quickstart/#vom-handy-aus-erreichen) einzurichten — Approvals folgen dir vom Schreibtisch weg.

## Wenn die Optionen nicht parsbar sind

In seltenen Fällen (ein Prompt, der aus dem tmux-Scrollback gerollt ist, bevor purplemux ihn lesen konnte) kommt die Optionsliste leer zurück. Die Timeline zeigt eine „Prompt konnte nicht gelesen werden"-Karte und versucht es bis zu vier Mal mit Backoff. Schlägt es weiterhin fehl, wechsel für diesen Tab in den **Terminal**-Modus und antworte in der rohen CLI — der zugrundeliegende Claude-Prozess wartet noch.

## Was ist mit Idle-Erinnerungen?

Andere Notification-Typen von Claude — z. B. Idle-Erinnerungen — landen weiter beim Hook-Endpunkt. Der Server loggt sie, ändert aber den Tab-Zustand nicht, sendet keinen Push und zeigt keinen UI-Prompt. Das ist Absicht: Nur Events, die Claude *blockieren*, brauchen deine Aufmerksamkeit.

## Wie es weitergeht

- **[Session-Status](/purplemux/de/docs/session-status/)** — was der **Eingabe nötig**-Zustand bedeutet und wie er erkannt wird.
- **[Live-Session-Ansicht](/purplemux/de/docs/live-session-view/)** — wo der Inline-Prompt gerendert wird.
- **[Browser-Unterstützung](/purplemux/de/docs/browser-support/)** — Web-Push-Anforderungen (besonders iOS Safari 16.4+).
