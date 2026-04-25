---
title: Terminal-Themes
description: Eine separate Farb-Palette für das xterm.js-Terminal — wähl ein Theme für hell, eines für dunkel.
eyebrow: Anpassung
permalink: /de/docs/terminal-themes/index.html
---
{% from "docs/callouts.njk" import callout %}

Das Terminal-Panel nutzt xterm.js mit eigener Farb-Palette, unabhängig vom Rest der UI. Du wählst ein Dark-Theme und ein Light-Theme; purplemux schaltet zwischen ihnen um, wenn das App-Theme wechselt.

## Den Picker öffnen

Einstellungen (<kbd>⌘,</kbd>) → Tab **Terminal**. Du siehst zwei Sub-Tabs mit dem Label Dunkel und Hell, jeder mit einem Raster aus Theme-Karten. Klick eine — sie wird live auf jedes offene Terminal angewendet.

## Warum eine separate Palette

Terminal-Apps hängen an der 16-Farb-ANSI-Palette (Rot, Grün, Gelb, Blau, Magenta, Cyan, plus die Bright-Varianten). Die UI-Palette ist gedämpft by Design und würde Terminal-Output unlesbar machen. Eine zweckgebaute Palette lässt `vim`, `git diff`, Syntax-Highlighting und TUI-Tools korrekt rendern.

Jedes Theme definiert:

- Hintergrund, Vordergrund, Cursor, Auswahl
- Acht ANSI-Basisfarben (schwarz, rot, grün, gelb, blau, magenta, cyan, weiß)
- Acht Bright-Varianten

## Mitgelieferte Themes

**Dunkel**

- Snazzy *(Default)*
- Dracula
- One Dark
- Tokyo Night
- Nord
- Catppuccin Mocha

**Hell**

- Catppuccin Latte *(Default)*
- GitHub Light
- One Light
- Solarized Light
- Tokyo Night Light
- Nord Light

Die Vorschau-Karte zeigt die sieben Kern-ANSI-Farben gegen den Hintergrund des Themes, sodass du Kontrast einschätzen kannst, bevor du dich festlegst.

## Wie das Hell/Dunkel-Switching funktioniert

Du wählst **ein Dark-Theme** und **ein Light-Theme** unabhängig. Das aktive Theme bestimmt sich aus dem aufgelösten App-Theme:

- App-Theme **Dunkel** → dein gewähltes Dark-Theme.
- App-Theme **Hell** → dein gewähltes Light-Theme.
- App-Theme **System** → folgt dem OS, schaltet automatisch.

Mit App-Theme System und beiden Seiten konfiguriert hast du also ein Terminal, das deinem OS-Tag/Nacht ohne weitere Verdrahtung folgt.

{% call callout('tip', 'Zur App passen, oder kontrastieren') %}
Manche mögen es, wenn das Terminal zum Rest der UI passt. Andere bevorzugen ein hochkontrastiges Dracula oder Tokyo Night auch in einer hellen App. Beides geht; der Picker erzwingt nichts.
{% endcall %}

## Pro Theme, nicht pro Tab

Die Wahl ist global. Jedes Terminal-Panel und jede Claude-Session nutzt dasselbe aktive Theme. Es gibt kein Pro-Tab-Override; falls du das brauchst, eröffne ein Issue.

## Eigene hinzufügen

Custom-Theme-Einträge sind derzeit nicht Teil der UI. Die mitgelieferte Liste lebt in `src/lib/terminal-themes.ts`. Wenn du aus dem Source baust, kannst du eigene anhängen; ansonsten ist der unterstützte Pfad ein PR mit dem neuen Theme.

## Wie es weitergeht

- **[Themes & Schriften](/purplemux/de/docs/themes-fonts/)** — App-Theme und Schriftgröße.
- **[Custom CSS](/purplemux/de/docs/custom-css/)** — den Rest der UI überschreiben.
- **[Editor-Integration](/purplemux/de/docs/editor-integration/)** — Dateien in einem externen Editor öffnen.
