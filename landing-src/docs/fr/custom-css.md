---
title: CSS personnalisé
description: Surchargez les variables CSS pour réajuster couleurs, espacements et surfaces individuelles.
eyebrow: Personnalisation
permalink: /fr/docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux est bâti sur un système de variables CSS. Vous pouvez changer presque tout le visuel sans toucher aux sources — collez des règles dans l'onglet **Apparence**, cliquez Appliquer, et elles prennent effet immédiatement sur tous les clients connectés.

## Où le mettre

Ouvrez Paramètres (<kbd>⌘,</kbd>) et choisissez **Apparence**. Vous verrez un seul textarea libellé CSS personnalisé.

1. Écrivez vos règles.
2. Cliquez **Appliquer**. Le CSS est injecté dans une balise `<style>` sur chaque page.
3. Cliquez **Réinitialiser** pour effacer toutes les surcharges.

Le CSS est stocké sur le serveur dans `~/.purplemux/config.json` (`customCSS`), il s'applique donc sur chaque appareil qui se connecte.

{% call callout('note', 'Au niveau du serveur, pas par appareil') %}
Le CSS personnalisé vit dans la config serveur et vous suit sur chaque navigateur. Si vous voulez qu'un appareil paraisse différent d'un autre, ce n'est actuellement pas pris en charge.
{% endcall %}

## Comment ça marche

La plupart des couleurs, surfaces et accents de purplemux sont exposés comme variables CSS sous `:root` (clair) et `.dark`. Surcharger la variable cascade le changement partout où elle est utilisée — barre latérale, dialogues, graphes, badges de statut.

Changer une seule variable est presque toujours mieux que de surcharger directement les sélecteurs de composants. Les classes de composants ne sont pas une API stable ; les variables le sont.

## Un exemple minimal

Réchauffer un peu la barre latérale en mode clair et pousser la surface sombre plus profonde :

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

Ou recolorer la marque sans toucher au reste :

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## Groupes de variables

Le panneau Apparence expose la liste complète sous **Variables disponibles**. Les principaux groupes :

- **Surface** — `--background`, `--card`, `--popover`, `--muted`, `--secondary`, `--accent`, `--sidebar`
- **Texte** — `--foreground` et les variantes `*-foreground` correspondantes
- **Interactif** — `--primary`, `--primary-foreground`, `--destructive`
- **Bordure** — `--border`, `--input`, `--ring`
- **Palette** — `--ui-blue`, `--ui-teal`, `--ui-coral`, `--ui-amber`, `--ui-purple`, `--ui-pink`, `--ui-green`, `--ui-gray`, `--ui-red`
- **Sémantique** — `--positive`, `--negative`, `--accent-color`, `--brand`, `--focus-indicator`, `--claude-active`

Pour la liste complète des tokens avec leurs valeurs OKLCH par défaut et le raisonnement de design, voir [`docs/STYLE.md`](https://github.com/subicura/purplemux/blob/main/docs/STYLE.md) dans le dépôt. Ce document est la source de vérité.

## Cibler un seul mode

Enveloppez les règles dans `:root` pour clair et `.dark` pour sombre. La classe est posée sur `<html>` par `next-themes`.

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

Si vous n'avez besoin de changer qu'un seul mode, laissez l'autre intact.

## Et le terminal ?

Le terminal xterm.js utilise sa propre palette, choisie dans une liste curée — il n'est pas piloté par ces variables CSS. Basculez-le dans l'onglet **Terminal**. Voir [Thèmes terminal](/purplemux/fr/docs/terminal-themes/).

## Pour aller plus loin

- **[Thèmes & polices](/purplemux/fr/docs/themes-fonts/)** — clair, sombre, système ; préréglages de taille de police.
- **[Thèmes terminal](/purplemux/fr/docs/terminal-themes/)** — palette séparée pour la zone terminal.
- **[Barre latérale & options Claude](/purplemux/fr/docs/sidebar-options/)** — réordonner les éléments, basculer les flags Claude.
