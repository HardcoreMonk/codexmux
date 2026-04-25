---
title: Sauvegarder & restaurer les mises en page
description: Pourquoi vos onglets reviennent exactement là où vous les avez laissés, même après un redémarrage du serveur.
eyebrow: Espaces de travail & terminal
permalink: /fr/docs/save-restore/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux est conçu autour de l'idée que fermer un onglet dans votre navigateur ne devrait pas mettre fin à une session. Deux pièces travaillent de concert : tmux maintient les shells en vie, et `~/.purplemux/workspaces.json` se souvient de la mise en page.

## Ce qui est persisté

Tout ce qui est visible dans un espace de travail :

- Onglets et leur ordre
- Divisions de volets et leurs ratios
- Type de panneau de chaque onglet — Terminal, Claude, Diff, Navigateur web
- Répertoire de travail de chaque shell
- Groupes d'espaces, noms et ordre

`workspaces.json` est mis à jour de manière transactionnelle à chaque changement de mise en page, le fichier reflète donc toujours l'état courant. Voir [Répertoire de données](/purplemux/fr/docs/data-directory/) pour la cartographie sur disque.

## Fermer le navigateur

Fermez l'onglet, rafraîchissez ou rabattez le capot du portable. Rien de tout cela ne tue les sessions.

Chaque shell vit dans une session tmux sur le socket dédié `purple` — totalement isolé de votre `~/.tmux.conf` personnel. Rouvrez `http://localhost:8022` une heure plus tard et le WebSocket se rattache à la même session tmux, rejoue le scrollback et redonne le PTY actif à xterm.js.

Vous ne restaurez rien ; vous vous reconnectez.

{% call callout('tip', 'Pareil sur mobile') %}
Idem sur le téléphone. Fermez la PWA, verrouillez l'appareil, revenez le lendemain — le tableau de bord se rattache avec tout en place.
{% endcall %}

## Récupérer après un redémarrage du serveur

Un redémarrage tue bien les processus tmux — ce sont juste des processus OS. purplemux gère ça au démarrage suivant :

1. **Lecture de la mise en page** — `workspaces.json` décrit chaque espace, volet et onglet.
2. **Recréation des sessions en parallèle** — pour chaque onglet, une nouvelle session tmux est créée dans son répertoire de travail sauvegardé.
3. **Reprise auto de Claude** — les onglets qui avaient une session Claude active sont relancés avec `claude --resume {sessionId}` pour reprendre la conversation là où elle s'était arrêtée.

Le « parallèle » a son importance : si vous aviez dix onglets, les dix sessions tmux remontent en même temps au lieu de l'une après l'autre. Quand vous ouvrez le navigateur, la mise en page est déjà là.

## Ce qui ne revient pas

Quelques choses ne peuvent pas être persistées :

- **État shell en mémoire** — variables d'environnement définies, jobs en arrière-plan, REPL en cours de réflexion.
- **Invites de permission en vol** — si Claude attendait une décision de permission au moment du crash, vous reverrez l'invite à la reprise.
- **Processus au premier plan autres que `claude`** — buffers `vim`, `htop`, `docker logs -f`. Le shell est de retour dans le même répertoire ; le processus, non.

C'est le contrat tmux standard : le shell survit, les processus à l'intérieur pas forcément.

## Contrôle manuel

Vous n'avez normalement pas besoin d'y toucher, mais pour les curieux :

- Le socket tmux s'appelle `purple`. Inspectez avec `tmux -L purple ls`.
- Les sessions sont nommées `pt-{workspaceId}-{paneId}-{tabId}`.
- Éditer `workspaces.json` pendant que purplemux tourne n'est pas sûr — le serveur le tient ouvert et écrit dedans.

Pour aller plus loin (protocole binaire, backpressure, surveillance JSONL), voir [Comment ça marche](/purplemux/#how) sur la page d'accueil.

## Pour aller plus loin

- **[Espaces de travail & groupes](/purplemux/fr/docs/workspaces-groups/)** — ce qui est sauvegardé par espace.
- **[Onglets & volets](/purplemux/fr/docs/tabs-panes/)** — ce qui est sauvegardé par onglet.
- **[Compatibilité navigateur](/purplemux/fr/docs/browser-support/)** — particularités connues sur les onglets en arrière-plan mobile et les reconnexions.
