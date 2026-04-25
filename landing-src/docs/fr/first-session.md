---
title: Première session
description: Visite guidée du tableau de bord — d'un espace de travail vide à votre première session Claude, opérationnelle et surveillée.
eyebrow: Commencer
permalink: /fr/docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux tourne déjà (sinon, voir le [Démarrage rapide](/purplemux/fr/docs/quickstart/)). Cette page explique ce que fait réellement l'interface, pour que les premières minutes paraissent moins abstraites.

## Le tableau de bord

Quand vous ouvrez `http://localhost:8022`, vous arrivez sur un **espace de travail**. Pensez-y comme à un dossier d'onglets liés — un pour le projet sur lequel vous travaillez avec Claude, un autre pour la doc que vous rédigez, un autre encore pour du shell ad hoc.

La mise en page :

- **Barre latérale gauche** — espaces de travail et sessions, badges de statut Claude, widget de limite, notes, statistiques
- **Zone principale** — volets dans l'espace de travail courant ; chaque volet peut contenir plusieurs onglets
- **Barre du haut** — nom de l'espace, contrôles de division, paramètres

Basculer la barre latérale à tout moment avec <kbd>⌘B</kbd>. Changer de mode Espace/Sessions avec <kbd>⌘⇧B</kbd>.

## Créer un espace de travail

Le premier lancement vous donne un espace par défaut. Pour en ajouter un autre :

1. Cliquez sur **+ Nouvel espace** en haut de la barre latérale (<kbd>⌘N</kbd>).
2. Nommez-le et choisissez un répertoire par défaut — c'est là que démarrent les shells des nouveaux onglets.
3. Appuyez sur Entrée. L'espace vide s'ouvre.

Vous pouvez réordonner et renommer les espaces plus tard en les glissant dans la barre latérale.

## Ouvrir votre premier onglet

Un espace démarre vide. Ajoutez un onglet avec <kbd>⌘T</kbd> ou avec le bouton **+** dans la barre d'onglets.

Choisissez un **modèle** :

- **Terminal** — un shell vide. Idéal pour `vim`, `docker`, des scripts.
- **Claude** — démarre avec `claude` déjà en cours d'exécution dans le shell.

{% call callout('tip', 'Les modèles ne sont que des raccourcis') %}
En coulisses, chaque onglet est un shell standard. Le modèle Claude consiste juste à « ouvrir un terminal et exécuter `claude` ». Si vous lancez `claude` manuellement plus tard dans un onglet Terminal, purplemux le remarque et commence à afficher son statut de la même façon.
{% endcall %}

## Lire le statut de session

Regardez la **ligne de session de la barre latérale** pour votre onglet. Vous y verrez l'un de ces indicateurs :

| État | Signification |
|---|---|
| **Inactif** (gris) | Claude attend votre saisie. |
| **Occupé** (spinner violet) | Claude travaille — lecture de fichiers, exécution d'outils. |
| **Saisie requise** (orange) | Claude attend une autorisation ou a posé une question. |
| **À examiner** (bleu) | Travail terminé, Claude s'est arrêté ; il y a quelque chose à vérifier. |

Les transitions sont quasi instantanées. Voir [Statut de session](/purplemux/fr/docs/session-status/) pour le détail de la détection.

## Répondre à une demande de permission

Quand Claude veut exécuter un outil ou modifier un fichier, purplemux **intercepte l'invite** et l'affiche en ligne dans la vue de session. Vous pouvez :

- Cliquer sur **1 · Oui** / **2 · Oui, toujours** / **3 · Non**, ou
- Appuyer sur les touches numériques de votre clavier, ou
- L'ignorer et répondre depuis votre téléphone — la même alerte arrive en Web Push mobile.

La CLI Claude n'est jamais réellement bloquée par l'invite interceptée ; purplemux renvoie votre réponse en sous-main.

## Diviser et naviguer

Une fois un onglet en cours, essayez :

- <kbd>⌘D</kbd> — diviser le volet courant à droite
- <kbd>⌘⇧D</kbd> — diviser vers le bas
- <kbd>⌘⌥←/→/↑/↓</kbd> — déplacer le focus entre les divisions
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — onglet précédent / suivant

Liste complète sur la page [Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/).

## Sauvegarde et restauration

Fermez le navigateur. Vos onglets ne disparaissent pas — tmux les maintient ouverts sur le serveur. Revenez une heure plus tard (ou une semaine) et purplemux restaure exactement la même mise en page, y compris les ratios de division et les répertoires de travail.

Même un redémarrage du serveur est récupérable : au démarrage, purplemux lit la mise en page sauvegardée dans `~/.purplemux/workspaces.json`, relance les shells dans les bons répertoires et rattache les sessions Claude quand c'est possible.

## Y accéder depuis votre téléphone

Exécutez :

```bash
tailscale serve --bg 8022
```

Sur votre téléphone, ouvrez `https://<machine>.<tailnet>.ts.net`, touchez **Partager → Sur l'écran d'accueil**, et accordez la permission de notifications. Vous recevez désormais des alertes push pour les états **saisie requise** et **à examiner** même quand l'onglet est fermé.

Pas-à-pas complet : [Configuration PWA](/purplemux/fr/docs/pwa-setup/) · [Web Push](/purplemux/fr/docs/web-push/) · [Tailscale](/purplemux/fr/docs/tailscale/).

## Pour aller plus loin

- **[Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/)** — tous les raccourcis dans un seul tableau.
- **[Compatibilité navigateur](/purplemux/fr/docs/browser-support/)** — matrice de compatibilité, en particulier iOS Safari 16.4+.
- Explorez la barre latérale : **Notes** (<kbd>⌘⇧E</kbd>) pour le rapport quotidien IA, **Stats** (<kbd>⌘⇧U</kbd>) pour les analyses d'usage.
