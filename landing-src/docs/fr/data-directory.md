---
title: Répertoire de données
description: Ce qui vit sous ~/.purplemux/, ce qui est sûr à supprimer et comment le sauvegarder.
eyebrow: Référence
permalink: /fr/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

Chaque morceau d'état persistant que purplemux garde — paramètres, mises en page, historique de sessions, caches — vit sous `~/.purplemux/`. Rien d'autre. Pas de `localStorage`, pas de keychain système, pas de service externe.

## Vue d'ensemble

```
~/.purplemux/
├── config.json              # config app (auth, thème, locale, …)
├── workspaces.json          # liste d'espaces + état barre latérale
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # arbre volets/onglets
│       ├── message-history.json  # historique de saisie par espace
│       └── claude-prompt.md      # contenu --append-system-prompt-file
├── hooks.json               # config hook + statusline Claude Code (généré)
├── status-hook.sh           # script hook (généré, 0755)
├── statusline.sh            # script statusline (généré, 0755)
├── rate-limits.json         # dernier JSON de statusline
├── session-history.json     # log de sessions Claude terminées (cross-workspace)
├── quick-prompts.json       # prompts rapides personnalisés + intégrés désactivés
├── sidebar-items.json       # éléments de barre latérale personnalisés + intégrés désactivés
├── vapid-keys.json          # paire de clés VAPID Web Push (générée)
├── push-subscriptions.json  # souscriptions endpoint Web Push
├── cli-token                # token d'auth CLI (généré)
├── port                     # port serveur courant
├── pmux.lock                # lock instance unique {pid, port, startedAt}
├── logs/                    # fichiers de log pino-roll
├── uploads/                 # images attachées via la barre de chat
└── stats/                   # cache de statistiques d'usage Claude
```

Les fichiers contenant des secrets (config, tokens, mises en page, clés VAPID, lock) sont écrits en mode `0600` via un schéma `tmpFile → rename`.

## Fichiers de niveau racine

| Fichier | Ce qu'il stocke | Sûr à supprimer ? |
|---|---|---|
| `config.json` | mot de passe haché en scrypt, secret de session HMAC, thème, locale, taille de police, toggle notifications, URL d'éditeur, accès réseau, CSS personnalisé | Oui — relance l'onboarding |
| `workspaces.json` | Index d'espaces, largeur / état replié de la barre latérale, ID d'espace actif | Oui — efface tous les espaces et onglets |
| `hooks.json` | Mapping `--settings` Claude Code (event → script) + `statusLine.command` | Oui — régénéré au prochain démarrage |
| `status-hook.sh`, `statusline.sh` | POST vers `/api/status/hook` et `/api/status/statusline` avec `x-pmux-token` | Oui — régénérés au prochain démarrage |
| `rate-limits.json` | Dernier JSON de statusline Claude : `ts`, `model`, `five_hour`, `seven_day`, `context`, `cost` | Oui — repeuplé pendant que Claude tourne |
| `session-history.json` | Dernières 200 sessions Claude terminées (prompts, résultats, durées, outils, fichiers) | Oui — efface l'historique |
| `quick-prompts.json`, `sidebar-items.json` | `{ custom: […], disabledBuiltinIds: […], order: […] }` overlays sur les listes intégrées | Oui — restaure les défauts |
| `vapid-keys.json` | Paire de clés VAPID Web Push, générée au premier lancement | Pas sauf si vous supprimez aussi `push-subscriptions.json` (les souscriptions existantes cassent) |
| `push-subscriptions.json` | Endpoints push par navigateur | Oui — réabonner sur chaque appareil |
| `cli-token` | Token hex 32 octets pour la CLI `purplemux` et les scripts hook (en-tête `x-pmux-token`) | Oui — régénéré au prochain démarrage, mais tout script hook déjà généré garde l'ancien token jusqu'à ce que le serveur l'écrase |
| `port` | Port courant en clair, lu par les scripts hook et la CLI | Oui — régénéré au prochain démarrage |
| `pmux.lock` | Garde-instance unique `{ pid, port, startedAt }` | Seulement si aucun processus purplemux n'est vivant |

{% call callout('warning', 'Pièges du fichier de lock') %}
Si purplemux refuse de démarrer avec « already running » mais qu'aucun processus n'est vivant, `pmux.lock` est obsolète. `rm ~/.purplemux/pmux.lock` et réessayez. Si vous avez déjà lancé purplemux avec `sudo`, le fichier de lock peut appartenir à root — `sudo rm` une fois.
{% endcall %}

