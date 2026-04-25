---
title: Accès Tailscale
description: Atteignez purplemux depuis votre téléphone en HTTPS via Tailscale Serve — pas de redirection de port, pas de jonglage avec les certificats.
eyebrow: Mobile & distant
permalink: /fr/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

Par défaut, purplemux écoute uniquement en local. Tailscale Serve est le moyen le plus propre de l'exposer à vos autres appareils : chiffrement WireGuard, certificats Let's Encrypt automatiques, zéro changement de pare-feu.

## Pourquoi Tailscale

- **WireGuard** — chaque connexion est chiffrée d'appareil à appareil.
- **HTTPS automatique** — Tailscale provisionne un vrai cert pour `*.<tailnet>.ts.net`.
- **Pas de redirection de port** — votre machine n'ouvre jamais de port sur l'internet public.
- **HTTPS obligatoire pour iOS** — installation PWA et Web Push refusent de marcher sans. Voir [Configuration PWA](/purplemux/fr/docs/pwa-setup/) et [Web Push](/purplemux/fr/docs/web-push/).

## Prérequis

- Un compte Tailscale, avec le démon `tailscale` installé et signé sur la machine qui fait tourner purplemux.
- HTTPS activé sur le tailnet (Console admin → DNS → activer HTTPS Certificates, si ce n'est pas déjà fait).
- purplemux qui tourne sur le port par défaut `8022` (ou là où vous avez réglé `PORT`).

## Lancement

Une ligne :

```bash
tailscale serve --bg 8022
```

Tailscale enveloppe votre `http://localhost:8022` local en HTTPS et l'expose à l'intérieur du tailnet à :

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` est le hostname de la box ; `<tailnet>` est le suffixe MagicDNS de votre tailnet. Ouvrez cette URL sur n'importe quel autre appareil signé sur le même tailnet et vous y êtes.

Pour arrêter de servir :

```bash
tailscale serve --bg off 8022
```

## Ce que vous pouvez faire une fois que ça marche

- Ouvrez l'URL sur votre téléphone, touchez **Partager → Sur l'écran d'accueil**, et suivez [Configuration PWA](/purplemux/fr/docs/pwa-setup/).
- Activez la push depuis la PWA standalone : [Web Push](/purplemux/fr/docs/web-push/).
- Atteignez le même tableau de bord depuis une tablette, un laptop ou un autre desktop — l'état d'espace de travail se synchronise en temps réel.

{% call callout('tip', 'Funnel vs Serve') %}
`tailscale serve` garde purplemux privé à votre tailnet — c'est presque toujours ce que vous voulez. `tailscale funnel` l'exposerait à l'internet public, ce qui est exagéré (et risqué) pour un multiplexeur perso.
{% endcall %}

## Repli reverse-proxy

Si Tailscale n'est pas une option, n'importe quel reverse proxy avec un vrai certificat TLS fait l'affaire. La seule chose à bien gérer ce sont les **upgrades WebSocket** — purplemux les utilise pour l'E/S terminal, la sync de statut et la timeline en direct.

Nginx (esquisse) :

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy est plus simple — `reverse_proxy 127.0.0.1:8022` gère les en-têtes upgrade automatiquement.

Sans transmission de `Upgrade` / `Connection`, le tableau de bord s'affiche, mais les terminaux ne se connectent jamais et le statut reste figé. Si quelque chose semble fonctionner à moitié, soupçonnez d'abord ces en-têtes.

## Dépannage

- **HTTPS pas encore provisionné** — le premier cert peut prendre une minute. Relancer `tailscale serve --bg 8022` après une courte attente règle généralement la chose.
- **Le navigateur prévient pour le cert** — vérifiez que vous tapez exactement l'URL `<machine>.<tailnet>.ts.net`, pas l'IP du LAN.
- **Le mobile dit « inaccessible »** — confirmez que le téléphone est signé sur le même tailnet et que Tailscale est actif dans les paramètres OS.
- **Certs auto-signés** — Web Push ne s'enregistre pas. Utilisez Tailscale Serve ou un vrai cert ACME via votre reverse proxy.

## Pour aller plus loin

- **[Configuration PWA](/purplemux/fr/docs/pwa-setup/)** — installer sur l'écran d'accueil maintenant que vous avez HTTPS.
- **[Notifications Web Push](/purplemux/fr/docs/web-push/)** — activer les alertes en arrière-plan.
- **[Sécurité & auth](/purplemux/fr/docs/security-auth/)** — mot de passe, hachage et ce qu'implique l'exposition tailnet.
