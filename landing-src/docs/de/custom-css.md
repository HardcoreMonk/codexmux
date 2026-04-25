---
title: Custom CSS
description: CSS-Variablen überschreiben, um Farben, Spacing und einzelne Oberflächen neu abzustimmen.
eyebrow: Anpassung
permalink: /de/docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux ist auf einem CSS-Variablen-System gebaut. Du kannst fast alles Visuelle ändern, ohne die Quelle anzufassen — Regeln in den Tab **Erscheinungsbild** einfügen, Anwenden klicken, und sie greifen sofort auf jedem verbundenen Client.

## Wo es hin soll

Öffne Einstellungen (<kbd>⌘,</kbd>) und wähle **Erscheinungsbild**. Du siehst ein einziges Textfeld mit dem Label Custom CSS.

1. Schreib deine Regeln.
2. Klick **Anwenden**. Das CSS wird in einen `<style>`-Tag auf jeder Seite injiziert.
3. Klick **Zurücksetzen**, um alle Overrides zu leeren.

Das CSS wird auf dem Server in `~/.purplemux/config.json` (`customCSS`) gespeichert, es wirkt also auf jedem verbundenen Gerät.

{% call callout('note', 'Server-weit, nicht pro Gerät') %}
Custom CSS lebt in der Server-Config und folgt dir auf jeden Browser. Wenn du willst, dass ein Gerät anders aussieht als ein anderes — das wird derzeit nicht unterstützt.
{% endcall %}

## Wie es funktioniert

Die meisten Farben, Oberflächen und Akzente in purplemux sind als CSS-Variablen unter `:root` (hell) und `.dark` exponiert. Eine Variable zu überschreiben kaskadiert die Änderung überall, wo diese Variable verwendet wird — Seitenleiste, Dialoge, Charts, Status-Badges.

Eine einzelne Variable zu ändern ist fast immer besser, als Komponenten-Selektoren direkt zu überschreiben. Komponenten-Klassen sind keine stabile API; Variablen schon.

## Ein minimales Beispiel

Die Seitenleiste im Light Mode etwas wärmer tönen und die Dark-Surface dunkler drücken:

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

Oder die Marke umfärben, ohne sonst etwas anzufassen:

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## Variablen-Gruppen

Das Erscheinungsbild-Panel exponiert die volle Liste unter **Verfügbare Variablen**. Die Hauptbereiche:

- **Surface** — `--background`, `--card`, `--popover`, `--muted`, `--secondary`, `--accent`, `--sidebar`
- **Text** — `--foreground` und die passenden `*-foreground`-Varianten
- **Interaktiv** — `--primary`, `--primary-foreground`, `--destructive`
- **Border** — `--border`, `--input`, `--ring`
- **Palette** — `--ui-blue`, `--ui-teal`, `--ui-coral`, `--ui-amber`, `--ui-purple`, `--ui-pink`, `--ui-green`, `--ui-gray`, `--ui-red`
- **Semantisch** — `--positive`, `--negative`, `--accent-color`, `--brand`, `--focus-indicator`, `--claude-active`

Für die vollständige Token-Liste mit Default-OKLCH-Werten und der Design-Begründung siehe [`docs/STYLE.md`](https://github.com/subicura/purplemux/blob/main/docs/STYLE.md) im Repo. Dieses Dokument ist die Source of Truth.

## Nur einen Modus targeten

Wickle Regeln in `:root` für hell und `.dark` für dunkel. Die Klasse wird durch `next-themes` an `<html>` gesetzt.

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

Wenn du nur einen Modus ändern musst, lass den anderen unangetastet.

## Was ist mit dem Terminal?

Das xterm.js-Terminal nutzt seine eigene Palette, gewählt aus einer kuratierten Liste — sie wird nicht von diesen CSS-Variablen gesteuert. Wechsel sie im Tab **Terminal**. Siehe [Terminal-Themes](/purplemux/de/docs/terminal-themes/).

## Wie es weitergeht

- **[Themes & Schriften](/purplemux/de/docs/themes-fonts/)** — hell, dunkel, System; Schriftgrößen-Presets.
- **[Terminal-Themes](/purplemux/de/docs/terminal-themes/)** — separate Palette für den Terminal-Bereich.
- **[Seitenleiste & Claude-Optionen](/purplemux/de/docs/sidebar-options/)** — Items umsortieren, Claude-Flags umschalten.
