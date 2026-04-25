---
title: Prompts rapides & pièces jointes
description: Une bibliothèque de prompts enregistrés, glisser-déposer d'images, pièces jointes et historique de messages réutilisable — tout depuis la barre de saisie en bas de la timeline.
eyebrow: Claude Code
permalink: /fr/docs/quick-prompts-attachments/index.html
---
{% from "docs/callouts.njk" import callout %}

La barre de saisie sous la timeline est plus qu'un textarea. C'est là que vivent les prompts enregistrés, les pièces jointes et l'historique de messages, pour que ce que vous tapez dix fois par jour cesse de vous coûter dix frappes par jour.

## Prompts rapides

Les prompts rapides sont de courtes entrées nommées stockées dans `~/.purplemux/quick-prompts.json`. Ils apparaissent comme des chips au-dessus de la barre de saisie — un clic envoie le prompt comme si vous l'aviez tapé.

Deux préréglages sont livrés et peuvent être désactivés à tout moment :

- **Commit** — exécute `/commit-commands:commit`
- **Simplify** — exécute `/simplify`

Ajoutez les vôtres depuis **Paramètres → Prompts rapides** :

1. Cliquez sur **Ajouter un prompt**.
2. Donnez-lui un nom (le label du chip) et un corps (ce qui est envoyé).
3. Glissez pour réordonner. Désactivez pour cacher sans supprimer.

Tout ce que vous tapez dans le corps est envoyé tel quel — y compris commandes slash, prompts multi-lignes, ou requêtes templatisées comme « Explique le fichier ouvert dans l'éditeur et propose une amélioration. »

{% call callout('tip', 'Les commandes slash comptent') %}
Les prompts rapides marchent très bien comme déclencheurs en un clic pour les commandes slash de Claude Code. Un chip « Review this PR » qui pointe vers `/review` économise quelques frappes à chaque fois.
{% endcall %}

## Glisser-déposer d'images

Déposez un fichier image (PNG, JPG, WebP, etc.) n'importe où sur la barre de saisie pour l'attacher. purplemux upload le fichier dans un chemin temporaire sur le serveur et insère automatiquement une référence dans votre prompt.

Vous pouvez aussi :

- **Coller** une image directement depuis le presse-papiers
- **Cliquer le trombone** pour ouvrir un dialogue de fichier
- Attacher **jusqu'à 20 fichiers** par message

Une bande de miniatures apparaît au-dessus de la saisie pendant que les pièces jointes sont en attente. Chaque miniature a une croix pour la retirer avant l'envoi.

## Autres pièces jointes

Le même trombone marche pour les fichiers non-image — markdown, JSON, CSV, fichiers source, n'importe quoi. purplemux les met dans un répertoire temporaire et insère le chemin pour que Claude puisse les `read` dans la requête.

C'est le moyen le plus simple de partager quelque chose que Claude ne peut pas atteindre seul, comme une stack trace collée depuis une autre machine ou un fichier de config d'un autre projet.

## Adapté au mobile

Les pièces jointes et le trombone sont en pleine taille sur téléphone. Déposez une copie d'écran depuis la feuille de partage iOS, ou utilisez le bouton appareil photo (Android) pour attacher une photo directement depuis la pellicule.

La barre de saisie se réagence pour les écrans étroits — les chips deviennent un défilement horizontal, le textarea grossit jusqu'à cinq lignes avant de scroller.

## Historique de messages

Chaque prompt que vous avez envoyé dans un espace est gardé dans un historique par espace. Pour en réutiliser un :

- Pressez <kbd>↑</kbd> dans une barre de saisie vide pour parcourir les messages récents
- Ou ouvrez le sélecteur **Historique** pour une liste cherchable

Les vieilles entrées peuvent être supprimées depuis le sélecteur. L'historique est stocké à côté des autres données d'espace dans `~/.purplemux/`, jamais envoyé hors de la machine.

## Clavier

| Touche | Action |
|---|---|
| <kbd>⌘I</kbd> | Focaliser la saisie depuis n'importe où dans la vue de session |
| <kbd>Enter</kbd> | Envoyer |
| <kbd>⇧Enter</kbd> | Insérer un saut de ligne |
| <kbd>Esc</kbd> | Pendant que Claude est busy, envoyer un interrupt |
| <kbd>↑</kbd> | Remonter dans l'historique de messages (quand vide) |

## Pour aller plus loin

- **[Vue de session en direct](/purplemux/fr/docs/live-session-view/)** — où vos prompts et les réponses de Claude apparaissent.
- **[Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/)** — le tableau complet.
- **[Invites de permission](/purplemux/fr/docs/permission-prompts/)** — ce qui se passe après l'envoi d'une requête nécessitant approbation.
