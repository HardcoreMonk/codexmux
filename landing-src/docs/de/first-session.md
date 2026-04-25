---
title: Erste Session
description: Eine geführte Tour durchs Dashboard — vom leeren Workspace zur ersten laufenden, überwachten Claude-Session.
eyebrow: Erste Schritte
permalink: /de/docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux läuft bereits (falls nicht, siehe [Schnellstart](/purplemux/de/docs/quickstart/)). Diese Seite erklärt, was die UI tatsächlich macht, damit sich die ersten Minuten weniger abstrakt anfühlen.

## Das Dashboard

Wenn du `http://localhost:8022` öffnest, landest du in einem **Workspace**. Stell dir einen Workspace als Ordner zusammenhängender Tabs vor — einer für das Projekt, das du gerade Claude-codest, einer für die Docs, die du schreibst, einer für ad-hoc-Shell-Arbeit.

Das Layout:

- **Linke Seitenleiste** — Workspaces und Sessions, Claude-Status-Badges, Rate-Limit-Widget, Notizen, Statistiken
- **Hauptbereich** — Panels innerhalb des aktuellen Workspaces; jedes Panel kann mehrere Tabs enthalten
- **Obere Leiste** — Workspace-Name, Split-Steuerung, Einstellungen

Schalte die Seitenleiste jederzeit mit <kbd>⌘B</kbd> ein/aus. Wechsel zwischen Workspace- und Session-Modus mit <kbd>⌘⇧B</kbd>.

## Einen Workspace anlegen

Beim ersten Start hast du einen Standard-Workspace. Um einen weiteren hinzuzufügen:

1. Klicke **+ Neuer Workspace** oben in der Seitenleiste (<kbd>⌘N</kbd>).
2. Benenne ihn und wähle ein Standard-Verzeichnis — hier starten die Shells neuer Tabs.
3. Drücke Enter. Der leere Workspace öffnet sich.

Du kannst Workspaces später per Drag-and-Drop in der Seitenleiste umsortieren und umbenennen.

## Den ersten Tab öffnen

Ein Workspace startet leer. Füge einen Tab mit <kbd>⌘T</kbd> oder dem **+**-Button in der Tab-Leiste hinzu.

Wähle ein **Template**:

- **Terminal** — eine leere Shell. Gut für `vim`, `docker`, Skripte.
- **Claude** — startet mit bereits laufendem `claude` in der Shell.

{% call callout('tip', 'Templates sind nur Shortcuts') %}
Unter der Haube ist jeder Tab eine normale Shell. Das Claude-Template ist nichts anderes als „öffne ein Terminal und führe `claude` aus". Wenn du später `claude` manuell in einem Terminal-Tab startest, bemerkt purplemux das und beginnt genauso, den Status anzuzeigen.
{% endcall %}

## Den Session-Status lesen

Schau auf die **Session-Zeile in der Seitenleiste** für deinen Tab. Du siehst einen dieser Indikatoren:

| Zustand | Bedeutung |
|---|---|
| **Idle** (grau) | Claude wartet auf deine Eingabe. |
| **Busy** (lila Spinner) | Claude arbeitet — liest Dateien, führt Tools aus. |
| **Eingabe nötig** (gelb) | Claude hat einen Berechtigungs-Prompt oder eine Frage. |
| **Review** (blau) | Arbeit erledigt, Claude ist gestoppt; es gibt etwas zu prüfen. |

Übergänge sind nahezu sofort. Siehe [Session-Status](/purplemux/de/docs/session-status/) für die Erkennungslogik.

## Auf einen Berechtigungs-Prompt antworten

Wenn Claude bittet, ein Tool auszuführen oder eine Datei zu bearbeiten, **fängt purplemux den Prompt ab** und zeigt ihn inline in der Session-Ansicht. Du kannst:

- **1 · Yes** / **2 · Yes, always** / **3 · No** klicken, oder
- die Zifferntasten auf der Tastatur drücken, oder
- ihn ignorieren und am Handy beantworten — Mobile Web Push feuert dieselbe Benachrichtigung.

Die Claude-CLI blockiert beim abgefangenen Prompt nie wirklich; purplemux leitet deine Antwort zurück.

## Splitten und wechseln

Wenn ein Tab läuft, probier:

- <kbd>⌘D</kbd> — aktuelles Panel nach rechts splitten
- <kbd>⌘⇧D</kbd> — nach unten splitten
- <kbd>⌘⌥←/→/↑/↓</kbd> — Fokus zwischen Splits bewegen
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — voriger / nächster Tab

Vollständige Liste auf der Seite [Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/).

## Speichern und wiederherstellen

Schließ den Browser. Deine Tabs verschwinden nicht — tmux hält sie auf dem Server offen. Aktualisiere in einer Stunde (oder einer Woche), und purplemux stellt das exakte Layout wieder her, inklusive Split-Verhältnissen und Arbeitsverzeichnissen.

Sogar ein Server-Reboot ist erholbar: Beim Neustart liest purplemux das gespeicherte Layout aus `~/.purplemux/workspaces.json`, startet Shells in den richtigen Verzeichnissen und hängt Claude-Sessions möglichst wieder an.

## Vom Handy aus erreichen

Führe aus:

```bash
tailscale serve --bg 8022
```

Öffne auf dem Handy `https://<machine>.<tailnet>.ts.net`, tippe **Teilen → Zum Home-Bildschirm** und erteile Benachrichtigungs-Berechtigungen. Du erhältst jetzt Push-Alerts für **Eingabe nötig**- und **Review**-Zustände, auch wenn der Tab geschlossen ist.

Vollständige Anleitung: [PWA-Setup](/purplemux/de/docs/pwa-setup/) · [Web Push](/purplemux/de/docs/web-push/) · [Tailscale](/purplemux/de/docs/tailscale/).

## Wie es weitergeht

- **[Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/)** — alle Bindings auf einen Blick.
- **[Browser-Unterstützung](/purplemux/de/docs/browser-support/)** — Kompatibilitätsmatrix, vor allem iOS Safari 16.4+.
- Erkunde die Seitenleiste: **Notizen** (<kbd>⌘⇧E</kbd>) für den AI-Tagesbericht, **Statistiken** (<kbd>⌘⇧U</kbd>) für Nutzungsanalysen.
