---
title: Notizen (AI-Tagesbericht)
description: Eine End-of-Day-Zusammenfassung jeder Claude-Code-Session, von einem LLM geschrieben, lokal als Markdown gespeichert.
eyebrow: Claude Code
permalink: /de/docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

Wenn der Tag vorbei ist, kann purplemux die Session-Logs des Tages lesen und dir ein einzeiliges Briefing plus eine pro-Projekt-Markdown-Zusammenfassung schreiben. Das Ganze lebt in der Seitenleiste als **Notizen** und existiert, damit Retros, Standups und 1:1s nicht mit „Was hab ich gestern gemacht?" anfangen.

## Was du pro Tag bekommst

Jeder Eintrag hat zwei Schichten:

- **Einzeiliges Briefing** — ein einzelner Satz, der die Form des Tages einfängt. Direkt in der Notizen-Liste sichtbar.
- **Detail-Ansicht** — klapp das Briefing aus, um einen pro Projekt gruppierten Markdown-Bericht mit H3-Sektionen pro Thema und gepunkteten Highlights darunter zu sehen.

Das Briefing ist, was du scannst; die Detail-Ansicht ist, was du in ein Retro-Doc kopierst.

Ein kleiner Header pro Tag zeigt die Session-Anzahl und Gesamtkosten — dieselben Zahlen wie das [Statistik-Dashboard](/purplemux/de/docs/usage-rate-limits/), in Kurzform.

## Bericht generieren

Berichte werden on-demand generiert, nicht automatisch. In der Notizen-Ansicht:

- **Generieren** neben einem fehlenden Tag erstellt den Bericht des Tages aus den JSONL-Transkripten.
- **Neu generieren** auf einem bestehenden Eintrag baut denselben Tag mit frischem Inhalt neu (nützlich, wenn du Kontext ergänzt oder die Sprache gewechselt hast).
- **Alle generieren** geht jeden fehlenden Tag durch und füllt sie sequentiell. Du kannst die Batch-Aktion jederzeit stoppen.

Das LLM verarbeitet jede Session einzeln, bevor sie pro Projekt gemergt werden, sodass an langen Tagen mit vielen Tabs kein Kontext verloren geht.

{% call callout('note', 'Locale folgt der App') %}
Berichte werden in der Sprache geschrieben, auf die purplemux gesetzt ist. Sprache wechseln und neu generieren liefert denselben Inhalt in der neuen Locale.
{% endcall %}

## Wo es lebt

| Oberfläche | Pfad |
|---|---|
| Seitenleiste | **Notizen**-Eintrag öffnet die Listenansicht |
| Shortcut | <kbd>⌘⇧E</kbd> auf macOS, <kbd>Ctrl⇧E</kbd> auf Linux |
| Speicherung | `~/.purplemux/stats/daily-reports/<datum>.json` |

Jeder Tag ist eine JSON-Datei mit Briefing, detailliertem Markdown, Locale und den Session-Metadaten. Nichts verlässt deine Maschine außer dem LLM-Call selbst, der durch den Claude-Code-Account geht, der auf dem Host konfiguriert ist.

## Pro-Projekt-Struktur

In der Detail-Ansicht sieht ein typischer Tag so aus:

```markdown
**purplemux**

### Landing-Page-Entwurf
- Acht-Sektionen-Struktur mit Hero-/Why-/Mobile-/Stats-Layouts entworfen
- Lila Marken-Farbe als OKLCH-Variable gemacht
- Desktop-/Mobile-Screenshot-Mockup-Frames angewendet

### Feature-Card-Mockups
- Echte Spinner-/Pulse-Indikatoren auf dem Multi-Session-Dashboard reproduziert
- Git-Diff-, Workspace- und Self-Hosted-Mockup-CSS verschärft
```

Sessions, die im selben Projekt gearbeitet haben, werden unter einer Projekt-Überschrift gemergt; Themen innerhalb eines Projekts werden zu H3-Sektionen. Du kannst das gerenderte Markdown direkt in ein Retro-Template kopieren.

## Wenn Tage nicht zusammengefasst werden müssen

Ein Tag ohne Claude-Sessions bekommt keinen Eintrag. Ein Tag mit einer winzigen Session erzeugt vielleicht ein sehr kurzes Briefing — das ist okay; beim nächsten Mal, an dem du wirklich arbeitest, generiert es länger.

Der Batch-Generator überspringt Tage, die schon einen Bericht in der aktuellen Locale haben, und füllt nur echte Lücken.

## Privatsphäre

Der Text, der zum Bauen eines Berichts genutzt wird, sind dieselben JSONL-Transkripte, die du selbst in `~/.claude/projects/` lesen kannst. Die Summarization-Anfrage ist ein einzelner LLM-Call pro Tag; der gecachte Output bleibt unter `~/.purplemux/`. Es gibt keine Telemetrie, keinen Upload, keinen Shared-Cache.

## Wie es weitergeht

- **[Nutzung & Rate-Limits](/purplemux/de/docs/usage-rate-limits/)** — das Dashboard, aus dem die Session-Counts und -Kosten kommen.
- **[Live-Session-Ansicht](/purplemux/de/docs/live-session-view/)** — die Quelldaten, in Echtzeit.
- **[Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/)** — inklusive <kbd>⌘⇧E</kbd> für Notizen.
