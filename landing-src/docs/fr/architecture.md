---
title: Architecture
description: Comment le navigateur, le serveur Node.js, tmux et la CLI Claude s'emboîtent.
eyebrow: Référence
permalink: /fr/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux est constitué de trois couches cousues ensemble : un front-end navigateur, un serveur Node.js sur `:8022`, et tmux + la CLI Claude sur l'hôte. Tout entre eux est soit un WebSocket binaire, soit un petit POST HTTP.

## Les trois couches

```
Browser                         Node.js server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

Chaque WebSocket a un seul rôle ; ils ne sont pas multiplexés. L'authentification est un cookie JWT NextAuth vérifié pendant l'upgrade WS.

## Navigateur

Le front-end est une app Next.js (Pages Router). Les pièces qui parlent au serveur :

| Composant | Lib | Rôle |
|---|---|---|
| Volet terminal | `xterm.js` | Rend les octets de `/api/terminal`. Émet frappes, événements de redimensionnement, changements de titre (`onTitleChange`). |
| Timeline de session | React + `useTimeline` | Rend les tours Claude depuis `/api/timeline`. Pas de dérivation `cliState` — c'est tout côté serveur. |
| Indicateurs de statut | Zustand `useTabStore` | Badges d'onglets, points de barre latérale, compteurs de notifications pilotés par les messages `/api/status`. |
| Sync multi-appareils | `useSyncClient` | Surveille les éditions d'espace / mise en page faites sur un autre appareil via `/api/sync`. |

Les titres d'onglets et le processus au premier plan viennent de l'événement `onTitleChange` de xterm.js — tmux est configuré (`src/config/tmux.conf`) pour émettre `#{pane_current_command}|#{pane_current_path}` toutes les deux secondes, et `lib/tab-title.ts` le parse.

## Serveur Node.js

`server.ts` est un serveur HTTP custom qui héberge Next.js plus quatre instances `WebSocketServer` `ws` sur le même port.

### Endpoints WebSocket

| Chemin | Handler | Direction | Utilisation |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | bidirectionnel, binaire | E/S terminal via `node-pty` rattaché à une session tmux |
| `/api/timeline` | `timeline-server.ts` | serveur → client | Stream des entrées de session Claude parsées depuis JSONL |
| `/api/status` | `status-server.ts` | bidirectionnel, JSON | `status:sync` / `status:update` / `status:hook-event` du serveur, `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` du client |
| `/api/sync` | `sync-server.ts` | bidirectionnel, JSON | État d'espace de travail cross-appareil |

Plus `/api/install` pour l'installeur de premier lancement (pas d'auth requise).

### Protocole binaire terminal

`/api/terminal` utilise un petit protocole binaire défini dans `src/lib/terminal-protocol.ts` :

| Code | Nom | Direction | Payload |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | client → serveur | Octets de touches |
| `0x01` | `MSG_STDOUT` | serveur → client | Sortie terminal |
| `0x02` | `MSG_RESIZE` | client → serveur | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | les deux | intervalle 30 s, timeout 90 s |
| `0x04` | `MSG_KILL_SESSION` | client → serveur | Termine la session tmux sous-jacente |
| `0x05` | `MSG_WEB_STDIN` | client → serveur | Texte de barre de saisie web (livré après sortie copy-mode) |

Backpressure : `pty.pause` quand WS `bufferedAmount > 1 Mo`, reprise sous `256 Ko`. Au plus 32 connexions concurrentes par serveur, la plus ancienne est larguée au-delà.

### Status manager

`src/lib/status-manager.ts` est la source unique de vérité pour `cliState`. Les événements de hook arrivent via `/api/status/hook` (POST authentifié par token), sont séquencés (`eventSeq` par onglet), et sont réduits en `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` par `deriveStateFromEvent`. Le watcher JSONL ne met à jour que les métadonnées sauf pour un événement `interrupt` synthétique.

Pour la machine d'état complète voir [Statut de session (STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md).

## Couche tmux

purplemux fait tourner un tmux isolé sur un socket dédié — `-L purple` — avec sa propre config dans `src/config/tmux.conf`. Votre `~/.tmux.conf` n'est jamais lu.

Les sessions sont nommées `pt-{workspaceId}-{paneId}-{tabId}`. Un volet terminal dans le navigateur correspond à une session tmux, rattachée via `node-pty`.

