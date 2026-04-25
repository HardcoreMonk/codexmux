---
title: Workspaces & Gruppen
description: Organisiere zusammengehörige Tabs in Workspaces und bündle Workspaces per Drag-and-Drop in Gruppen in der Seitenleiste.
eyebrow: Workspaces & Terminal
permalink: /de/docs/workspaces-groups/index.html
---
{% from "docs/callouts.njk" import callout %}

Ein Workspace ist ein Ordner zusammengehöriger Tabs — Terminal, Diff-Panel und Claude-Session eines Projekts liegen beieinander. Sobald du mehrere hast, halten Gruppen in der Seitenleiste Ordnung.

## Was ein Workspace enthält

Jeder Workspace hat sein eigenes:

- **Standard-Verzeichnis** — wo die Shells neuer Tabs starten.
- **Tabs und Panels** — Terminals, Claude-Sessions, Diff-Panels, Web-Browser-Panels.
- **Layout** — Split-Verhältnisse, Fokus, der aktive Tab in jedem Panel.

Alles wird in `~/.purplemux/workspaces.json` persistiert, der Workspace ist also die Einheit, die purplemux speichert und wiederherstellt. Browser schließen löst keinen Workspace auf; tmux hält die Shells offen, das Layout bleibt.

## Einen Workspace anlegen

Beim ersten Start hast du einen Standard-Workspace. Um einen weiteren hinzuzufügen:

1. Klicke **+ Neuer Workspace** oben in der Seitenleiste oder drücke <kbd>⌘N</kbd>.
2. Benenne ihn und wähle ein Standard-Verzeichnis — typischerweise das Repo-Root des Projekts.
3. Drücke Enter. Der leere Workspace öffnet sich.

{% call callout('tip', 'Wähle das richtige Startverzeichnis') %}
Das Standard-Verzeichnis ist das cwd jeder neuen Shell in diesem Workspace. Zeigst du es auf den Projektroot, ist jeder frische Tab nur eine Tastenkombination von `pnpm dev`, `git status` oder dem Start einer Claude-Session am richtigen Ort entfernt.
{% endcall %}

## Umbenennen und Löschen

In der Seitenleiste, Rechtsklick auf einen Workspace (oder das Kebab-Menü) für **Umbenennen** und **Löschen**. Umbenennen ist auch auf <kbd>⌘⇧R</kbd> für den aktuell aktiven Workspace gebunden.

Beim Löschen werden die tmux-Sessions geschlossen und der Workspace wird aus `workspaces.json` entfernt. Es gibt kein Undo. Bereits abgestürzte oder geschlossene Tabs bleiben weg; aktive Tabs werden sauber beendet.

## Workspaces wechseln

Klicke einen Workspace in der Seitenleiste an oder nutze die Zahlenreihe:

| Aktion | macOS | Linux / Windows |
|---|---|---|
| Zu Workspace 1–9 wechseln | <kbd>⌘1</kbd> – <kbd>⌘9</kbd> | <kbd>Ctrl+1</kbd> – <kbd>Ctrl+9</kbd> |
| Seitenleiste umschalten | <kbd>⌘B</kbd> | <kbd>Ctrl+B</kbd> |
| Seitenleisten-Modus wechseln (Workspace ↔ Sessions) | <kbd>⌘⇧B</kbd> | <kbd>Ctrl+Shift+B</kbd> |

Die Reihenfolge in der Seitenleiste bestimmt das Mapping der Zifferntasten. Zieh einen Workspace nach oben oder unten, um seinen Slot zu ändern.

## Workspaces gruppieren

Sobald du eine Handvoll Workspaces hast, schiebst du sie per Drag-and-Drop in der Seitenleiste in Gruppen. Eine Gruppe ist ein einklappbarer Header — nützlich, um „Kundenarbeit", „Side-Projekte" und „Ops" zu trennen, ohne sie in eine flache Liste zu zwingen.

- **Gruppe erstellen** — zieh einen Workspace auf einen anderen, und die Seitenleiste bietet an, sie zu gruppieren.
- **Umbenennen** — Rechtsklick auf den Gruppen-Header.
- **Umsortieren** — zieh Gruppen nach oben/unten, zieh Workspaces rein und raus.
- **Einklappen** — klick den Chevron im Gruppen-Header.

Gruppen sind reine visuelle Organisation. Sie ändern weder die Persistenz noch das Verhalten der Shortcuts; <kbd>⌘1</kbd> – <kbd>⌘9</kbd> läuft nach wie vor die flache Reihenfolge von oben nach unten ab.

## Wo es auf der Festplatte liegt

Jede Änderung schreibt durch nach `~/.purplemux/workspaces.json`. Du kannst die Datei einsehen oder sichern — siehe [Daten-Verzeichnis](/purplemux/de/docs/data-directory/) für das vollständige Datei-Layout. Wenn du sie löschst, während der Server läuft, fällt purplemux auf einen leeren Workspace zurück und beginnt neu.

## Wie es weitergeht

- **[Tabs & Panels](/purplemux/de/docs/tabs-panes/)** — splitten, umsortieren, fokussieren innerhalb eines Workspaces.
- **[Layouts speichern & wiederherstellen](/purplemux/de/docs/save-restore/)** — wie Workspaces das Browser-Schließen und Server-Reboots überleben.
- **[Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/)** — die vollständige Bindungstabelle.
