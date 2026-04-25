---
title: Nutzung & Rate-Limits
description: Echtzeit-Countdowns für 5h- und 7d-Rate-Limits in der Seitenleiste, plus ein Statistik-Dashboard für Tokens, Kosten und Projekt-Aufschlüsselungen.
eyebrow: Claude Code
permalink: /de/docs/usage-rate-limits/index.html
---
{% from "docs/callouts.njk" import callout %}

Mitten in der Arbeit ein Rate-Limit zu reißen, ist die schlimmste Art von Unterbrechung. purplemux zieht Claude Codes Quota-Zahlen in die Seitenleiste und ergänzt ein Statistik-Dashboard, sodass du deinen Nutzungsrhythmus auf einen Blick siehst.

## Das Sidebar-Widget

Zwei dünne Balken sitzen unten in der Seitenleiste: **5h** und **7d**. Jeder zeigt:

- Den Prozentsatz des Fensters, den du verbraucht hast
- Die Restzeit bis zum Reset
- Einen schwachen Projektions-Balken dafür, wo du landest, wenn du dein aktuelles Tempo hältst

Hover einen Balken für die volle Aufschlüsselung — verbrauchter Prozent, projizierter Prozent und Reset-Zeit als relative Dauer.

Die Zahlen kommen aus Claude Codes eigenem statusline-JSON. purplemux installiert ein winziges `~/.purplemux/statusline.sh`-Skript, das die Daten jedes Mal an den lokalen Server postet, wenn Claude seine Statusline auffrischt; ein `fs.watch` hält die UI synchron.

## Farb-Schwellen

Beide Balken wechseln die Farbe, abhängig vom Verbrauchsprozent:

| Verbrauch | Farbe |
|---|---|
| 0–49 % | teal — entspannt |
| 50–79 % | gelb — Tempo runter |
| 80–100 % | rot — gleich an die Wand |

Die Schwellen passen zum Rate-Limit-Widget der Landingpage. Hast du Gelb ein paar Mal gesehen, wird die Seitenleiste zum peripheren Pacing-Tool — du nimmst es nicht mehr bewusst wahr, aber du verteilst Arbeit über Fenster.

{% call callout('tip', 'Projektion schlägt Prozent') %}
Der schwache Balken hinter dem soliden ist eine Projektion — wenn du in deinem aktuellen Tempo weitermachst, landest du beim Reset hier. Die Projektion lange vor dem tatsächlichen Verbrauch über 80 % wandern zu sehen, ist die sauberste Frühwarnung.
{% endcall %}

## Das Statistik-Dashboard

Öffne das Dashboard aus der Seitenleiste (oder mit <kbd>⌘⇧U</kbd>). Fünf Sektionen, von oben nach unten:

### Übersichts-Karten

Vier Karten: **Sessions gesamt**, **Gesamtkosten**, **Heutige Kosten**, **Kosten dieses Monats**. Jede Karte zeigt die Veränderung gegenüber dem Vorzeitraum in Grün oder Rot.

### Token-Nutzung pro Modell

Ein gestapeltes Balkendiagramm pro Tag, aufgeschlüsselt nach Modell und Token-Typ — Input, Output, Cache-Reads, Cache-Writes. Die Modell-Legende nutzt Claudes Anzeigenamen (Opus / Sonnet / Haiku) und dieselbe Farb-Behandlung wie die Sidebar-Balken.

Das ist der einfachste Ort, um z. B. zu sehen, dass ein unerwarteter Kosten-Spike ein Opus-lastiger Tag war oder dass Cache-Reads die meiste Arbeit machen.

### Pro-Projekt-Aufschlüsselung

Eine Tabelle mit jedem Claude-Code-Projekt (Arbeitsverzeichnis), das du genutzt hast, mit Sessions, Nachrichten, Tokens und Kosten. Klick eine Zeile, um ein Pro-Tag-Diagramm nur für dieses Projekt zu sehen.

Nützlich für Shared-Maschinen oder zum Trennen von Kundenarbeit und privaten Hacks.

### Aktivität & Streaks

Ein 30-Tage-Daily-Activity-Area-Chart, plus vier Streak-Metriken:

- **Längster Streak** — dein Rekord an aufeinanderfolgenden Arbeitstagen
- **Aktueller Streak** — wie viele Tage du gerade in Folge gearbeitet hast
- **Gesamt aktive Tage** — Anzahl im Zeitraum
- **Durchschnittliche Sessions pro Tag**

### Wochen-Timeline

Ein Tag × Stunde-Raster, das zeigt, wann du Claude in der letzten Woche tatsächlich genutzt hast. Gleichzeitige Sessions stapeln sich visuell, sodass ein „fünf Sessions um 15 Uhr"-Dienstag leicht zu spotten ist.

## Woher die Daten kommen

Alles im Dashboard wird lokal aus Claude Codes eigenen Session-JSONLs unter `~/.claude/projects/` berechnet. purplemux liest sie, cached die geparsten Counts in `~/.purplemux/stats/` und sendet kein Byte aus der Maschine. Sprache wechseln oder den Cache neu generieren reicht nirgendwohin nach außen.

## Reset-Verhalten

Die 5h- und 7d-Fenster sind rollend und an deinen Claude-Code-Account gebunden. Wenn ein Fenster resettet, fällt der Balken auf 0 %, und Prozent und Restzeit rechnen sich aus dem nächsten Reset-Timestamp neu. Wenn purplemux den Reset verpasst (Server war aus), korrigiert sich das Widget beim nächsten Statusline-Tick selbst.

## Wie es weitergeht

- **[Notizen (AI-Tagesbericht)](/purplemux/de/docs/notes-daily-report/)** — dieselben Daten, als pro-Tag-Briefing geschrieben.
- **[Session-Status](/purplemux/de/docs/session-status/)** — was die Seitenleiste sonst noch pro Tab verfolgt.
- **[Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/)** — inklusive <kbd>⌘⇧U</kbd> für Statistiken.
