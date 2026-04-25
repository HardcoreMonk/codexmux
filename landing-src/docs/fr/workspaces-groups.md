---
title: Espaces de travail & groupes
description: Organisez les onglets liés en espaces de travail, puis regroupez les espaces en groupes glisser-déposer dans la barre latérale.
eyebrow: Espaces de travail & terminal
permalink: /fr/docs/workspaces-groups/index.html
---
{% from "docs/callouts.njk" import callout %}

Un espace de travail est un dossier d'onglets liés — terminal, panneau de diff et session Claude d'un même projet vivent ensemble. Une fois que vous en avez plusieurs, les groupes dans la barre latérale gardent l'ensemble bien rangé.

## Ce qu'un espace contient

Chaque espace de travail a son propre :

- **Répertoire par défaut** — où démarrent les shells des nouveaux onglets.
- **Onglets et volets** — terminaux, sessions Claude, panneaux de diff, panneaux de navigateur web.
- **Mise en page** — ratios de division, focus, onglet actif dans chaque volet.

Tout est persisté dans `~/.purplemux/workspaces.json`, donc l'espace de travail est l'unité que purplemux sauvegarde et restaure. Fermer le navigateur ne dissout pas un espace ; tmux maintient les shells ouverts et la mise en page reste en place.

## Créer un espace

Le premier lancement vous donne un espace par défaut. Pour en ajouter un autre :

1. Cliquez sur **+ Nouvel espace** en haut de la barre latérale, ou pressez <kbd>⌘N</kbd>.
2. Nommez-le et choisissez un répertoire par défaut — typiquement la racine du dépôt pour ce projet.
3. Entrée. L'espace vide s'ouvre.

{% call callout('tip', 'Choisissez le bon répertoire de départ') %}
Le répertoire par défaut est le cwd de chaque nouveau shell dans cet espace. Si vous le pointez sur la racine du projet, chaque nouvel onglet est à une frappe de `pnpm dev`, `git status`, ou de démarrer une session Claude au bon endroit.
{% endcall %}

## Renommer et supprimer

Dans la barre latérale, faites un clic droit sur un espace (ou utilisez le menu kebab) pour **Renommer** et **Supprimer**. Renommer est aussi associé à <kbd>⌘⇧R</kbd> pour l'espace actif.

Supprimer un espace ferme ses sessions tmux et le retire de `workspaces.json`. Pas d'annulation. Les onglets déjà crashés ou fermés restent partis ; les onglets actifs sont tués proprement.

## Changer d'espace

Cliquez sur n'importe quel espace dans la barre latérale, ou utilisez la rangée des chiffres :

| Action | macOS | Linux / Windows |
|---|---|---|
| Aller à l'espace 1–9 | <kbd>⌘1</kbd> – <kbd>⌘9</kbd> | <kbd>Ctrl+1</kbd> – <kbd>Ctrl+9</kbd> |
| Basculer la barre latérale | <kbd>⌘B</kbd> | <kbd>Ctrl+B</kbd> |
| Mode barre latérale (Espace ↔ Sessions) | <kbd>⌘⇧B</kbd> | <kbd>Ctrl+Shift+B</kbd> |

L'ordre dans la barre latérale est l'ordre auquel les touches numériques correspondent. Glissez un espace vers le haut ou le bas pour changer son emplacement.

## Grouper des espaces

Quand vous avez une poignée d'espaces, déposez-les dans des groupes par glisser-déposer dans la barre latérale. Un groupe est un en-tête repliable — utile pour séparer « travail client », « projets perso » et « ops » sans tout aplatir.

- **Créer un groupe** — glissez un espace sur un autre et la barre latérale propose de les grouper.
- **Renommer** — clic droit sur l'en-tête du groupe.
- **Réordonner** — glissez les groupes vers le haut/bas, glissez les espaces dedans/dehors.
- **Replier** — cliquez sur le chevron de l'en-tête du groupe.

Les groupes sont une organisation visuelle. Ils ne changent ni la persistance des onglets ni le comportement des raccourcis ; <kbd>⌘1</kbd> – <kbd>⌘9</kbd> parcourt toujours l'ordre plat de haut en bas.

## Où c'est stocké sur le disque

Chaque modification est écrite dans `~/.purplemux/workspaces.json`. Vous pouvez l'inspecter ou le sauvegarder — voir [Répertoire de données](/purplemux/fr/docs/data-directory/) pour la structure complète. Si vous l'effacez pendant que le serveur tourne, purplemux retombe sur un espace vide et repart de zéro.

## Pour aller plus loin

- **[Onglets & volets](/purplemux/fr/docs/tabs-panes/)** — diviser, réordonner, focaliser à l'intérieur d'un espace.
- **[Sauvegarder & restaurer les mises en page](/purplemux/fr/docs/save-restore/)** — comment les espaces survivent à la fermeture du navigateur et au redémarrage du serveur.
- **[Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/)** — le tableau complet.
