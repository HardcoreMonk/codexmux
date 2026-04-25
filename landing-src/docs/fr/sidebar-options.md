---
title: Barre latérale & options Claude
description: Réordonnez et masquez les raccourcis de la barre latérale, gérez la bibliothèque de prompts rapides, et basculez les flags de la CLI Claude.
eyebrow: Personnalisation
permalink: /fr/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

La barre latérale et la barre de saisie sont composées de petites listes que vous pouvez remodeler — liens raccourcis en bas de la barre latérale, boutons de prompt au-dessus de la saisie. L'onglet Claude dans Paramètres contient les bascules au niveau CLI pour les sessions que vous lancez depuis le tableau de bord.

## Éléments de la barre latérale

Paramètres (<kbd>⌘,</kbd>) → onglet **Barre latérale**. La liste contrôle la rangée de raccourcis qui vit en bas de la barre latérale — liens vers des dashboards, outils internes, n'importe quoi adressable par URL.

Chaque ligne a une poignée de glisser, un nom, une URL et un interrupteur. Vous pouvez :

- **Glisser** la poignée pour réordonner. Les éléments intégrés et personnalisés bougent librement.
- **Basculer** l'interrupteur pour masquer un élément sans le supprimer.
- **Modifier** les éléments personnalisés (icône crayon) — changer nom, icône ou URL.
- **Supprimer** les éléments personnalisés (icône poubelle).
- **Réinitialiser aux défauts** — restaure les éléments intégrés, supprime tous les personnalisés, efface l'ordre.

### Ajouter un élément personnalisé

Cliquez **Ajouter un élément** en bas. Vous obtiendrez un petit formulaire :

- **Nom** — apparaît comme tooltip et label.
- **Icône** — choisie dans une galerie cherchable lucide-react.
- **URL** — n'importe quoi en `http(s)://...` marche. Grafana interne, dashboards Vercel, un outil d'admin interne.

Cliquez Enregistrer et la ligne apparaît en bas de la liste. Glissez-la où vous voulez.

{% call callout('note', 'Les intégrés peuvent être masqués, pas supprimés') %}
Les éléments intégrés (ceux que purplemux livre) n'ont qu'un interrupteur et une poignée — pas d'édition ni de suppression. Ils sont toujours là au cas où vous changiez d'avis. Les éléments personnalisés ont le kit complet.
{% endcall %}

## Prompts rapides

Paramètres → onglet **Prompts rapides**. Ce sont les boutons qui s'asseyent au-dessus du champ de saisie Claude — clic unique pour envoyer un message pré-écrit.

Même schéma que les éléments de barre latérale :

- Glisser pour réordonner.
- Basculer pour masquer.
- Modifier / supprimer les prompts personnalisés.
- Réinitialiser aux défauts.

Ajouter un prompt demande un **nom** (le label du bouton) et le **prompt** lui-même (texte multi-lignes). Utilisez-les pour ce que vous tapez souvent : « Lance la suite de tests », « Résume le dernier commit », « Review le diff courant ».

## Options de la CLI Claude

Paramètres → onglet **Claude**. Ces flags affectent *comment purplemux lance la CLI Claude* dans les nouveaux onglets — ils ne changent pas le comportement d'une session déjà lancée.

### Skip Permission Checks

Ajoute `--dangerously-skip-permissions` à la commande `claude`. Claude exécutera les outils et modifiera les fichiers sans demander d'approbation à chaque fois.

C'est le même flag que la CLI officielle expose — purplemux n'allège aucune sécurité par-dessus. Lisez la [documentation d'Anthropic](https://docs.anthropic.com/en/docs/claude-code/cli-reference) avant de l'activer. À traiter comme opt-in pour des espaces de travail de confiance uniquement.

### Show Terminal with Claude

Quand **on** (par défaut) : un onglet Claude affiche la vue de session en direct *et* le volet terminal sous-jacent côte à côte, donc vous pouvez plonger dans le shell quand vous voulez.

Quand **off** : les nouveaux onglets Claude s'ouvrent avec le terminal replié. La vue de session remplit tout le volet. Vous pouvez toujours étendre le terminal manuellement par onglet ; ceci ne change que le défaut pour les onglets nouvellement créés.

Utilisez le réglage off si vous pilotez surtout Claude via la timeline et voulez un défaut plus propre.

## Pour aller plus loin

- **[Thèmes & polices](/purplemux/fr/docs/themes-fonts/)** — clair, sombre, système ; préréglages de taille de police.
- **[Intégration éditeur](/purplemux/fr/docs/editor-integration/)** — câbler VS Code, Cursor, code-server.
- **[Première session](/purplemux/fr/docs/first-session/)** — rappel sur la mise en page du tableau de bord.
