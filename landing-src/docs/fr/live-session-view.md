---
title: Vue de session en direct
description: Ce que le panneau timeline montre vraiment — messages, appels d'outils, tâches et invites disposés en événements plutôt qu'en scrollback CLI.
eyebrow: Claude Code
permalink: /fr/docs/live-session-view/index.html
---
{% from "docs/callouts.njk" import callout %}

Quand un onglet fait tourner Claude Code, purplemux remplace la vue terminal brute par une timeline structurée. Même session, même transcript JSONL — mais disposé en événements discrets que vous pouvez parcourir, scroller et lier.

## Pourquoi une timeline bat le scrollback

La CLI Claude est interactive. Voir ce qu'elle a fait il y a quinze minutes dans un terminal signifie scroller à travers tout ce qui s'est passé depuis, lire des lignes wrappées et deviner où finit un appel d'outil et où commence le suivant.

La timeline garde les mêmes données et ajoute de la structure :

- Une ligne par message, appel d'outil, tâche ou invite
- Entrées et sorties d'outils groupées ensemble
- Ancres permanentes — les événements ne glissent pas hors du haut quand le buffer se remplit
- L'étape courante reste épinglée en bas avec un compteur de temps écoulé

Vous pouvez toujours basculer dans le terminal à tout moment via le bouton de mode dans la barre du haut. La timeline est une vue *sur* la même session, pas une session séparée.

## Ce que vous verrez

Chaque ligne de la timeline correspond à une entrée du transcript JSONL Claude Code :

| Type | Ce qui est affiché |
|---|---|
| **Message utilisateur** | Votre prompt sous forme de bulle de chat. |
| **Message assistant** | La réponse de Claude, rendue en Markdown. |
| **Appel d'outil** | Nom de l'outil, arguments clés et la réponse — `read`, `edit`, `bash`, etc. |
| **Groupe d'outils** | Appels d'outils consécutifs réduits en une seule carte. |
| **Tâche / plan** | Plans multi-étapes avec progression à cases à cocher. |
| **Sous-agent** | Invocations d'agents groupées avec leur propre progression. |
| **Invite de permission** | L'invite interceptée avec les mêmes options que Claude propose. |
| **Compaction** | Indicateur subtil quand Claude auto-compacte le contexte. |

Les longs messages assistant se replient en extrait avec affordance d'expansion ; les longues sorties d'outils sont tronquées avec un toggle « voir plus ».

## Comment ça reste live

La timeline est alimentée par un WebSocket sur `/api/timeline`. Le serveur lance un `fs.watch` sur le fichier JSONL actif, parse les entrées ajoutées et les pousse au navigateur en temps réel. Pas de polling, pas de re-fetch complet — la charge initiale envoie les entrées existantes, et tout le reste est incrémental.

Pendant que Claude est `busy`, vous voyez aussi :

- Un spinner avec le temps écoulé en direct pour l'étape courante
- L'appel d'outil courant (par ex. « Lecture de src/lib/auth.ts »)
- Un court extrait du texte assistant le plus récent

Tout ça vient de la passe métadonnées du watcher JSONL et se met à jour sans changer l'état de session.

## Scroll, ancres et historique

La timeline auto-scrolle quand vous êtes déjà en bas et reste en place quand vous scrollez vers le haut pour lire. Un bouton flottant **Aller en bas** apparaît quand vous êtes à plus d'un écran au-dessus de la dernière entrée.

Pour les longues sessions, les anciennes entrées se chargent à la demande quand vous scrollez vers le haut. L'ID de session Claude est préservé à travers les reprises, donc reprendre une session d'hier vous remet là où vous l'avez laissée.

{% call callout('tip', 'Sauter à la saisie') %}
Pressez <kbd>⌘I</kbd> depuis n'importe où dans la timeline pour focaliser la barre de saisie en bas. <kbd>Esc</kbd> envoie un interrupt au processus Claude en cours.
{% endcall %}

## Invites de permission en ligne

Quand Claude veut exécuter un outil ou modifier un fichier, l'invite apparaît en ligne dans la timeline plutôt qu'en modale. Vous pouvez cliquer sur l'option, presser la touche numérique correspondante, ou l'ignorer et répondre depuis votre téléphone via Web Push. Voir [Invites de permission](/purplemux/fr/docs/permission-prompts/) pour le flux complet.

## Modes sur un seul onglet

La barre du haut permet de changer ce que le panneau de droite affiche pour la même session :

- **Claude** — la timeline (par défaut)
- **Terminal** — la vue xterm.js brute
- **Diff** — les changements Git pour le répertoire de travail

Changer de mode ne redémarre rien. La session continue de tourner sur tmux derrière les trois vues.

Raccourcis : <kbd>⌘⇧C</kbd> · <kbd>⌘⇧T</kbd> · <kbd>⌘⇧F</kbd>.

## Pour aller plus loin

- **[Invites de permission](/purplemux/fr/docs/permission-prompts/)** — le flux d'approbation en ligne.
- **[Statut de session](/purplemux/fr/docs/session-status/)** — les badges qui pilotent les indicateurs de la timeline.
- **[Prompts rapides & pièces jointes](/purplemux/fr/docs/quick-prompts-attachments/)** — ce que la barre de saisie en bas peut faire.
