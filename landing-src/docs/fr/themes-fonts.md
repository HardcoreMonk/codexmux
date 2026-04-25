---
title: Thèmes & polices
description: Clair, sombre ou système ; trois tailles de police ; un seul panneau de paramètres.
eyebrow: Personnalisation
permalink: /fr/docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux est livré avec un look unique cohérent et un petit jeu de bascules : thème de l'app, taille de police, et une palette de terminal séparée. Cette page couvre les deux premiers — les couleurs de terminal ont leur propre page.

## Ouvrir Paramètres

Pressez <kbd>⌘,</kbd> (macOS) ou <kbd>Ctrl,</kbd> (Linux) pour ouvrir Paramètres. L'onglet **Général** est là où vivent thème et taille de police.

Vous pouvez aussi cliquer l'icône engrenage dans la barre du haut.

## Thème de l'app

Trois modes, appliqués instantanément :

| Mode | Comportement |
|---|---|
| **Clair** | Force le thème clair indépendamment de la préférence OS. |
| **Sombre** | Force le thème sombre. |
| **Système** | Suit l'OS — bascule automatiquement quand macOS / GNOME / KDE change entre clair et sombre. |

Le thème est stocké dans `~/.purplemux/config.json` sous `appTheme` et synchronisé sur chaque onglet de navigateur connecté au serveur. Sur l'app native macOS, la barre de titre OS se met aussi à jour.

{% call callout('note', 'Conçu sombre d\'abord') %}
La marque est construite autour d'un neutre teinté violet profond, et le mode sombre garde le chroma à zéro pour une surface strictement achromatique. Le mode clair applique une teinte violette à peine perceptible (teinte 287) pour la chaleur. Les deux sont calibrés pour de longues sessions ; choisissez ce que vos yeux préfèrent.
{% endcall %}

## Taille de police

Trois préréglages, exposés en groupe de boutons :

- **Normale** — par défaut ; root font-size suit le navigateur.
- **Grande** — root font-size réglée à `18px`.
- **X-Large** — root font-size réglée à `20px`.

Comme l'interface entière est dimensionnée en `rem`, basculer de préréglage met à l'échelle toute l'interface — barre latérale, dialogues, terminal — d'un coup. Le changement s'applique en temps réel sans recharger.

## Ce qui change, ce qui ne change pas

La taille de police met à l'échelle le **chrome de l'UI et le texte du terminal**. Elle ne change pas :

- Hiérarchie des titres (les tailles relatives restent les mêmes)
- Espacement — les proportions sont préservées
- Style de coloration syntaxique des blocs de code

Si vous voulez ajuster des éléments individuels (par ex. seulement le terminal, ou seulement la barre latérale), voir [CSS personnalisé](/purplemux/fr/docs/custom-css/).

## Par appareil, pas par navigateur

Les paramètres sont stockés sur le serveur, pas dans localStorage. Passer en sombre sur votre laptop fera passer votre téléphone aussi — ouvrez `https://<host>/` depuis le téléphone et le changement est déjà là.

Si vous préférez garder mobile et desktop différents, ce n'est actuellement pas pris en charge ; ouvrez une issue si vous en avez besoin.

## Pour aller plus loin

- **[CSS personnalisé](/purplemux/fr/docs/custom-css/)** — surcharger des couleurs et espacements individuels.
- **[Thèmes terminal](/purplemux/fr/docs/terminal-themes/)** — palette séparée pour xterm.js.
- **[Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/)** — tous les raccourcis dans un seul tableau.
