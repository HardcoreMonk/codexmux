---
title: Ports & variables d'environnement
description: Tous les ports que purplemux ouvre et toutes les variables d'environnement qui influencent son fonctionnement.
eyebrow: Référence
permalink: /fr/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux est censé être une installation en une ligne, mais l'exécution est configurable. Cette page liste chaque port qu'il ouvre et chaque variable d'environnement que le serveur lit.

## Ports

| Port | Défaut | Surcharge | Notes |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux` | Si `8022` est déjà pris, le serveur loggue un warning et se bind sur un port libre aléatoire à la place. |
| Next.js interne (production) | aléatoire | — | En `pnpm start` / `purplemux start`, le serveur externe proxy vers un Next.js standalone bindé à `127.0.0.1:<aléatoire>`. Non exposé. |

`8022` est `web` + `ssh` collés ensemble. Le choix est de l'humour, pas un protocole.

{% call callout('note', 'L\'interface bindée suit la politique d\'accès') %}
purplemux ne se bind sur `0.0.0.0` que si la politique d'accès autorise réellement les clients externes. Les setups localhost-only se bindent sur `127.0.0.1` pour que les autres machines du LAN ne puissent même pas ouvrir une connexion TCP. Voir `HOST` ci-dessous.
{% endcall %}

## Variables d'env serveur

Lues par `server.ts` et les modules qu'il charge au démarrage.

| Variable | Défaut | Effet |
|---|---|---|
| `PORT` | `8022` | Port d'écoute HTTP/WS. Repli sur un port aléatoire en cas d'`EADDRINUSE`. |
| `HOST` | non défini | Spec CIDR/mot-clé séparée par virgules pour les clients autorisés. Mots-clés : `localhost`, `tailscale`, `lan`, `all` (ou `*` / `0.0.0.0`). Exemples : `HOST=localhost`, `HOST=localhost,tailscale`, `HOST=10.0.0.0/8,localhost`. Quand défini par env, **Paramètres → Accès réseau** in-app est verrouillé. |
| `NODE_ENV` | `production` (dans `purplemux start`), `development` (dans `pnpm dev`) | Sélectionne entre le pipeline dev (`tsx watch`, Next dev) et le pipeline prod (bundle `tsup` proxyant vers Next standalone). |
| `__PMUX_APP_DIR` | `process.cwd()` | Surcharge le répertoire qui contient `dist/server.js` et `.next/standalone/`. Défini automatiquement par `bin/purplemux.js` ; vous ne devriez pas y toucher. |
| `__PMUX_APP_DIR_UNPACKED` | non défini | Variante de `__PMUX_APP_DIR` pour le chemin asar-unpacked dans l'app Electron macOS. |
| `__PMUX_ELECTRON` | non défini | Quand le processus principal Electron démarre le serveur in-process, il définit ceci pour que `server.ts` saute l'appel auto à `start()` et laisse Electron piloter le cycle de vie. |
| `PURPLEMUX_CLI` | `1` (défini par `bin/purplemux.js`) | Marqueur qui indique aux modules partagés que le processus est la CLI / serveur, pas Electron. Utilisé par `pristine-env.ts`. |
| `__PMUX_PRISTINE_ENV` | non défini | Snapshot JSON de l'env shell parent, capturé par `bin/purplemux.js` pour que les processus enfants (claude, tmux) héritent du `PATH` de l'utilisateur plutôt que d'un sanitisé. Interne — défini automatiquement. |
| `AUTH_PASSWORD` | non défini | Défini par le serveur depuis le hash scrypt de `config.json` avant que Next ne démarre. NextAuth le lit de là. Ne le réglez pas manuellement. |
| `NEXTAUTH_SECRET` | non défini | Même histoire — peuplé depuis `config.json` au démarrage. |

## Variables d'env de logging

Lues par `src/lib/logger.ts`.

| Variable | Défaut | Effet |
|---|---|---|
| `LOG_LEVEL` | `info` | Niveau racine pour tout ce qui n'est pas nommé dans `LOG_LEVELS`. |
| `LOG_LEVELS` | non défini | Surcharges par module sous forme de paires `name=level` séparées par virgules. |

Niveaux, dans l'ordre : `trace` · `debug` · `info` · `warn` · `error` · `fatal`.

```bash
LOG_LEVEL=debug purplemux

# debug uniquement le module de hook Claude
LOG_LEVELS=hooks=debug purplemux

# plusieurs modules à la fois
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux
```

Les noms de modules les plus utiles :

| Module | Source | Ce que vous voyez |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`, parties de `status-manager.ts` | Réception / traitement / transitions d'état des hooks |
| `status` | `status-manager.ts` | Polling, watcher JSONL, broadcast |
| `tmux` | `lib/tmux.ts` | Chaque commande tmux et son résultat |
| `server`, `lock`, etc. | `lib/*.ts` correspondant | Cycle de vie du processus |

Les fichiers de log atterrissent sous `~/.purplemux/logs/` quel que soit le niveau.

## Fichiers (équivalent env)

Quelques valeurs se comportent comme des variables d'environnement mais vivent sur le disque pour que la CLI et les scripts hook les trouvent sans handshake env :

| Fichier | Contient | Utilisé par |
|---|---|---|
| `~/.purplemux/port` | Port serveur courant (texte simple) | `bin/cli.js`, `status-hook.sh`, `statusline.sh` |
| `~/.purplemux/cli-token` | Token CLI hex 32 octets | `bin/cli.js`, scripts hook (envoyés en `x-pmux-token`) |

La CLI accepte aussi ces valeurs via env, qui ont précédence :

| Variable | Défaut | Effet |
|---|---|---|
| `PMUX_PORT` | contenu de `~/.purplemux/port` | Port auquel la CLI parle. |
| `PMUX_TOKEN` | contenu de `~/.purplemux/cli-token` | Token bearer envoyé en `x-pmux-token`. |

Voir [Référence CLI](/purplemux/fr/docs/cli-reference/) pour la surface complète.

## Mettre tout ensemble

Quelques combinaisons courantes :

```bash
# Défaut : localhost uniquement, port 8022
purplemux

# Bind partout (LAN + Tailscale + distant)
HOST=all purplemux

# Localhost + Tailscale uniquement
HOST=localhost,tailscale purplemux

# Port personnalisé + tracing verbeux des hooks
PORT=9000 LOG_LEVELS=hooks=debug purplemux

# Le grand jeu pour debug
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux
```

{% call callout('tip') %}
Pour une installation persistante, mettez ces valeurs dans le bloc `Environment=` de votre unité launchd / systemd. Voir [Installation](/purplemux/fr/docs/installation/#deacutemarrage-automatique) pour un exemple d'unité.
{% endcall %}

## Pour aller plus loin

- **[Installation](/purplemux/fr/docs/installation/)** — où ces variables vont d'habitude.
- **[Répertoire de données](/purplemux/fr/docs/data-directory/)** — comment `port` et `cli-token` interagissent avec les scripts hook.
- **[Référence CLI](/purplemux/fr/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` en contexte.
