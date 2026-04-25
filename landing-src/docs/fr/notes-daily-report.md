---
title: Notes (rapport quotidien IA)
description: Un résumé de fin de journée de chaque session Claude Code, rédigé par un LLM, stocké localement en Markdown.
eyebrow: Claude Code
permalink: /fr/docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

Quand la journée est terminée, purplemux peut lire les logs de session du jour et vous écrire un brief en une ligne plus un résumé Markdown par projet. Ça vit dans la barre latérale comme **Notes** et existe pour que rétros, daily standups et 1:1 cessent de commencer par « qu'est-ce que j'ai fait hier ? ».

## Ce que vous avez par jour

Chaque entrée a deux couches :

- **Brief en une ligne** — une seule phrase qui capture la forme de la journée. Visible directement dans la liste Notes.
- **Vue détaillée** — étendez le brief pour voir un rapport Markdown groupé par projet, avec sections H3 par sujet et points-clés en puces dessous.

Le brief est ce que vous parcourez ; la vue détaillée est ce que vous collez dans un doc de rétro.

Un petit en-tête sur chaque jour montre le compte de sessions et le coût total — les mêmes chiffres qu'utilise le [tableau de bord stats](/purplemux/fr/docs/usage-rate-limits/), sous forme de résumé.

## Générer un rapport

Les rapports sont générés à la demande, pas automatiquement. Depuis la vue Notes :

- **Générer** à côté d'un jour manquant crée le rapport du jour à partir des transcripts JSONL.
- **Régénérer** sur une entrée existante reconstruit le même jour avec un contenu frais (utile si vous avez ajouté du contexte ou changé de langue).
- **Générer tout** parcourt tous les jours manquants et les remplit séquentiellement. Vous pouvez arrêter le batch à tout moment.

Le LLM traite chaque session individuellement avant de les fusionner par projet, donc le contexte n'est pas perdu sur les longues journées avec beaucoup d'onglets.

{% call callout('note', 'La locale suit l\'app') %}
Les rapports sont écrits dans la langue à laquelle purplemux est réglé. Changer la langue de l'app et régénérer vous donne le même contenu dans la nouvelle locale.
{% endcall %}

## Où ça vit

| Surface | Chemin |
|---|---|
| Barre latérale | Entrée **Notes**, ouvre la vue liste |
| Raccourci | <kbd>⌘⇧E</kbd> sur macOS, <kbd>Ctrl⇧E</kbd> sur Linux |
| Stockage | `~/.purplemux/stats/daily-reports/<date>.json` |

Chaque jour est un fichier JSON contenant le brief, le Markdown détaillé, la locale et les métadonnées de session. Rien ne quitte votre machine sauf l'appel LLM lui-même, qui passe par le compte Claude Code configuré sur l'hôte.

## Structure par projet

Dans la vue détaillée, une journée typique ressemble à :

```markdown
**purplemux**

### Brouillon de la landing page
- Conception de la structure en huit sections avec layouts Hero / Why / Mobile / Stats
- La couleur violette de marque devient une variable OKLCH
- Application des cadres de mockup desktop / mobile

### Mockups de cartes de fonctionnalités
- Reproduction des indicateurs spinner / pulse réels sur le tableau de bord multi-sessions
- Resserrage des CSS Git Diff, espace de travail et auto-hébergé
```

Les sessions qui ont travaillé dans le même projet sont fusionnées sous un seul en-tête de projet ; les sujets dans un projet deviennent des sections H3. Vous pouvez copier le Markdown rendu directement dans un template de rétro.

## Quand les jours n'ont pas de sens à résumer

Un jour sans session Claude n'a pas d'entrée. Un jour avec une seule session minuscule peut produire un brief très court — c'est OK ; il se régénérera plus long la prochaine fois que vous bossez vraiment.

Le générateur batch saute les jours qui ont déjà un rapport dans la locale courante et ne remplit que les vrais trous.

## Confidentialité

Le texte utilisé pour construire un rapport est composé des mêmes transcripts JSONL que vous pouvez lire vous-même dans `~/.claude/projects/`. La requête de résumé est un seul appel LLM par jour ; la sortie en cache reste sous `~/.purplemux/`. Pas de télémétrie, pas d'upload, pas de cache partagé.

## Pour aller plus loin

- **[Usage & limites de débit](/purplemux/fr/docs/usage-rate-limits/)** — le tableau de bord d'où viennent ces comptes de sessions et coûts.
- **[Vue de session en direct](/purplemux/fr/docs/live-session-view/)** — les données source, en temps réel.
- **[Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/)** — y compris <kbd>⌘⇧E</kbd> pour Notes.
