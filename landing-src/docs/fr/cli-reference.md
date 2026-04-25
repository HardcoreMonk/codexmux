---
title: Référence CLI
description: Chaque sous-commande et flag des binaires purplemux et pmux.
eyebrow: Référence
permalink: /fr/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux` propose deux façons d'utiliser le binaire : comme démarreur de serveur (`purplemux` / `purplemux start`) et comme wrapper d'API HTTP (`purplemux <sous-commande>`) qui parle à un serveur en cours d'exécution. L'alias court `pmux` est identique.

## Deux rôles, un binaire

| Forme | Ce qu'elle fait |
|---|---|
| `purplemux` | Démarre le serveur. Comme `purplemux start`. |
| `purplemux <sous-commande>` | Parle à l'API HTTP CLI d'un serveur en cours. |
| `pmux ...` | Alias pour `purplemux ...`. |

Le dispatcher dans `bin/purplemux.js` décortique le premier argument : les sous-commandes connues routent vers `bin/cli.js`, n'importe quoi d'autre (ou rien) lance le serveur.

## Démarrer le serveur

```bash
purplemux              # défaut
purplemux start        # pareil, explicite
PORT=9000 purplemux    # port personnalisé
HOST=all purplemux     # bind partout
```

Voir [Ports & variables d'environnement](/purplemux/fr/docs/ports-env-vars/) pour la surface env complète.

Le serveur affiche ses URL bindées, le mode et le statut auth :

```
  ⚡ purplemux  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

Si `8022` est déjà pris, le serveur prévient et se bind sur un port libre aléatoire à la place.

## Sous-commandes

Toutes les sous-commandes demandent un serveur en cours. Elles lisent le port depuis `~/.purplemux/port` et le token d'auth depuis `~/.purplemux/cli-token`, tous deux écrits automatiquement au démarrage du serveur.

| Commande | Rôle |
|---|---|
| `purplemux workspaces` | Liste les espaces de travail |
| `purplemux tab list [-w WS]` | Liste les onglets (optionnellement scopés à un espace) |
| `purplemux tab create -w WS [-n NAME] [-t TYPE]` | Crée un nouvel onglet |
| `purplemux tab send -w WS TAB_ID CONTENT...` | Envoie une saisie à un onglet |
| `purplemux tab status -w WS TAB_ID` | Inspecte le statut d'un onglet |
| `purplemux tab result -w WS TAB_ID` | Capture le contenu courant du volet de l'onglet |
| `purplemux tab close -w WS TAB_ID` | Ferme un onglet |
| `purplemux tab browser ...` | Pilote un onglet `web-browser` (Electron uniquement) |
| `purplemux api-guide` | Affiche la référence complète de l'API HTTP |
| `purplemux help` | Affiche l'usage |

La sortie est en JSON sauf indication. `--workspace` et `-w` sont interchangeables.

### Types de panneau `tab create`

Le flag `-t` / `--type` choisit le type de panneau. Valeurs valides :

| Valeur | Panneau |
|---|---|
| `terminal` | Shell simple |
| `claude-code` | Shell avec `claude` déjà en cours |
| `web-browser` | Navigateur intégré (Electron uniquement) |
| `diff` | Panneau Git diff |

Sans `-t`, vous obtenez un terminal simple.

### Sous-commandes `tab browser`

Elles ne fonctionnent que quand le type de panneau de l'onglet est `web-browser`, et uniquement dans l'app Electron macOS — le pont retourne 503 sinon.

| Sous-commande | Ce qu'elle retourne |
|---|---|
| `purplemux tab browser url -w WS TAB_ID` | URL courante + titre de page |
| `purplemux tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG. Avec `-o` sauve sur disque ; sans, retourne du base64. `--full` capture la page entière. |
| `purplemux tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | Entrées console récentes (ring buffer, 500 entrées) |
| `purplemux tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | Entrées réseau récentes ; `--request ID` récupère un corps |
| `purplemux tab browser eval -w WS TAB_ID EXPR` | Évalue une expression JS et sérialise le résultat |

## Exemples

```bash
# Trouver votre espace
purplemux workspaces

# Créer un onglet Claude dans l'espace ws-MMKl07
purplemux tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# Lui envoyer un prompt (TAB_ID vient de `tab list`)
purplemux tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# Surveiller son état
purplemux tab status -w ws-MMKl07 tb-abc

# Snapshot du volet
purplemux tab result -w ws-MMKl07 tb-abc

# Capture pleine page d'un onglet web-browser
purplemux tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## Authentification

Chaque sous-commande envoie `x-pmux-token: $(cat ~/.purplemux/cli-token)` et est vérifiée côté serveur via `timingSafeEqual`. Le fichier `~/.purplemux/cli-token` est généré au premier démarrage du serveur avec `randomBytes(32)` et stocké en mode `0600`.

Si vous devez piloter la CLI depuis un autre shell ou un script qui ne voit pas `~/.purplemux/`, réglez les variables d'env à la place :

| Variable | Défaut | Effet |
|---|---|---|
| `PMUX_PORT` | contenu de `~/.purplemux/port` | Port auquel la CLI parle |
| `PMUX_TOKEN` | contenu de `~/.purplemux/cli-token` | Token bearer envoyé en `x-pmux-token` |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux workspaces
```

{% call callout('warning') %}
Le token CLI accorde un accès complet au serveur. Traitez-le comme un mot de passe. Ne le collez pas dans un chat, ne le commitez pas, ne l'exposez pas comme env var de build. Pour le faire tourner, supprimez `~/.purplemux/cli-token` et redémarrez le serveur.
{% endcall %}

## update-notifier

`purplemux` vérifie npm pour une version plus récente à chaque lancement (via `update-notifier`) et affiche une bannière s'il en existe une. Désactivable avec `NO_UPDATE_NOTIFIER=1` ou n'importe lequel des [opt-out standard `update-notifier`](https://github.com/yeoman/update-notifier#user-settings).

## API HTTP complète

`purplemux api-guide` affiche la référence complète de l'API HTTP pour chaque endpoint `/api/cli/*`, y compris les corps de requête et formes de réponse — utile quand vous voulez piloter purplemux directement depuis `curl` ou un autre runtime.

## Pour aller plus loin

- **[Ports & variables d'environnement](/purplemux/fr/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` dans la surface env plus large.
- **[Architecture](/purplemux/fr/docs/architecture/)** — à quoi la CLI parle vraiment.
- **[Dépannage](/purplemux/fr/docs/troubleshooting/)** — quand la CLI dit « le serveur tourne-t-il ? ».