## Répertoire par espace (`workspaces/{wsId}/`)

Chaque espace a son propre dossier, nommé d'après l'ID d'espace généré.

| Fichier | Contenu |
|---|---|
| `layout.json` | Arbre récursif volet/onglet : nœuds feuille `pane` avec `tabs[]`, nœuds `split` avec `children[]` et un `ratio`. Chaque onglet porte son nom de session tmux (`pt-{wsId}-{paneId}-{tabId}`), un `cliState` en cache, un `claudeSessionId`, la dernière commande de reprise. |
| `message-history.json` | Historique de saisie Claude par espace. Plafonné à 500 entrées. |
| `claude-prompt.md` | Le contenu `--append-system-prompt-file` passé à chaque onglet Claude dans cet espace. Régénéré à création / renommage / changement de répertoire d'espace. |

Supprimez un seul `workspaces/{wsId}/layout.json` pour réinitialiser la mise en page de cet espace à un volet par défaut sans toucher aux autres.

## `logs/`

Sortie pino-roll, un fichier par jour UTC, avec un suffixe numérique quand les limites de taille sont dépassées :

```
logs/purplemux.2026-04-19.1.log
```

Niveau par défaut `info`. Surcharge avec `LOG_LEVEL` ou par module avec `LOG_LEVELS` — voir [Ports & variables d'environnement](/purplemux/fr/docs/ports-env-vars/).

Les logs tournent chaque semaine (limite de 7 fichiers). Sûrs à supprimer à tout moment.

## `uploads/`

Images attachées via la barre de chat (glisser, coller, trombone) :

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- Autorisés : `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Max 10 Mo par fichier, mode `0600`
- Auto-nettoyé au démarrage du serveur : tout ce qui dépasse 24 heures est retiré
- Nettoyage manuel dans **Paramètres → Système → Images attachées → Nettoyer maintenant**

## `stats/`

Cache pur. Dérivé de `~/.claude/projects/**/*.jsonl` — purplemux ne lit que ce répertoire.

| Fichier | Contenu |
|---|---|
| `cache.json` | Agrégats par jour : messages, sessions, appels d'outils, comptes horaires, usage de tokens par modèle |
| `uptime-cache.json` | Roll-up uptime / minutes actives par jour |
| `daily-reports/{YYYY-MM-DD}.json` | Brief quotidien généré par IA |

Supprimez tout le dossier pour forcer un recalcul au prochain appel stats.

## Matrice de réinitialisation

| Pour réinitialiser… | Supprimer |
|---|---|
| Mot de passe de login (re-onboarding) | `config.json` |
| Tous les espaces et onglets | `workspaces.json` + `workspaces/` |
| Mise en page d'un espace | `workspaces/{wsId}/layout.json` |
| Statistiques d'usage | `stats/` |
| Souscriptions push | `push-subscriptions.json` |
| « Already running » coincé | `pmux.lock` (seulement si aucun processus vivant) |
| Tout (factory reset) | `~/.purplemux/` |

`hooks.json`, `status-hook.sh`, `statusline.sh`, `port`, `cli-token` et `vapid-keys.json` sont tous auto-régénérés au prochain démarrage, donc les supprimer est inoffensif.

## Sauvegardes

Tout le répertoire est du JSON simple plus quelques scripts shell. Pour sauvegarder :

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

Pour restaurer sur une machine fraîche, désarchivez et démarrez purplemux. Les scripts hook seront réécrits avec le port du nouveau serveur ; tout le reste (espaces, historique, paramètres) se transfère tel quel.

{% call callout('warning') %}
Ne restaurez pas `pmux.lock` — il est lié à un PID spécifique et bloquera le démarrage. Excluez-le : `--exclude pmux.lock`.
{% endcall %}

## Tout effacer

```bash
rm -rf ~/.purplemux
```

Vérifiez qu'aucun purplemux ne tourne d'abord. Le prochain lancement sera l'expérience de premier lancement à nouveau.

## Pour aller plus loin

- **[Ports & variables d'environnement](/purplemux/fr/docs/ports-env-vars/)** — chaque variable qui influence ce répertoire.
- **[Architecture](/purplemux/fr/docs/architecture/)** — comment les fichiers se connectent au serveur en cours.
- **[Dépannage](/purplemux/fr/docs/troubleshooting/)** — problèmes courants et corrections.
