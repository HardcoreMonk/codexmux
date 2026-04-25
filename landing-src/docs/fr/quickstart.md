---
title: Démarrage rapide
description: Lancez purplemux en moins d'une minute avec Node.js et tmux.
eyebrow: Commencer
permalink: /fr/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux est un multiplexeur web-natif qui gère toutes vos sessions Claude Code depuis un seul tableau de bord, s'appuie sur `tmux` pour la persistance et est conçu aussi bien pour votre bureau que pour votre téléphone.

## Avant de commencer

Il vous faut deux choses sur la machine qui hébergera purplemux.

- **Node.js 20 ou plus récent** — vérifiez avec `node -v`.
- **tmux** — vérifiez avec `tmux -V`. Toute version 3.0+ fait l'affaire.

{% call callout('note', 'macOS / Linux uniquement') %}
Windows n'est pas officiellement pris en charge. purplemux dépend de `node-pty` et de tmux, qui ne fonctionnent pas nativement sur Windows. WSL2 fonctionne en général, mais ne fait pas partie de notre matrice de tests.
{% endcall %}

## Lancement

Une seule commande. Aucune installation globale nécessaire.

```bash
npx purplemux
```

purplemux démarre sur le port `8022`. Ouvrez un navigateur :

```
http://localhost:8022
```

Au premier lancement, un assistant vous guide pour créer un mot de passe et votre premier espace de travail.

{% call callout('tip') %}
Vous préférez une installation persistante ? `pnpm add -g purplemux && purplemux` fonctionne de la même manière. Les mises à jour se font avec un simple `pnpm up -g purplemux`.
{% endcall %}

## Ouvrir une session Claude

Depuis le tableau de bord :

1. Cliquez sur **Nouvel onglet** dans n'importe quel espace de travail.
2. Choisissez le modèle **Claude** (ou exécutez simplement `claude` dans un terminal classique).
3. purplemux détecte la CLI Claude en cours d'exécution et commence à afficher le statut, la timeline en direct et les invites de permission.

Votre session persiste même si vous fermez le navigateur — tmux maintient le processus en vie sur le serveur.

## Y accéder depuis votre téléphone

Par défaut, purplemux écoute uniquement sur `localhost`. Pour un accès externe sécurisé, utilisez Tailscale Serve (WireGuard + HTTPS automatique, pas de redirection de port) :

```bash
tailscale serve --bg 8022
```

Ouvrez `https://<machine>.<tailnet>.ts.net` sur votre téléphone, touchez **Partager → Sur l'écran d'accueil**, et purplemux devient une PWA qui reçoit les notifications Web Push en arrière-plan.

Voir [Accès Tailscale](/purplemux/fr/docs/tailscale/) pour la configuration complète, ou [Configuration PWA](/purplemux/fr/docs/pwa-setup/) pour les détails iOS et Android.

## Pour aller plus loin

- **[Installation](/purplemux/fr/docs/installation/)** — détails par plateforme, app native macOS, démarrage automatique.
- **[Compatibilité navigateur](/purplemux/fr/docs/browser-support/)** — matrice de compatibilité desktop et mobile.
- **[Première session](/purplemux/fr/docs/first-session/)** — visite guidée du tableau de bord.
- **[Raccourcis clavier](/purplemux/fr/docs/keyboard-shortcuts/)** — tous les raccourcis dans un seul tableau.
