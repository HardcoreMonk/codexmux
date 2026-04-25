---
title: Tabs & Panels
description: Wie Tabs in einem Workspace funktionieren, wie du Panels splittest und welche Shortcuts den Fokus zwischen ihnen bewegen.
eyebrow: Workspaces & Terminal
permalink: /de/docs/tabs-panes/index.html
---
{% from "docs/callouts.njk" import callout %}

Ein Workspace ist in **Panels** unterteilt, und jedes Panel hält einen Stapel **Tabs**. Splits geben dir parallele Sichten; Tabs lassen ein Panel mehrere Shells beherbergen, ohne Bildschirmplatz zu opfern.

## Tabs

Jeder Tab ist eine echte Shell, an eine tmux-Session angebunden. Der Tab-Titel kommt vom Vordergrundprozess — tippe `vim` und der Tab benennt sich um; beende ihn und er kehrt zum Verzeichnisnamen zurück.

| Aktion | macOS | Linux / Windows |
|---|---|---|
| Neuer Tab | <kbd>⌘T</kbd> | <kbd>Ctrl+T</kbd> |
| Tab schließen | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| Voriger Tab | <kbd>⌘⇧[</kbd> | <kbd>Ctrl+Shift+[</kbd> |
| Nächster Tab | <kbd>⌘⇧]</kbd> | <kbd>Ctrl+Shift+]</kbd> |
| Zu Tab 1–9 | <kbd>⌃1</kbd> – <kbd>⌃9</kbd> | <kbd>Alt+1</kbd> – <kbd>Alt+9</kbd> |

Zieh einen Tab in der Tab-Leiste, um ihn umzusortieren. Der **+**-Button am Ende der Tab-Leiste öffnet denselben Template-Picker wie <kbd>⌘T</kbd>.

{% call callout('tip', 'Templates jenseits von Terminal') %}
Im Neuer-Tab-Menü kannst du **Terminal**, **Claude**, **Diff** oder **Web Browser** als Panel-Typ wählen. Alles sind Tabs — du kannst sie im selben Panel mischen und mit den Shortcuts oben zwischen ihnen wechseln.
{% endcall %}

## Panels splitten

Tabs teilen sich Bildschirmplatz. Um zwei Dinge gleichzeitig zu sehen, splitte das Panel.

| Aktion | macOS | Linux / Windows |
|---|---|---|
| Nach rechts splitten | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> |
| Nach unten splitten | <kbd>⌘⇧D</kbd> | <kbd>Ctrl+Shift+D</kbd> |

Ein neuer Split erbt das Standard-Verzeichnis des Workspaces und startet mit einem leeren Terminal-Tab. Jedes Panel hat eine eigene Tab-Leiste, sodass das rechte Panel den Diff-Viewer beherbergen kann, während links `claude` läuft.

## Fokus zwischen Panels bewegen

Nutze die Richtungs-Shortcuts — sie laufen den Split-Tree ab, sodass <kbd>⌘⌥→</kbd> selbst aus einem tief verschachtelten Panel beim visuell benachbarten landet.

| Aktion | macOS | Linux / Windows |
|---|---|---|
| Fokus links | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| Fokus rechts | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| Fokus oben | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| Fokus unten | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |

## Größe ändern und ausgleichen

Zieh den Trenner zwischen Panels für Feinkontrolle, oder nutze die Tastatur.

| Aktion | macOS | Linux / Windows |
|---|---|---|
| Nach links | <kbd>⌘⌃⇧←</kbd> | <kbd>Ctrl+Alt+Shift+←</kbd> |
| Nach rechts | <kbd>⌘⌃⇧→</kbd> | <kbd>Ctrl+Alt+Shift+→</kbd> |
| Nach oben | <kbd>⌘⌃⇧↑</kbd> | <kbd>Ctrl+Alt+Shift+↑</kbd> |
| Nach unten | <kbd>⌘⌃⇧↓</kbd> | <kbd>Ctrl+Alt+Shift+↓</kbd> |
| Splits ausgleichen | <kbd>⌘⌥=</kbd> | <kbd>Ctrl+Alt+=</kbd> |

Ausgleichen ist der schnellste Weg, ein Layout zurückzusetzen, das in unbrauchbare Extreme gerutscht ist.

## Bildschirm leeren

<kbd>⌘K</kbd> leert das Terminal des aktuellen Panels — wie in den meisten nativen Terminals. Der Shell-Prozess läuft weiter; nur der sichtbare Buffer wird gelöscht.

| Aktion | macOS | Linux / Windows |
|---|---|---|
| Bildschirm leeren | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> |

## Tabs überleben alles

Einen Tab zu schließen tötet seine tmux-Session. Den *Browser* zu schließen, neu zu laden oder das Netzwerk zu verlieren tut das nicht — jeder Tab läuft auf dem Server weiter. Wieder öffnen, und dieselben Panels, Splits und Tabs sind zurück.

Zur Recovery-Story bei Server-Reboots siehe [Layouts speichern & wiederherstellen](/purplemux/de/docs/save-restore/).

## Wie es weitergeht

- **[Layouts speichern & wiederherstellen](/purplemux/de/docs/save-restore/)** — wie das Layout bestehen bleibt.
- **[Tastenkürzel](/purplemux/de/docs/keyboard-shortcuts/)** — alle Bindings auf einen Blick.
- **[Git-Workflow-Panel](/purplemux/de/docs/git-workflow/)** — ein nützlicher Tab-Typ für einen Split.
