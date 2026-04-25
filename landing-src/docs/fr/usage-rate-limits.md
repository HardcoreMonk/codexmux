---
title: Usage & limites de débit
description: Décomptes de limites de débit 5 h et 7 j en temps réel dans la barre latérale, plus un tableau de bord stats pour tokens, coût et répartition par projet.
eyebrow: Claude Code
permalink: /fr/docs/usage-rate-limits/index.html
---
{% from "docs/callouts.njk" import callout %}

Atteindre une limite de débit en plein milieu d'une tâche est la pire interruption qui soit. purplemux remonte les chiffres de quota de Claude Code dans la barre latérale et ajoute un tableau de bord stats pour voir votre rythme d'usage d'un coup d'œil.

## Le widget de la barre latérale

Deux fines barres en bas de la barre latérale : **5 h** et **7 j**. Chacune montre :

- Le pourcentage de la fenêtre que vous avez consommé
- Le temps restant jusqu'au reset
- Une barre de projection pâle pour où vous atterrirez si vous gardez votre rythme actuel

Survolez n'importe quelle barre pour la décomposition complète — pourcentage utilisé, pourcentage projeté et heure de reset en durée relative.

Les chiffres viennent du JSON de statusline de Claude Code. purplemux installe un petit script `~/.purplemux/statusline.sh` qui poste les données au serveur local chaque fois que Claude rafraîchit sa statusline ; un `fs.watch` garde l'interface synchronisée.

## Seuils de couleur

Les deux barres changent de couleur selon le pourcentage utilisé :

| Utilisé | Couleur |
|---|---|
| 0–49 % | sarcelle — confortable |
| 50–79 % | orange — modérez le rythme |
| 80–100 % | rouge — sur le point de heurter le mur |

Les seuils correspondent au widget de limite de débit de la page d'accueil. Une fois que vous avez vu orange quelques fois, la barre latérale devient un outil de cadence périphérique — vous arrêtez de la remarquer consciemment, mais vous commencez à étaler le travail sur les fenêtres.

{% call callout('tip', 'La projection bat le pourcentage') %}
La barre pâle derrière la solide est une projection — si vous continuez au rythme actuel, c'est où vous serez à l'heure du reset. Voir la projection franchir 80 % bien avant l'usage réel est la meilleure alerte précoce.
{% endcall %}

## Le tableau de bord stats

Ouvrez le tableau de bord depuis la barre latérale (ou avec <kbd>⌘⇧U</kbd>). Cinq sections, de haut en bas :

### Cartes d'aperçu

Quatre cartes : **Total sessions**, **Coût total**, **Coût aujourd'hui**, **Coût ce mois-ci**. Chaque carte montre la variation vs. la période précédente en vert ou rouge.

### Usage de tokens par modèle

Un graphique en barres empilées par jour, ventilé par modèle et par type de token — input, output, lectures de cache, écritures de cache. La légende des modèles utilise les noms d'affichage de Claude (Opus / Sonnet / Haiku) et le même traitement de couleur que les barres de la barre latérale.

C'est l'endroit le plus simple pour voir, par exemple, qu'un pic de coût inattendu était une journée chargée en Opus, ou que les lectures de cache font le plus gros du travail.

### Répartition par projet

Un tableau de chaque projet Claude Code (répertoire de travail) que vous avez utilisé, avec sessions, messages, tokens et coût. Cliquez sur une ligne pour voir un graphique par jour pour ce projet uniquement.

Utile pour des machines partagées ou pour séparer le travail client des bidouilles perso.

### Activité & séries

Un graphique d'aire d'activité quotidienne sur 30 jours, plus quatre métriques de séries :

- **Plus longue série** — votre record de jours travaillés consécutifs
- **Série actuelle** — combien de jours d'affilée vous avez travaillé en ce moment
- **Total de jours actifs** — compte sur la période
- **Sessions moyennes par jour**

### Timeline hebdomadaire

Une grille jour × heure montrant quand vous avez réellement utilisé Claude la semaine dernière. Les sessions concurrentes s'empilent visuellement, donc un mardi « cinq sessions à 15 h » se repère facilement.

## D'où viennent les données

Tout dans le tableau de bord est calculé localement à partir des JSONL de session de Claude Code sous `~/.claude/projects/`. purplemux les lit, met en cache les comptes parsés dans `~/.purplemux/stats/`, et n'envoie jamais un octet hors machine. Changer de langue ou régénérer le cache n'appelle nulle part.

## Comportement du reset

Les fenêtres 5 heures et 7 jours sont glissantes et liées à votre compte Claude Code. Quand une fenêtre se reset, la barre tombe à 0 % et le pourcentage et le temps restant se recalculent depuis l'horodatage de prochain reset. Si purplemux a manqué le reset (serveur éteint), le widget se corrige au prochain tick statusline.

## Pour aller plus loin

- **[Notes (rapport quotidien IA)](/purplemux/fr/docs/notes-daily-report/)** — mêmes données, rédigées en brief par jour.
- **[Statut de session](/purplemux/fr/docs/session-status/)** — l'autre chose que la barre latérale suit par onglet.
- **[Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/)** — y compris <kbd>⌘⇧U</kbd> pour les stats.
