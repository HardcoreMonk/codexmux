---
title: Dépannage & FAQ
description: Problèmes courants, réponses rapides et questions qui reviennent le plus souvent.
eyebrow: Référence
permalink: /fr/docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

Si quelque chose ici ne correspond pas à ce que vous voyez, [ouvrez une issue](https://github.com/subicura/purplemux/issues) en y joignant votre plateforme, votre navigateur et le fichier de log pertinent depuis `~/.purplemux/logs/`.

## Installation & démarrage

### `tmux: command not found`

purplemux a besoin de tmux 3.0+ sur l'hôte. Installez-le :

```bash
# macOS (Homebrew)
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

Vérifiez avec `tmux -V`. tmux 2.9+ passe techniquement le check de préflight, mais on teste sur 3.0+.

### `node: command not found` ou « Node.js 20 ou plus récent »

Installez Node 20 LTS ou plus récent. Vérifiez avec `node -v`. L'app native macOS embarque son propre Node, donc ça ne s'applique qu'aux chemins `npx` / `npm install -g`.

### « purplemux is already running (pid=…, port=…) »

Une autre instance purplemux est vivante et répond sur `/api/health`. Soit utilisez celle-là (ouvrez l'URL affichée), soit arrêtez-la d'abord :

```bash
# la trouver
ps aux | grep purplemux

# ou la tuer via le fichier de lock
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### Lock obsolète — refuse de démarrer, mais aucun processus ne tourne

`~/.purplemux/pmux.lock` est resté. Retirez-le :

```bash
rm ~/.purplemux/pmux.lock
```

Si vous avez déjà lancé purplemux avec `sudo`, le fichier peut appartenir à root — `sudo rm` une fois.

### `Port 8022 is in use, finding an available port...`

Un autre processus possède `8022`. Le serveur retombe sur un port libre aléatoire et affiche la nouvelle URL. Pour choisir le port vous-même :

```bash
PORT=9000 purplemux
```

Trouvez ce qui tient `8022` avec `lsof -iTCP:8022 -sTCP:LISTEN -n -P`.

### Ça marche sur Windows ?

**Pas officiellement.** purplemux dépend de `node-pty` et de tmux, qui ne tournent pas nativement sur Windows. WSL2 marche en général (vous êtes effectivement sur Linux à ce moment-là) mais c'est hors de notre matrice de tests.

## Sessions & restauration

### Fermer le navigateur a tout tué

Ça ne devrait pas — tmux tient chaque shell ouvert sur le serveur. Si un rafraîchissement ne ramène pas les onglets :

1. Vérifiez que le serveur tourne toujours (`http://localhost:8022/api/health`).
2. Vérifiez que les sessions tmux existent : `tmux -L purple ls`.
3. Regardez `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log` pour des erreurs pendant `autoResumeOnStartup`.

Si tmux dit « no server running », l'hôte a redémarré ou quelque chose a tué tmux. Les sessions sont parties, mais la mise en page (espaces, onglets, répertoires de travail) est préservée dans `~/.purplemux/workspaces/{wsId}/layout.json` et est relancée au prochain démarrage purplemux.

### Une session Claude ne reprend pas

`autoResumeOnStartup` réexécute le `claude --resume <uuid>` sauvegardé pour chaque onglet, mais si le `~/.claude/projects/.../sessionId.jsonl` correspondant n'existe plus (supprimé, archivé ou projet déplacé), la reprise échoue. Ouvrez l'onglet et démarrez une nouvelle conversation.

### Mes onglets affichent tous « unknown »

`unknown` signifie qu'un onglet était `busy` avant un redémarrage du serveur et que la récupération est en cours. `resolveUnknown` tourne en arrière-plan et confirme `idle` (Claude a quitté) ou `ready-for-review` (message assistant final présent). Si un onglet reste coincé en `unknown` plus de dix minutes, le **filet de sécurité busy stuck** le bascule silencieusement en `idle`. Voir [STATUS.md](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) pour la machine d'état complète.

## Navigateur & UI

### Les notifications Web Push ne se déclenchent jamais

Parcourez cette checklist :

1. **iOS Safari ≥ 16.4 uniquement.** iOS plus ancien n'a pas Web Push du tout.
2. **Doit être une PWA sur iOS.** Touchez **Partager → Sur l'écran d'accueil** d'abord ; la push ne se déclenche pas depuis un onglet Safari classique.
3. **HTTPS requis.** Les certs auto-signés ne marchent pas — Web Push refuse silencieusement de s'enregistrer. Utilisez Tailscale Serve (Let's Encrypt gratuit) ou un vrai domaine derrière Nginx / Caddy.
4. **Permission de notification accordée.** **Paramètres → Notification → On** dans purplemux *et* la permission au niveau navigateur doivent toutes deux être autorisées.
5. **Souscriptions présentes.** `~/.purplemux/push-subscriptions.json` doit avoir une entrée pour l'appareil. Si vide, ré-accordez la permission.

Voir [Compatibilité navigateur](/purplemux/fr/docs/browser-support/) pour la matrice de compatibilité complète.

### iOS Safari 16.4+ mais toujours pas de notifications

Certaines versions iOS perdent la souscription après une longue période PWA fermée. Ouvrez la PWA, refusez puis ré-accordez la permission de notification, et revérifiez `push-subscriptions.json`.

