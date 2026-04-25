---
title: Git-Workflow-Panel
description: Diff-Viewer, History-Browser und Sync-Steuerung direkt neben dem Terminal — mit Ein-Klick-Übergabe an Claude, wenn etwas bricht.
eyebrow: Workspaces & Terminal
permalink: /de/docs/git-workflow/index.html
---
{% from "docs/callouts.njk" import callout %}

Das Git-Panel ist ein Tab-Typ, genau wie ein Terminal. Öffne es neben einer Claude-Session, und du kannst Änderungen lesen, durch die History wandern und ohne das Dashboard zu verlassen pushen. Wenn Git selbst schiefgeht, übergibt „Frag Claude" das Problem mit einem Klick an eine Session.

## Das Panel öffnen

Füge einen neuen Tab hinzu und wähle **Diff** als Panel-Typ, oder wechsle aus dem Tab-Typ-Menü eines bestehenden Tabs dorthin. Das Panel bindet sich an dasselbe Arbeitsverzeichnis wie seine Geschwister-Shells — wenn dein Tab in `~/code/api` ist, liest das Diff-Panel dieses Repo.

| Aktion | macOS | Linux / Windows |
|---|---|---|
| Aktiven Tab in Diff-Modus wechseln | <kbd>⌘⇧F</kbd> | <kbd>Ctrl+Shift+F</kbd> |

Ist das Verzeichnis kein Git-Repo, sagt das Panel das und bleibt aus dem Weg.

## Der Diff-Viewer

Der Tab Änderungen zeigt Working-Tree-Änderungen pro Datei.

- **Side-by-side oder Inline** — umschalten im Panel-Header. Side-by-side spiegelt GitHubs Split-Ansicht; Inline ist GitHubs Unified-Ansicht.
- **Syntax-Highlighting** — vollständige Spracherkennung für die Sprachen, die dein Editor highlighten würde.
- **Inline-Hunk-Erweiterung** — klick auf Kontextzeilen rund um einen Hunk, um den umliegenden Code zu erweitern, ohne das Panel zu verlassen.
- **Datei-Liste** — navigiere in der Seitenleiste des Panels zwischen geänderten Dateien.

Änderungen aktualisieren sich alle 10 Sekunden, solange das Panel sichtbar ist, und sofort, wenn du in einem anderen Tool speicherst.

## Commit-History

Wechsel zum **History**-Tab für ein paginiertes Commit-Log auf dem aktuellen Branch. Jeder Eintrag zeigt Hash, Subject, Autor und Zeit; klick darauf, um den Diff zu sehen, der in diesem Commit gelandet ist. Praktisch, wenn du dich erinnern willst, warum eine Datei so aussieht, wie sie aussieht, ohne ins Terminal für `git log` zurückzukehren.

## Sync-Panel

Die Header-Leiste zeigt aktuellen Branch, Upstream und einen Ahead/Behind-Counter. Drei Aktionen:

- **Fetch** — `git fetch` gegen den Upstream alle 3 Minuten im Hintergrund, plus on-demand.
- **Pull** — Fast-Forward, wenn möglich.
- **Push** — auf den konfigurierten Upstream pushen.

Sync ist absichtlich schmal. Es weigert sich bei allem, das eine Entscheidung braucht — divergente Branches, schmutzige Worktrees, fehlender Upstream — und sagt dir warum.

{% call callout('warning', 'Wenn Sync nicht durchgeht') %}
Häufige Fehler, die das Panel klar meldet:

- **Kein Upstream** — `git push -u` wurde noch nicht ausgeführt.
- **Auth** — Credentials fehlen oder werden abgewiesen.
- **Diverged** — lokal und remote haben jeweils eigene Commits; erst rebasen oder mergen.
- **Lokale Änderungen** — uncommittete Arbeit blockiert den Pull.
- **Rejected** — Push wegen Non-Fast-Forward abgewiesen.
{% endcall %}

## Frag Claude

Wenn Sync fehlschlägt, bietet der Fehler-Toast einen **Frag Claude**-Button. Ein Klick darauf pipet den Fehler-Kontext — Fehlerart, relevanter `git`-Output und der aktuelle Branch-Zustand — als Prompt in den Claude-Tab im selben Workspace. Claude geht dann die Recovery durch: rebasen, Konflikte lösen, Upstream konfigurieren — was der Fehler eben verlangt.

Das ist der Hauptansatz des Panels: Tooling für den Standardfall, ein LLM für den Long Tail. Du wechselst nicht den Kontext; der Prompt landet in der Session, die du sowieso nutzen wolltest.

## Wie es weitergeht

- **[Tabs & Panels](/purplemux/de/docs/tabs-panes/)** — das Diff-Panel neben einer Claude-Session splitten.
- **[Erste Session](/purplemux/de/docs/first-session/)** — wie Claudes Berechtigungs-Prompts im Dashboard auftauchen.
- **[Web-Browser-Panel](/purplemux/de/docs/web-browser-panel/)** — der andere Panel-Typ, der sich neben einem Terminal lohnt.
