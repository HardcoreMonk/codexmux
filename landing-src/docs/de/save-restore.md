---
title: Layouts speichern & wiederherstellen
description: Warum deine Tabs genau dort wieder auftauchen, wo du sie verlassen hast — auch nach einem Server-Reboot.
eyebrow: Workspaces & Terminal
permalink: /de/docs/save-restore/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux ist um die Idee gebaut, dass das Schließen eines Browser-Tabs keine Session beendet. Zwei Bausteine arbeiten zusammen: tmux hält die Shells am Leben, und `~/.purplemux/workspaces.json` merkt sich das Layout.

## Was persistiert wird

Alles, was du in einem Workspace siehst:

- Tabs und ihre Reihenfolge
- Panel-Splits und ihre Verhältnisse
- Panel-Typ jedes Tabs — Terminal, Claude, Diff, Web Browser
- Arbeitsverzeichnis jeder Shell
- Workspace-Gruppen, Namen und Reihenfolge

`workspaces.json` wird bei jeder Layout-Änderung transaktional aktualisiert, die Datei spiegelt also immer den aktuellen Zustand. Siehe [Daten-Verzeichnis](/purplemux/de/docs/data-directory/) für die On-Disk-Datei-Übersicht.

## Browser schließen

Tab schließen, neu laden, Laptop zuklappen. Nichts davon beendet Sessions.

Jede Shell lebt in einer tmux-Session auf dem dedizierten `purple`-Socket — vollständig isoliert von deiner persönlichen `~/.tmux.conf`. Öffne `http://localhost:8022` eine Stunde später, und der WebSocket hängt sich an dieselbe tmux-Session, spielt das Scrollback erneut ab und übergibt die Live-PTY zurück an xterm.js.

Du stellst nichts wieder her; du verbindest dich neu.

{% call callout('tip', 'Auch am Handy') %}
Dasselbe gilt für dein Handy. Schließ die PWA, sperr das Gerät, komm morgen zurück — das Dashboard hängt sich neu an, und alles ist da.
{% endcall %}

## Recovery nach einem Server-Reboot

Ein Reboot tötet die tmux-Prozesse — sie sind nur OS-Prozesse. purplemux behandelt das beim nächsten Start:

1. **Layout lesen** — `workspaces.json` beschreibt jeden Workspace, jedes Panel und jeden Tab.
2. **Sessions parallel neu erstellen** — für jeden Tab wird eine neue tmux-Session in seinem gespeicherten Arbeitsverzeichnis gestartet.
3. **Claude automatisch wieder aufnehmen** — Tabs, in denen eine Claude-Session lief, werden mit `claude --resume {sessionId}` neu gestartet, sodass die Konversation dort weitergeht, wo sie aufgehört hat.

Das „parallel" ist wichtig: Wenn du zehn Tabs hattest, kommen alle zehn tmux-Sessions gleichzeitig hoch statt nacheinander. Wenn du den Browser öffnest, ist das Layout schon da.

## Was nicht zurückkommt

Eine Handvoll Dinge lässt sich nicht persistieren:

- **In-Memory-Shell-State** — Umgebungsvariablen, die du gesetzt hast, Background-Jobs, REPLs mitten im Gedanken.
- **Berechtigungs-Prompts in Flight** — wenn Claude beim Server-Tod auf eine Berechtigungsentscheidung wartete, siehst du den Prompt beim Resume erneut.
- **Vordergrundprozesse außer `claude`** — `vim`-Buffer, `htop`, `docker logs -f`. Die Shell ist im selben Verzeichnis zurück; der Prozess nicht.

Das ist der Standard-tmux-Vertrag: Die Shell überlebt, Prozesse darin nicht zwingend.

## Manuelle Steuerung

Normalerweise musst du das nicht anfassen, aber für die Neugierigen:

- Der tmux-Socket heißt `purple`. Inspizieren mit `tmux -L purple ls`.
- Sessions heißen `pt-{workspaceId}-{paneId}-{tabId}`.
- `workspaces.json` zu bearbeiten, während purplemux läuft, ist unsicher — der Server hält sie offen und schreibt durch.

Für die tiefere Story (binäres Protokoll, Backpressure, JSONL-Watching) siehe [Wie es funktioniert](/purplemux/#how) auf der Landingpage.

## Wie es weitergeht

- **[Workspaces & Gruppen](/purplemux/de/docs/workspaces-groups/)** — was pro Workspace gespeichert wird.
- **[Tabs & Panels](/purplemux/de/docs/tabs-panes/)** — was pro Tab gespeichert wird.
- **[Browser-Unterstützung](/purplemux/de/docs/browser-support/)** — bekannte Eigenheiten rund um mobile Hintergrund-Tabs und Reconnects.
