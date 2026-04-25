---
title: Live-Session-Ansicht
description: Was das Timeline-Panel wirklich zeigt — Nachrichten, Tool-Calls, Tasks und Prompts als Events statt CLI-Scrollback.
eyebrow: Claude Code
permalink: /de/docs/live-session-view/index.html
---
{% from "docs/callouts.njk" import callout %}

Wenn ein Tab Claude Code ausführt, ersetzt purplemux die rohe Terminal-Ansicht durch eine strukturierte Timeline. Gleiche Session, gleiches JSONL-Transkript — aber als diskrete Events angeordnet, die du scannen, scrollen und verlinken kannst.

## Warum eine Timeline besser als Scrollback ist

Die Claude-CLI ist interaktiv. Im Terminal nachzusehen, was sie vor 15 Minuten getan hat, heißt, an allem vorbeizuscrollen, was seither passiert ist, umgebrochene Zeilen zu lesen und zu raten, wo ein Tool-Call endet und der nächste beginnt.

Die Timeline behält dieselben Daten und ergänzt Struktur:

- Eine Zeile pro Nachricht, Tool-Call, Task oder Prompt
- Tool-Inputs und -Outputs zusammen gruppiert
- Permanente Anker — Events rutschen nicht oben raus, wenn der Buffer voll wird
- Der aktuelle Schritt ist immer am unteren Rand mit verstrichenem Zeit-Counter angepinnt

Du kannst jederzeit über den Modus-Toggle in der oberen Leiste ins Terminal springen. Die Timeline ist eine Sicht auf dieselbe Session, keine separate.

## Was du siehst

Jede Zeile in der Timeline entspricht einem Eintrag im Claude-Code-JSONL-Transkript:

| Typ | Was es zeigt |
|---|---|
| **Nutzer-Nachricht** | Dein Prompt als Chat-Bubble. |
| **Assistant-Nachricht** | Claudes Antwort, als Markdown gerendert. |
| **Tool-Call** | Tool-Name, wichtige Argumente und die Antwort — `read`, `edit`, `bash` usw. |
| **Tool-Group** | Aufeinanderfolgende Tool-Calls, in eine Karte zusammengefasst. |
| **Task / Plan** | Mehrstufige Pläne mit Checkbox-Fortschritt. |
| **Sub-Agent** | Agent-Aufrufe mit eigenem Fortschritt gruppiert. |
| **Berechtigungs-Prompt** | Der abgefangene Prompt mit denselben Optionen, die Claude anbietet. |
| **Compacting** | Ein dezenter Indikator, wenn Claude den Kontext auto-compacted. |

Lange Assistant-Nachrichten klappen sich auf einen Snippet mit Expand-Affordance ein; lange Tool-Outputs werden mit einem „mehr anzeigen"-Toggle gekürzt.

## Wie es live bleibt

Die Timeline wird über einen WebSocket auf `/api/timeline` gespeist. Der Server führt ein `fs.watch` auf der aktiven JSONL-Datei aus, parst angehängte Einträge und pusht sie an den Browser, sobald sie passieren. Es gibt kein Polling und keinen vollen Re-Fetch — der initiale Payload sendet die bestehenden Einträge, alles danach läuft inkrementell.

Während Claude `busy` ist, siehst du außerdem:

- Einen Spinner mit der Live-verstrichenen Zeit für den aktuellen Schritt
- Den aktuellen Tool-Call (z. B. „Reading src/lib/auth.ts")
- Einen kurzen Snippet des neuesten Assistant-Texts

Die kommen vom Metadaten-Pass des JSONL-Watchers und aktualisieren sich, ohne den Session-Zustand zu ändern.

## Scrollen, Anker und History

Die Timeline scrollt automatisch, wenn du schon unten bist, und bleibt stehen, wenn du nach oben scrollst, um etwas zu lesen. Ein schwebender **Nach unten scrollen**-Button erscheint, sobald du mehr als einen Bildschirm über dem letzten Eintrag bist.

Bei langen Sessions laden ältere Einträge on demand, wenn du nach oben scrollst. Die Claude-Session-ID bleibt über Resumes hinweg erhalten, sodass das Aufnehmen einer Session von gestern dich dort landen lässt, wo du aufgehört hast.

{% call callout('tip', 'Zur Eingabe springen') %}
Drück <kbd>⌘I</kbd> von überall in der Timeline, um die Eingabeleiste unten zu fokussieren. <kbd>Esc</kbd> sendet einen Interrupt an den laufenden Claude-Prozess.
{% endcall %}

## Berechtigungs-Prompts inline

Wenn Claude bittet, ein Tool auszuführen oder eine Datei zu bearbeiten, erscheint der Prompt inline in der Timeline statt als Modal. Du kannst die Option klicken, die passende Zifferntaste drücken oder sie ignorieren und am Handy via Web Push antworten. Siehe [Berechtigungs-Prompts](/purplemux/de/docs/permission-prompts/) für den vollständigen Ablauf.

## Modi auf einem einzelnen Tab

Die obere Leiste lässt dich umschalten, was das rechte Panel für dieselbe Session zeigt:

- **Claude** — die Timeline (Default)
- **Terminal** — die rohe xterm.js-Ansicht
- **Diff** — Git-Änderungen für das Arbeitsverzeichnis

Modi zu wechseln startet nichts neu. Die Session läuft auf tmux hinter allen drei Sichten weiter.

Shortcuts: <kbd>⌘⇧C</kbd> · <kbd>⌘⇧T</kbd> · <kbd>⌘⇧F</kbd>.

## Wie es weitergeht

- **[Berechtigungs-Prompts](/purplemux/de/docs/permission-prompts/)** — der Inline-Approval-Flow.
- **[Session-Status](/purplemux/de/docs/session-status/)** — die Badges, die die Timeline-Indikatoren steuern.
- **[Quick-Prompts & Anhänge](/purplemux/de/docs/quick-prompts-attachments/)** — was die Eingabeleiste unten kann.
