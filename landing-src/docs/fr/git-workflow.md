---
title: Panneau de workflow Git
description: Une visionneuse de diff, un explorateur d'historique et des contrôles de sync à côté de votre terminal — avec un transfert en un clic vers Claude quand quelque chose casse.
eyebrow: Espaces de travail & terminal
permalink: /fr/docs/git-workflow/index.html
---
{% from "docs/callouts.njk" import callout %}

Le panneau Git est un type d'onglet, comme un terminal. Ouvrez-le à côté d'une session Claude et vous pouvez lire les changements, parcourir l'historique et pousser sans quitter le tableau de bord. Quand git lui-même râle, « Demander à Claude » transmet le problème à une session en un clic.

## Ouvrir le panneau

Ajoutez un nouvel onglet et choisissez **Diff** comme type de panneau, ou basculez-y depuis le menu de type d'onglet sur un onglet existant. Le panneau se cale sur le même répertoire de travail que ses onglets frères — si votre onglet est dans `~/code/api`, le panneau de diff lit ce dépôt.

| Action | macOS | Linux / Windows |
|---|---|---|
| Basculer l'onglet actif en mode Diff | <kbd>⌘⇧F</kbd> | <kbd>Ctrl+Shift+F</kbd> |

Si le répertoire n'est pas un dépôt git, le panneau le dit et reste hors du chemin.

## La visionneuse de diff

L'onglet Modifications affiche les changements de l'arbre de travail par fichier.

- **Côte à côte ou en ligne** — bascule dans l'en-tête du panneau. Côte à côte reproduit la vue split de GitHub ; en ligne reproduit la vue unifiée de GitHub.
- **Coloration syntaxique** — détection de langage complète pour les langages que votre éditeur colorise.
- **Expansion de hunks en ligne** — cliquez sur les lignes de contexte autour d'un hunk pour étendre le code environnant sans quitter le panneau.
- **Liste de fichiers** — naviguez entre les fichiers modifiés dans la barre latérale du panneau.

Les changements se rafraîchissent toutes les 10 secondes pendant que le panneau est visible, et immédiatement quand vous sauvegardez depuis un autre outil.

## Historique des commits

Passez à l'onglet **Historique** pour un journal paginé des commits sur la branche courante. Chaque entrée affiche le hash, le sujet, l'auteur et l'heure ; cliquez pour voir le diff posé par ce commit. Utile pour vous rappeler pourquoi un fichier a sa tête actuelle sans repasser par le terminal pour `git log`.

## Panneau de sync

La bande d'en-tête montre la branche courante, l'upstream et un compteur ahead/behind. Trois actions :

- **Fetch** — `git fetch` contre l'upstream toutes les 3 minutes en arrière-plan, plus à la demande.
- **Pull** — fast-forward quand c'est possible.
- **Push** — pousse vers l'upstream configuré.

Sync est volontairement étroit. Il refuse tout ce qui demande une décision — branches divergentes, arbre de travail sale, upstream manquant — et vous dit pourquoi.

{% call callout('warning', "Quand sync ne passe pas") %}
Échecs courants que le panneau signale clairement :

- **Pas d'upstream** — `git push -u` n'a pas encore été exécuté.
- **Auth** — identifiants manquants ou rejetés.
- **Divergent** — local et distant ont chacun des commits uniques ; rebase ou merge d'abord.
- **Modifications locales** — du travail non commité bloque le pull.
- **Rejeté** — push rejeté pour non fast-forward.
{% endcall %}

## Demander à Claude

Quand sync échoue, le toast d'erreur propose un bouton **Demander à Claude**. Un clic envoie le contexte de l'échec — le type d'erreur, la sortie `git` pertinente et l'état courant de la branche — dans l'onglet Claude du même espace, sous forme de prompt. Claude vous accompagne ensuite dans la récupération : rebaser, résoudre les conflits, configurer un upstream, quoi que demande l'erreur.

C'est le pari principal du panneau : de l'outillage pour le cas courant, un LLM pour la longue traîne. Vous ne changez pas de contexte ; le prompt arrive dans la session que vous alliez utiliser de toute façon.

## Pour aller plus loin

- **[Onglets & volets](/purplemux/fr/docs/tabs-panes/)** — diviser le panneau de diff à côté d'une session Claude.
- **[Première session](/purplemux/fr/docs/first-session/)** — comment les invites de permission Claude apparaissent dans le tableau de bord.
- **[Panneau navigateur web](/purplemux/fr/docs/web-browser-panel/)** — l'autre type de panneau qui mérite d'être placé à côté d'un terminal.
