---
title: Statut de session
description: Comment purplemux transforme l'activité Claude Code en un badge à quatre états — et pourquoi il se met à jour quasi instantanément.
eyebrow: Claude Code
permalink: /fr/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

Chaque session de la barre latérale porte un point coloré qui vous indique, d'un coup d'œil, ce que fait Claude. Cette page explique d'où viennent ces quatre états et comment ils restent synchronisés sans que vous ayez à passer dans le terminal.

## Les quatre états

| État | Indicateur | Signification |
|---|---|---|
| **Inactif** | aucun / gris | Claude attend votre prochain prompt. |
| **Occupé** | spinner violet | Claude traite — lit, édite, exécute des outils. |
| **Saisie requise** | pulsation orange | Une invite de permission ou une question vous attend. |
| **À examiner** | pulsation violette | Claude a fini et il y a quelque chose à vérifier. |

Une cinquième valeur, **inconnu**, apparaît brièvement pour les onglets qui étaient `busy` au redémarrage du serveur. Elle se résout d'elle-même dès que purplemux peut revérifier la session.

## Les hooks sont la source de vérité

purplemux installe une configuration de hook Claude Code dans `~/.purplemux/hooks.json` et un petit script shell dans `~/.purplemux/status-hook.sh`. Le script est enregistré pour cinq événements de hook Claude Code et POST chacun au serveur local avec un token CLI :

| Hook Claude Code | État résultant |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | busy |
| `Notification` (permission uniquement) | needs-input |
| `Stop` / `StopFailure` | review |
| `PreCompact` / `PostCompact` | affiche l'indicateur de compaction (état inchangé) |

Comme les hooks se déclenchent au moment où Claude Code transitionne, la barre latérale se met à jour avant que vous ne le remarquiez dans le terminal.

{% call callout('note', 'Notifications de permission uniquement') %}
Le hook `Notification` de Claude se déclenche pour plusieurs raisons. purplemux ne bascule en **needs-input** que quand la notification est `permission_prompt` ou `worker_permission_prompt`. Les rappels d'inactivité et autres types de notification ne déclenchent pas le badge.
{% endcall %}

## La détection de processus tourne en parallèle

Savoir si la CLI Claude tourne réellement est suivi séparément de l'état de travail. Deux chemins coopèrent :

- **Changements de titre tmux** — chaque volet rapporte `pane_current_command|pane_current_path` comme titre. xterm.js livre le changement via `onTitleChange`, et purplemux ping `/api/check-claude` pour confirmer.
- **Parcours de l'arbre de processus** — côté serveur, `detectActiveSession` regarde le PID du shell du volet, parcourt ses enfants et compare avec les fichiers PID que Claude écrit sous `~/.claude/sessions/`.

Si le répertoire n'existe pas, l'interface affiche un écran « Claude pas installé » au lieu d'un point d'état.

## Le watcher JSONL comble les trous

Claude Code écrit un transcript JSONL pour chaque session sous `~/.claude/projects/`. Pendant qu'un onglet est `busy`, `needs-input`, `unknown` ou `ready-for-review`, purplemux surveille ce fichier avec `fs.watch` pour deux raisons :

- **Métadonnées** — outil courant, dernier extrait assistant, comptes de tokens. Tout cela alimente la timeline et la barre latérale sans changer l'état.
- **Interrupt synthétique** — quand vous pressez Esc en plein flux, Claude écrit `[Request interrupted by user]` dans le JSONL mais ne déclenche aucun hook. Le watcher détecte cette ligne et synthétise un événement `interrupt` pour que l'onglet revienne en idle au lieu de rester bloqué en busy.

## Le polling est un filet de sécurité, pas le moteur

Un polling de métadonnées tourne toutes les 30–60 secondes selon le nombre d'onglets. Il **ne décide pas** de l'état — c'est strictement le rôle du chemin hook. Le polling existe pour :

- Découvrir de nouveaux volets tmux
- Récupérer toute session restée busy plus de 10 minutes avec un processus Claude mort
- Rafraîchir info de processus, ports et titres

C'est le « polling de repli 5–15 s » mentionné sur la page d'accueil, ralenti et restreint une fois que les hooks se sont avérés fiables.

## Survivre à un redémarrage du serveur

Les hooks ne peuvent pas se déclencher pendant que purplemux est down, donc tout état en vol pourrait devenir périmé. La règle de récupération est conservatrice :

- Un `busy` persisté devient `unknown` et est revérifié : si Claude ne tourne plus, l'onglet bascule silencieusement en idle ; si le JSONL se termine proprement, il devient review.
- Tous les autres états — `idle`, `needs-input`, `ready-for-review` — vous laissent la balle, donc ils persistent intacts.

Aucun changement d'état automatique pendant la récupération ne déclenche de notifications push. Vous n'êtes pinguété que quand un *nouveau* travail bascule en needs-input ou review.

## Où l'état apparaît

- Point sur la ligne de session de la barre latérale
- Point dans la barre d'onglets de chaque volet
- Point d'espace de travail (état le plus prioritaire de l'espace)
- Compteurs sur l'icône cloche et feuille de notifications
- Titre de l'onglet du navigateur (compte les éléments demandant attention)
- Notifications Web Push et desktop pour `needs-input` et `ready-for-review`

## Pour aller plus loin

- **[Invites de permission](/purplemux/fr/docs/permission-prompts/)** — le workflow derrière l'état **needs-input**.
- **[Vue de session en direct](/purplemux/fr/docs/live-session-view/)** — ce que la timeline montre quand un onglet est `busy`.
- **[Première session](/purplemux/fr/docs/first-session/)** — la visite du tableau de bord, en contexte.