```
tmux socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← onglet navigateur 1
├── pt-ws-MMKl07-pa-1-tb-2   ← onglet navigateur 2
└── pt-ws-MMKl07-pa-2-tb-1   ← volet divisé, onglet 1
```

`prefix` est désactivé, la barre de status est off (xterm.js dessine le chrome), `set-titles` est on, et `mouse on` met la molette en copy-mode. tmux est la raison pour laquelle les sessions survivent à un navigateur fermé, une coupure Wi-Fi ou un redémarrage du serveur.

Pour la config tmux complète, le wrapper de commandes et les détails de détection de processus, voir [tmux & détection de processus (TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md).

## Intégration de la CLI Claude

purplemux ne fork ni n'enveloppe Claude — le binaire `claude` est juste celui que vous avez installé. Deux choses sont ajoutées :

1. **Réglages de hook** — Au démarrage, `ensureHookSettings()` écrit `~/.purplemux/hooks.json`, `status-hook.sh` et `statusline.sh`. Chaque onglet Claude se lance avec `--settings ~/.purplemux/hooks.json`, donc `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `PreCompact`, `PostCompact` font tous un POST de retour vers le serveur.
2. **Lectures JSONL** — `~/.claude/projects/**/*.jsonl` est parsé par `timeline-server.ts` pour la vue de conversation en direct, et surveillé par `session-detection.ts` pour détecter un processus Claude en cours via les fichiers PID dans `~/.claude/sessions/`.

Les scripts hook lisent `~/.purplemux/port` et `~/.purplemux/cli-token` et POST avec `x-pmux-token`. Ils échouent silencieusement si le serveur est down, donc fermer purplemux pendant que Claude tourne ne crashe rien.

## Séquence de démarrage

`server.ts:start()` exécute ces étapes dans l'ordre :

1. `acquireLock(port)` — garde-instance unique via `~/.purplemux/pmux.lock`
2. `initConfigStore()` + `initShellPath()` (résout le `PATH` du shell de login utilisateur)
3. `initAuthCredentials()` — charge le mot de passe haché en scrypt et le secret HMAC dans l'env
4. `scanSessions()` + `applyConfig()` — nettoie les sessions tmux mortes, applique `tmux.conf`
5. `initWorkspaceStore()` — charge `workspaces.json` et les `layout.json` par espace
6. `autoResumeOnStartup()` — relance les shells dans les répertoires sauvegardés, tente une reprise Claude
7. `getStatusManager().init()` — démarre le polling de métadonnées
8. `app.prepare()` (Next.js dev) ou `require('.next/standalone/server.js')` (prod)
9. `listenWithFallback()` sur `bindPlan.host:port` (`0.0.0.0` ou `127.0.0.1` selon politique d'accès)
10. `ensureHookSettings(result.port)` — écrit ou rafraîchit les scripts hook avec le port réel
11. `getCliToken()` — lit ou génère `~/.purplemux/cli-token`
12. `writeAllClaudePromptFiles()` — rafraîchit le `claude-prompt.md` de chaque espace

La fenêtre entre la résolution du port et l'étape 10 est la raison pour laquelle les scripts hook sont régénérés à chaque démarrage : ils ont besoin du port réel inséré.

## Serveur custom vs. graphe de modules Next.js

{% call callout('warning', 'Deux graphes de modules dans un seul processus') %}
Le serveur custom externe (`server.ts`) et Next.js (pages + routes API) partagent un processus Node mais **pas** leurs graphes de modules. Tout ce qui est sous `src/lib/*` importé des deux côtés est instancié deux fois. Les singletons qui doivent être partagés (le StatusManager, les ensembles de clients WebSocket, le token CLI, les locks d'écriture de fichiers) accrochent sous des clés `globalThis.__pt*`. Voir `CLAUDE.md §18` pour la justification complète.
{% endcall %}

## Pour lire plus

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — config tmux, wrapper de commandes, parcours d'arbre de processus, protocole binaire terminal.
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — machine d'état CLI Claude, flux des hooks, événement interrupt synthétique, watcher JSONL.
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — chaque fichier que purplemux écrit.

## Pour aller plus loin

- **[Répertoire de données](/purplemux/fr/docs/data-directory/)** — chaque fichier que l'architecture ci-dessus touche.
- **[Référence CLI](/purplemux/fr/docs/cli-reference/)** — parler au serveur depuis l'extérieur du navigateur.
- **[Dépannage](/purplemux/fr/docs/troubleshooting/)** — diagnostic quand quelque chose ici dérape.
