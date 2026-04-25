---
title: Seitenleiste & Claude-Optionen
description: Sidebar-Shortcuts umsortieren und ausblenden, die Quick-Prompts-Bibliothek verwalten und Claude-CLI-Flags umschalten.
eyebrow: Anpassung
permalink: /de/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

Die Seitenleiste und die Eingabeleiste bestehen aus kleinen Listen, die du umformen kannst — Shortcut-Links unten in der Seitenleiste, Prompt-Buttons über der Eingabe. Der Claude-Tab in den Einstellungen hält CLI-Level-Toggles für Sessions, die du aus dem Dashboard startest.

## Sidebar-Items

Einstellungen (<kbd>⌘,</kbd>) → Tab **Seitenleiste**. Die Liste steuert die Shortcut-Reihe unten in der Seitenleiste — Links zu Dashboards, internen Tools, allem URL-Adressierbaren.

Jede Zeile hat einen Greif-Anker, einen Namen, eine URL und einen Schalter. Du kannst:

- **Ziehen** am Greif-Anker zum Umsortieren. Sowohl Built-in- als auch Custom-Items bewegen sich frei.
- **Toggeln**, um ein Item ohne Löschen auszublenden.
- **Bearbeiten** von Custom-Items (Stift-Icon) — Name, Icon oder URL ändern.
- **Löschen** von Custom-Items (Mülltonnen-Icon).
- **Auf Default zurücksetzen** — stellt die Built-in-Items wieder her, löscht alle Custom-, säubert die Reihenfolge.

### Ein Custom-Item hinzufügen

Klick **Item hinzufügen** unten. Du bekommst ein kleines Formular:

- **Name** — erscheint als Tooltip und Label.
- **Icon** — gewählt aus einer durchsuchbaren lucide-react-Galerie.
- **URL** — alles `http(s)://...` funktioniert. Internes Grafana, Vercel-Dashboards, ein internes Admin-Tool.

Klick Speichern, und die Zeile erscheint unten in der Liste. Zieh sie dorthin, wo du sie haben willst.

{% call callout('note', 'Built-ins können versteckt, aber nicht gelöscht werden') %}
Built-in-Items (die, die purplemux mitbringt) haben nur einen Schalter und einen Greif-Anker — kein Bearbeiten oder Löschen. Sie sind immer da, falls du es dir anders überlegst. Custom-Items bekommen das volle Set.
{% endcall %}

## Quick-Prompts

Einstellungen → Tab **Quick-Prompts**. Das sind die Buttons über dem Claude-Eingabefeld — Ein-Klick-Senden einer vorgefertigten Nachricht.

Gleiches Muster wie Sidebar-Items:

- Ziehen zum Umsortieren.
- Toggle zum Ausblenden.
- Bearbeiten / Löschen von Custom-Prompts.
- Auf Default zurücksetzen.

Beim Hinzufügen eines Prompts werden ein **Name** (das Button-Label) und der **Prompt** selbst (mehrzeiliger Text) abgefragt. Nutz sie für Dinge, die du oft tippst: „Test-Suite ausführen", „Letzten Commit zusammenfassen", „Aktuellen Diff reviewen".

## Claude-CLI-Optionen

Einstellungen → Tab **Claude**. Diese Flags beeinflussen, *wie purplemux die Claude-CLI in neuen Tabs startet* — sie ändern nicht das Verhalten einer schon laufenden Session.

### Berechtigungs-Checks überspringen

Fügt `--dangerously-skip-permissions` zum `claude`-Befehl hinzu. Claude führt Tools aus und editiert Dateien, ohne jedes Mal nach Approval zu fragen.

Das ist dasselbe Flag, das die offizielle CLI exponiert — purplemux lockert keine Sicherheit darüber hinaus. Lies [Anthropics Doku](https://docs.anthropic.com/en/docs/claude-code/cli-reference), bevor du es einschaltest. Behandle es als Opt-in nur für vertrauenswürdige Workspaces.

### Terminal mit Claude anzeigen

**An** (Default): Ein Claude-Tab zeigt die Live-Session-Ansicht *und* das zugrundeliegende Terminal-Panel side-by-side, sodass du jederzeit in die Shell springen kannst.

**Aus**: Neue Claude-Tabs öffnen mit eingeklapptem Terminal. Die Session-Ansicht füllt das ganze Panel. Du kannst das Terminal pro Tab manuell ausklappen; das hier ändert nur den Default für neu erstellte Tabs.

Nutz die Aus-Einstellung, wenn du Claude meist über die Timeline-Ansicht bedienst und einen saubereren Default willst.

## Wie es weitergeht

- **[Themes & Schriften](/purplemux/de/docs/themes-fonts/)** — hell, dunkel, System; Schriftgrößen-Presets.
- **[Editor-Integration](/purplemux/de/docs/editor-integration/)** — VS Code, Cursor, code-server verdrahten.
- **[Erste Session](/purplemux/de/docs/first-session/)** — Auffrischer zum Dashboard-Layout.
