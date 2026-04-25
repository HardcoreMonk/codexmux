---
title: Quick-Prompts & Anhänge
description: Eine gespeicherte Prompt-Bibliothek, Drag-Drop-Bilder, Datei-Anhänge und eine wiederverwendbare Nachrichten-History — alles in der Eingabeleiste unter der Timeline.
eyebrow: Claude Code
permalink: /de/docs/quick-prompts-attachments/index.html
---
{% from "docs/callouts.njk" import callout %}

Die Eingabeleiste unter der Timeline ist mehr als ein Textfeld. Sie ist der Ort, an dem gespeicherte Prompts, Anhänge und Nachrichten-History leben, damit das, was du zehnmal am Tag tippst, nicht zehnmal getippt werden muss.

## Quick-Prompts

Quick-Prompts sind kurze, benannte Einträge, gespeichert in `~/.purplemux/quick-prompts.json`. Sie erscheinen als Chips über der Eingabeleiste — ein Klick sendet den Prompt, als hättest du ihn getippt.

Zwei Built-ins sind out-of-the-box dabei und können jederzeit deaktiviert werden:

- **Commit** — führt `/commit-commands:commit` aus
- **Simplify** — führt `/simplify` aus

Eigene unter **Einstellungen → Quick-Prompts** hinzufügen:

1. Klick **Prompt hinzufügen**.
2. Gib einen Namen (das Chip-Label) und einen Body (was gesendet wird) an.
3. Per Drag umsortieren. Toggle aus, um zu verstecken, ohne zu löschen.

Was du im Body tippst, wird wortwörtlich gesendet — inklusive Slash-Commands, mehrzeiliger Prompts oder Templates wie „Erkläre die im Editor offene Datei und schlag eine Verbesserung vor."

{% call callout('tip', 'Slash-Commands zählen') %}
Quick-Prompts funktionieren prima als Ein-Klick-Trigger für Claude-Code-Slash-Commands. Ein „Review this PR"-Chip, der auf `/review` zeigt, spart jedes Mal ein paar Tastendrücke.
{% endcall %}

## Bilder per Drag & Drop

Drop eine Bilddatei (PNG, JPG, WebP usw.) irgendwo auf die Eingabeleiste, um sie anzuhängen. purplemux lädt die Datei in einen temporären Pfad auf dem Server hoch und fügt automatisch eine Referenz in deinen Prompt ein.

Du kannst außerdem:

- ein Bild **direkt aus der Zwischenablage einfügen**
- die **Büroklammer klicken**, um aus einem Datei-Dialog zu wählen
- bis zu **20 Dateien pro Nachricht** anhängen

Eine Thumbnail-Leiste erscheint über der Eingabe, solange Anhänge anstehen. Jedes Thumbnail hat ein X zum Entfernen vor dem Senden.

## Andere Datei-Anhänge

Dieselbe Büroklammer funktioniert auch für Nicht-Bilddateien — Markdown, JSON, CSV, Source-Files, alles. purplemux legt sie in ein Temp-Verzeichnis und fügt den Pfad ein, damit Claude sie als Teil der Anfrage `read`en kann.

Das ist der einfachste Weg, etwas zu teilen, das Claude nicht selbst erreichen kann — wie ein von einer anderen Maschine kopierter Stack-Trace oder eine Config-Datei aus einem anderen Projekt.

## Mobil-freundlich

Anhänge und die Büroklammer sind auf dem Handy in voller Größe. Drop einen Screenshot aus dem iOS-Share-Sheet oder nutz den Kamera-Button (Android), um ein Foto direkt aus der Galerie anzuhängen.

Die Eingabeleiste reflowt für schmale Bildschirme — die Chips werden zu einem horizontalen Scroller, das Textfeld wächst auf bis zu fünf Zeilen, bevor es scrollt.

## Nachrichten-History

Jeder Prompt, den du in einem Workspace gesendet hast, wird in einer pro-Workspace-History behalten. Um einen wiederzuverwenden:

- Drück <kbd>↑</kbd> in einer leeren Eingabeleiste, um durch die letzten Nachrichten zu steppen
- Oder öffne den **History**-Picker für eine durchsuchbare Liste

Alte Einträge können aus dem Picker gelöscht werden. History wird neben anderen Workspace-Daten unter `~/.purplemux/` gespeichert, niemals außerhalb der Maschine gesendet.

## Tastatur

| Taste | Aktion |
|---|---|
| <kbd>⌘I</kbd> | Eingabe von überall in der Session-Ansicht fokussieren |
| <kbd>Enter</kbd> | Senden |
| <kbd>⇧Enter</kbd> | Neue Zeile einfügen |
| <kbd>Esc</kbd> | Während Claude busy ist, einen Interrupt senden |
| <kbd>↑</kbd> | Durch die Nachrichten-History zurück steppen (wenn leer) |

## Wie es weitergeht

- **[Live-Session-Ansicht](/purplemux/de/docs/live-session-view/)** — wo deine Prompts und Claudes Antworten erscheinen.
- **[Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/)** — die vollständige Bindungstabelle.
- **[Berechtigungs-Prompts](/purplemux/de/docs/permission-prompts/)** — was passiert, wenn du eine Anfrage sendest, die Approval braucht.
