---
title: Session-Status
description: Wie purplemux Claude-Code-Aktivität in ein Vier-Zustands-Badge übersetzt — und warum es nahezu in Echtzeit aktualisiert.
eyebrow: Claude Code
permalink: /de/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

Jede Session in der Seitenleiste trägt einen farbigen Punkt, der auf einen Blick sagt, was Claude tut. Diese Seite erklärt, woher die vier Zustände kommen und wie sie synchron bleiben, ohne dass du ins Terminal greifen musst.

## Die vier Zustände

| Zustand | Indikator | Bedeutung |
|---|---|---|
| **Idle** | keiner / grau | Claude wartet auf deinen nächsten Prompt. |
| **Busy** | lila Spinner | Claude arbeitet — liest, editiert, führt Tools aus. |
| **Eingabe nötig** | gelber Puls | Ein Berechtigungs-Prompt oder eine Frage wartet auf dich. |
| **Review** | lila Puls | Claude ist fertig, und es gibt etwas zu prüfen. |

Ein fünfter Wert, **unknown**, erscheint kurz für Tabs, die `busy` waren, als der Server neu gestartet wurde. Er löst sich von selbst auf, sobald purplemux die Session erneut verifizieren kann.

## Hooks sind die Quelle der Wahrheit

purplemux installiert eine Claude-Code-Hook-Konfiguration unter `~/.purplemux/hooks.json` und ein winziges Shell-Skript unter `~/.purplemux/status-hook.sh`. Das Skript ist für fünf Claude-Code-Hook-Events registriert und POSTet jedes davon an den lokalen Server mit einem CLI-Token:

| Claude-Code-Hook | Resultierender Zustand |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | busy |
| `Notification` (nur Permission) | needs-input |
| `Stop` / `StopFailure` | review |
| `PreCompact` / `PostCompact` | zeigt den Compacting-Indikator (Zustand unverändert) |

Weil Hooks im Moment des Übergangs feuern, aktualisiert sich die Seitenleiste, bevor du es im Terminal überhaupt bemerken würdest.

{% call callout('note', 'Nur Permission-Notifications') %}
Claudes `Notification`-Hook feuert aus mehreren Gründen. purplemux schaltet nur dann auf **Eingabe nötig**, wenn die Notification `permission_prompt` oder `worker_permission_prompt` ist. Idle-Erinnerungen und andere Notification-Typen lösen das Badge nicht aus.
{% endcall %}

## Prozess-Erkennung läuft parallel

Ob die Claude-CLI tatsächlich läuft, wird getrennt vom Arbeitszustand verfolgt. Zwei Pfade kooperieren:

- **tmux-Title-Änderungen** — jedes Panel meldet `pane_current_command|pane_current_path` als Titel. xterm.js liefert die Änderung über `onTitleChange`, und purplemux pingt `/api/check-claude` zur Bestätigung.
- **Process-Tree-Walk** — server-seitig schaut `detectActiveSession` auf die Shell-PID des Panels, läuft seine Kinder ab und gleicht sie gegen die PID-Dateien ab, die Claude unter `~/.claude/sessions/` schreibt.

Existiert das Verzeichnis nicht, zeigt die UI einen „Claude nicht installiert"-Screen statt eines Status-Punkts.

## Der JSONL-Watcher schließt die Lücken

Claude Code schreibt eine Transkript-JSONL pro Session unter `~/.claude/projects/`. Solange ein Tab `busy`, `needs-input`, `unknown` oder `ready-for-review` ist, beobachtet purplemux diese Datei mit `fs.watch` aus zwei Gründen:

- **Metadaten** — aktuelles Tool, letzter Assistant-Snippet, Token-Counts. Diese fließen in Timeline und Seitenleiste, ohne den Zustand zu ändern.
- **Synthetischer Interrupt** — wenn du mitten im Stream Esc drückst, schreibt Claude `[Request interrupted by user]` in die JSONL, feuert aber keinen Hook. Der Watcher erkennt diese Zeile und synthetisiert ein `interrupt`-Event, sodass der Tab zu idle zurückkehrt, statt auf busy hängen zu bleiben.

## Polling ist ein Sicherheitsnetz, nicht der Motor

Ein Metadaten-Poll läuft alle 30–60 Sekunden, abhängig von der Tab-Anzahl. Er entscheidet **nicht** den Zustand — das ist strikt der Hook-Pfad. Der Poll existiert, um:

- Neue tmux-Panels zu entdecken
- Sessions wiederherzustellen, die mit totem Claude-Prozess länger als 10 Minuten busy sind
- Prozess-Info, Ports und Titel zu aktualisieren

Das ist das „5–15s-Fallback-Polling", das die Landing-Page erwähnt, abgebremst und eingeengt, sobald sich Hooks als zuverlässig erwiesen.

## Server-Restart überleben

Hooks können nicht feuern, während purplemux down ist, jeder in-flight-Zustand könnte also veraltet sein. Die Recovery-Regel ist konservativ:

- Persistierter `busy` wird zu `unknown` und wird re-checkt: läuft Claude nicht mehr, kippt der Tab still auf idle; trailt die JSONL sauber aus, wird er review.
- Jeder andere Zustand — `idle`, `needs-input`, `ready-for-review` — hat den Ball in deinem Spielfeld, wird also unangetastet persistiert.

Während der Recovery werden keine automatischen Zustandsänderungen gepusht. Du wirst nur gepingt, wenn *neue* Arbeit nach needs-input oder review übergeht.

## Wo der Zustand auftaucht

- Punkt in der Session-Zeile der Seitenleiste
- Tab-Leisten-Punkt in jedem Panel
- Workspace-Punkt (höchste Priorität über den Workspace)
- Bell-Icon-Counts und das Notification-Sheet
- Browser-Tab-Titel (zählt Aufmerksamkeitsitems)
- Web Push und Desktop-Benachrichtigungen für `needs-input` und `ready-for-review`

## Wie es weitergeht

- **[Berechtigungs-Prompts](/purplemux/de/docs/permission-prompts/)** — der Workflow hinter dem **Eingabe nötig**-Zustand.
- **[Live-Session-Ansicht](/purplemux/de/docs/live-session-view/)** — was die Timeline zeigt, sobald ein Tab `busy` ist.
- **[Erste Session](/purplemux/de/docs/first-session/)** — die Dashboard-Tour im Kontext.