### La fenêtre privée Safari ne persiste rien

IndexedDB est désactivé dans les fenêtres privées Safari 17+, donc le cache d'espace ne survit pas à un redémarrage. Utilisez une fenêtre normale.

### Le terminal mobile disparaît après mise en arrière-plan

iOS Safari démolit le WebSocket après environ 30 s en arrière-plan. tmux maintient la session réelle en vie — quand vous revenez à l'onglet, purplemux se reconnecte et redessine. C'est iOS, pas nous.

### Firefox + Tailscale serve = avertissement de certificat

Si votre tailnet utilise un domaine personnalisé qui n'est pas `*.ts.net`, Firefox est plus exigeant que Chrome sur la confiance HTTPS. Acceptez le certificat une fois et c'est réglé.

### « Navigateur trop ancien » ou fonctionnalités manquantes

Lancez **Paramètres → Vérification du navigateur** pour un rapport API par API. Tout en dessous des minimums dans [Compatibilité navigateur](/purplemux/fr/docs/browser-support/) perd les fonctionnalités gracieusement mais n'est pas pris en charge.

## Réseau & accès distant

### Puis-je exposer purplemux à internet ?

Vous pouvez, mais toujours en HTTPS. Recommandé :

1. **Tailscale Serve** — `tailscale serve --bg 8022` donne chiffrement WireGuard + certificats automatiques. Pas de redirection de port nécessaire.
2. **Reverse proxy** — Nginx / Caddy / Traefik. Vérifiez bien de transmettre les en-têtes `Upgrade` et `Connection`, sinon les WebSockets cassent.

HTTP simple sur l'internet ouvert est une mauvaise idée — le cookie d'auth est signé HMAC mais les payloads WebSocket (octets de terminal !) ne sont pas chiffrés.

### Les autres appareils de mon LAN ne peuvent pas atteindre purplemux

Par défaut, purplemux n'autorise que localhost. Ouvrez l'accès via env ou paramètres in-app :

```bash
HOST=lan,localhost purplemux       # LAN-friendly
HOST=tailscale,localhost purplemux # tailnet-friendly
HOST=all purplemux                 # tout
```

Ou **Paramètres → Accès réseau** dans l'app, qui écrit dans `~/.purplemux/config.json`. (Quand `HOST` est défini par env, ce champ est verrouillé.) Voir [Ports & variables d'environnement](/purplemux/fr/docs/ports-env-vars/) pour la syntaxe mots-clés et CIDR.

### Problèmes WebSocket reverse-proxy

Si `/api/terminal` se connecte puis se coupe immédiatement, le proxy supprime les en-têtes `Upgrade` / `Connection`. Nginx minimal :

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy : la transmission WebSocket est par défaut ; juste `reverse_proxy 127.0.0.1:8022`.

## Données & stockage

### Où sont mes données ?

Tout est local sous `~/.purplemux/`. Rien ne quitte votre machine. Le mot de passe de login est un hash scrypt dans `config.json`. Voir [Répertoire de données](/purplemux/fr/docs/data-directory/) pour la disposition complète.

### J'ai oublié mon mot de passe

Supprimez `~/.purplemux/config.json` et redémarrez. L'onboarding repart. Espaces, mises en page et historique sont conservés (ce sont des fichiers séparés).

### Indicateur d'onglet coincé sur « busy » à jamais

Le `busy stuck safety net` bascule un onglet silencieusement à `idle` après dix minutes si le processus Claude est mort. Si vous préférez ne pas attendre, fermez et rouvrez l'onglet — ça réinitialise l'état local et le prochain événement de hook reprend depuis un état propre. Pour investigation, lancez avec `LOG_LEVELS=hooks=debug,status=debug`.

### Ça entre en conflit avec ma config tmux existante ?

Non. purplemux fait tourner un tmux isolé sur un socket dédié (`-L purple`) avec sa propre config (`src/config/tmux.conf`). Votre `~/.tmux.conf` et toutes vos sessions tmux existantes ne sont pas touchés.

## Coût & usage

### Est-ce que purplemux me fait économiser de l'argent ?

Pas directement. Ce qu'il fait, c'est **rendre l'usage transparent** : coût aujourd'hui / mois / par projet, ventilations de tokens par modèle et décomptes de limites de débit 5 h / 7 j sont tous sur un seul écran pour que vous puissiez vous cadencer avant de heurter un mur.

### purplemux lui-même est payant ?

Non. purplemux est open source sous licence MIT. L'usage de Claude Code est facturé séparément par Anthropic.

### Mes données sont-elles envoyées quelque part ?

Non. purplemux est entièrement auto-hébergé. Les seuls appels réseau qu'il fait sont à votre CLI Claude locale (qui parle à Anthropic de son côté) et la vérification de version via `update-notifier` au lancement. Désactivez la vérification de version avec `NO_UPDATE_NOTIFIER=1`.

## Pour aller plus loin

- **[Compatibilité navigateur](/purplemux/fr/docs/browser-support/)** — matrice de compatibilité détaillée et particularités navigateur connues.
- **[Répertoire de données](/purplemux/fr/docs/data-directory/)** — ce que fait chaque fichier et ce qui est sûr à supprimer.
- **[Architecture](/purplemux/fr/docs/architecture/)** — comment les pièces s'emboîtent quand quelque chose demande à creuser plus profond.
