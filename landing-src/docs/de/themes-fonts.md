---
title: Themes & Schriften
description: Hell, dunkel oder System; drei Schriftgrößen; ein Einstellungs-Panel.
eyebrow: Anpassung
permalink: /de/docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux liefert ein einziges, kohärentes Erscheinungsbild und ein kleines Set an Schaltern: App-Theme, Schriftgröße und eine separate Terminal-Palette. Diese Seite deckt die ersten beiden ab — Terminal-Farben haben ihre eigene Seite.

## Einstellungen öffnen

Drück <kbd>⌘,</kbd> (macOS) oder <kbd>Ctrl,</kbd> (Linux), um die Einstellungen zu öffnen. Im Tab **Allgemein** liegen Theme und Schriftgröße.

Du kannst auch das Zahnrad-Icon in der oberen Leiste klicken.

## App-Theme

Drei Modi, sofort angewandt:

| Modus | Verhalten |
|---|---|
| **Hell** | Erzwingt das helle Theme unabhängig von der OS-Präferenz. |
| **Dunkel** | Erzwingt das dunkle Theme. |
| **System** | Folgt dem OS — schaltet automatisch um, wenn macOS / GNOME / KDE zwischen hell und dunkel wechseln. |

Das Theme wird in `~/.purplemux/config.json` unter `appTheme` gespeichert und auf jeden mit dem Server verbundenen Browser-Tab synchronisiert. In der nativen macOS-App aktualisiert sich auch die OS-Titelleiste.

{% call callout('note', 'Dark-First entworfen') %}
Die Marke ist um einen tief lila-getönten Neutralton gebaut, und Dark Mode hält das Chroma bei null für eine strikt achromatische Oberfläche. Light Mode wendet einen kaum wahrnehmbaren Lila-Touch (Hue 287) für Wärme an. Beide sind für lange Sessions abgestimmt; nimm das, was deinen Augen besser tut.
{% endcall %}

## Schriftgröße

Drei Presets, als Button-Gruppe:

- **Normal** — der Default; root-font-size folgt dem Browser.
- **Groß** — root-font-size auf `18px`.
- **X-Groß** — root-font-size auf `20px`.

Weil die gesamte UI in `rem` skaliert ist, skaliert ein Preset-Wechsel das ganze Interface — Seitenleiste, Dialoge, Terminal — auf einmal. Die Änderung wird in Echtzeit angewendet, ohne Reload.

## Was sich ändert, was nicht

Schriftgröße skaliert das **UI-Chrome und den Terminal-Text**. Sie ändert nicht:

- Heading-Hierarchie (relative Größen bleiben gleich)
- Spacing — Proportionen bleiben erhalten
- Code-Block-Syntax-Styling

Wenn du einzelne Elemente tunen willst (z. B. nur das Terminal oder nur die Seitenleiste), siehe [Custom CSS](/purplemux/de/docs/custom-css/).

## Pro Gerät, nicht pro Browser

Einstellungen werden auf dem Server gespeichert, nicht in localStorage. Auf dem Laptop auf Dunkel zu wechseln, schaltet auch dein Handy um — öffne `https://<host>/` vom Handy, und die Änderung ist schon da.

Wenn du Mobile und Desktop unterschiedlich halten willst — das wird derzeit nicht unterstützt; eröffne ein Issue, falls du das brauchst.

## Wie es weitergeht

- **[Custom CSS](/purplemux/de/docs/custom-css/)** — einzelne Farben und Spacing überschreiben.
- **[Terminal-Themes](/purplemux/de/docs/terminal-themes/)** — separate Palette für xterm.js.
- **[Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/)** — alle Bindings auf einen Blick.
