---
title: Thèmes terminal
description: Une palette de couleurs séparée pour le terminal xterm.js — choisissez-en une pour le clair, une pour le sombre.
eyebrow: Personnalisation
permalink: /fr/docs/terminal-themes/index.html
---
{% from "docs/callouts.njk" import callout %}

Le volet terminal utilise xterm.js avec sa propre palette de couleurs, indépendante du reste de l'UI. Vous choisissez un thème sombre et un thème clair ; purplemux bascule entre eux quand le thème de l'app bascule.

## Ouvrir le sélecteur

Paramètres (<kbd>⌘,</kbd>) → onglet **Terminal**. Vous verrez deux sous-onglets nommés Sombre et Clair, chacun avec une grille de cartes de thème. Cliquez sur l'une — elle s'applique en direct à chaque terminal ouvert.

## Pourquoi une palette séparée

Les apps de terminal dépendent de la palette ANSI 16 couleurs (rouge, vert, jaune, bleu, magenta, cyan, plus leurs variantes vives). La palette UI est sourde par design et rendrait la sortie terminal illisible. Une palette dédiée permet à `vim`, `git diff`, à la coloration syntaxique et aux outils TUI de s'afficher correctement.

Chaque thème définit :

- Fond, premier plan, curseur, sélection
- Huit couleurs ANSI de base (noir, rouge, vert, jaune, bleu, magenta, cyan, blanc)
- Huit variantes vives

## Thèmes livrés

**Sombre**

- Snazzy *(par défaut)*
- Dracula
- One Dark
- Tokyo Night
- Nord
- Catppuccin Mocha

**Clair**

- Catppuccin Latte *(par défaut)*
- GitHub Light
- One Light
- Solarized Light
- Tokyo Night Light
- Nord Light

L'aperçu de carte montre les sept couleurs ANSI principales sur le fond du thème, pour que vous jugiez le contraste à l'œil avant de valider.

## Comment fonctionne la bascule clair/sombre

Vous choisissez **un thème sombre** et **un thème clair** indépendamment. Le thème actif est décidé par le thème app résolu :

- Thème app **Sombre** → votre thème sombre choisi.
- Thème app **Clair** → votre thème clair choisi.
- Thème app **Système** → suit l'OS, échange automatiquement.

Donc choisir Système pour le thème app et configurer les deux côtés vous donne un terminal qui suit le jour/nuit de l'OS sans câblage supplémentaire.

{% call callout('tip', 'Assortir l\'app, ou la contraster') %}
Certaines personnes aiment que le terminal s'assortisse au reste de l'UI. D'autres préfèrent un terminal Dracula ou Tokyo Night à fort contraste même dans une app claire. Les deux marchent ; le sélecteur n'impose rien.
{% endcall %}

## Par thème, pas par onglet

Le choix est global. Chaque volet terminal et chaque session Claude utilise le même thème actif. Pas de surcharge par onglet ; si vous en avez besoin, ouvrez une issue.

## Ajouter le vôtre

Les entrées de thème personnalisées ne font pas actuellement partie de l'UI. La liste livrée vit dans `src/lib/terminal-themes.ts`. Si vous buildez depuis les sources vous pouvez ajouter les vôtres ; sinon, le chemin pris en charge est d'ouvrir une PR avec le nouveau thème.

## Pour aller plus loin

- **[Thèmes & polices](/purplemux/fr/docs/themes-fonts/)** — thème app et taille de police.
- **[CSS personnalisé](/purplemux/fr/docs/custom-css/)** — surcharger le reste de l'UI.
- **[Intégration éditeur](/purplemux/fr/docs/editor-integration/)** — ouvrir des fichiers dans un éditeur externe.
