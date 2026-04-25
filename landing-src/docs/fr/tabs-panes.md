---
title: Onglets & volets
description: Comment fonctionnent les onglets dans un espace de travail, comment diviser les volets et les raccourcis qui déplacent le focus entre eux.
eyebrow: Espaces de travail & terminal
permalink: /fr/docs/tabs-panes/index.html
---
{% from "docs/callouts.njk" import callout %}

Un espace de travail est divisé en **volets**, et chaque volet contient une pile d'**onglets**. Les divisions vous donnent des vues parallèles ; les onglets permettent à un volet d'héberger plusieurs shells sans voler d'espace écran.

## Onglets

Chaque onglet est un vrai shell rattaché à une session tmux. Le titre de l'onglet vient du processus au premier plan — tapez `vim` et l'onglet se renomme tout seul ; quittez et il redevient le nom du répertoire.

| Action | macOS | Linux / Windows |
|---|---|---|
| Nouvel onglet | <kbd>⌘T</kbd> | <kbd>Ctrl+T</kbd> |
| Fermer l'onglet | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| Onglet précédent | <kbd>⌘⇧[</kbd> | <kbd>Ctrl+Shift+[</kbd> |
| Onglet suivant | <kbd>⌘⇧]</kbd> | <kbd>Ctrl+Shift+]</kbd> |
| Aller à l'onglet 1–9 | <kbd>⌃1</kbd> – <kbd>⌃9</kbd> | <kbd>Alt+1</kbd> – <kbd>Alt+9</kbd> |

Glissez un onglet dans la barre d'onglets pour le réordonner. Le bouton **+** en bout de barre ouvre le même sélecteur de modèle que <kbd>⌘T</kbd>.

{% call callout('tip', 'Au-delà du Terminal') %}
Le menu nouveau-onglet permet de choisir **Terminal**, **Claude**, **Diff** ou **Navigateur web** comme type de panneau. Ce sont tous des onglets — vous pouvez les mélanger dans le même volet et basculer entre eux avec les raccourcis ci-dessus.
{% endcall %}

## Diviser des volets

Les onglets partagent l'espace écran. Pour voir deux choses en même temps, divisez le volet.

| Action | macOS | Linux / Windows |
|---|---|---|
| Diviser à droite | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> |
| Diviser vers le bas | <kbd>⌘⇧D</kbd> | <kbd>Ctrl+Shift+D</kbd> |

Une nouvelle division hérite du répertoire par défaut de l'espace et démarre avec un onglet de terminal vide. Chaque volet a sa propre barre d'onglets, donc le volet de droite peut héberger la visionneuse de diff pendant que celui de gauche fait tourner `claude`.

## Déplacer le focus entre volets

Utilisez les raccourcis directionnels — ils parcourent l'arbre des divisions, donc <kbd>⌘⌥→</kbd> depuis un volet profondément imbriqué atterrit quand même sur le voisin visuel.

| Action | macOS | Linux / Windows |
|---|---|---|
| Focus à gauche | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| Focus à droite | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| Focus en haut | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| Focus en bas | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |

## Redimensionner et égaliser

Glissez la séparation entre volets pour un contrôle fin, ou utilisez le clavier.

| Action | macOS | Linux / Windows |
|---|---|---|
| Redimensionner à gauche | <kbd>⌘⌃⇧←</kbd> | <kbd>Ctrl+Alt+Shift+←</kbd> |
| Redimensionner à droite | <kbd>⌘⌃⇧→</kbd> | <kbd>Ctrl+Alt+Shift+→</kbd> |
| Redimensionner vers le haut | <kbd>⌘⌃⇧↑</kbd> | <kbd>Ctrl+Alt+Shift+↑</kbd> |
| Redimensionner vers le bas | <kbd>⌘⌃⇧↓</kbd> | <kbd>Ctrl+Alt+Shift+↓</kbd> |
| Égaliser les divisions | <kbd>⌘⌥=</kbd> | <kbd>Ctrl+Alt+=</kbd> |

L'égalisation est le moyen le plus rapide de remettre d'aplomb une mise en page qui a dérivé.

## Effacer l'écran

<kbd>⌘K</kbd> efface le terminal du volet courant, comme la plupart des terminaux natifs. Le processus shell continue de tourner ; seul le buffer visible est effacé.

| Action | macOS | Linux / Windows |
|---|---|---|
| Effacer l'écran | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> |

## Les onglets survivent à tout

Fermer un onglet tue sa session tmux. Fermer le *navigateur*, rafraîchir ou perdre le réseau, non — chaque onglet continue de tourner sur le serveur. Rouvrez et les mêmes volets, divisions et onglets reviennent.

Pour la récupération à travers les redémarrages serveur, voir [Sauvegarder & restaurer les mises en page](/purplemux/fr/docs/save-restore/).

## Pour aller plus loin

- **[Sauvegarder & restaurer les mises en page](/purplemux/fr/docs/save-restore/)** — comment cette mise en page persiste.
- **[Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/)** — tous les raccourcis dans un seul tableau.
- **[Panneau de workflow Git](/purplemux/fr/docs/git-workflow/)** — un type d'onglet utile à mettre dans une division.
