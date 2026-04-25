---
title: Panneau navigateur web
description: Un onglet navigateur intégré pour tester la sortie de dev, pilotable depuis la CLI purplemux, avec un émulateur de terminal pour les viewports mobiles.
eyebrow: Espaces de travail & terminal
permalink: /fr/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

Posez un onglet navigateur web à côté de votre terminal et de votre session Claude. Il fait tourner votre serveur de dev local, le site de staging, n'importe quoi d'accessible — et vous pouvez le piloter depuis la CLI `purplemux` sans quitter le shell.

## Ouvrir un onglet navigateur

Ajoutez un nouvel onglet et choisissez **Navigateur web** comme type de panneau. Tapez une URL dans la barre d'adresse — `localhost:3000`, une IP, ou une URL https complète. La barre d'adresse normalise l'entrée : les noms d'hôtes nus et les IP partent en `http://`, le reste en `https://`.

Le panneau tourne comme une vraie webview Chromium quand purplemux est l'application native macOS (build Electron), et retombe sur une iframe quand il est accédé depuis un navigateur classique. Le chemin iframe couvre la plupart des pages mais ne peut pas faire tourner les sites qui envoient `X-Frame-Options: deny` ; le chemin Electron n'a pas cette limite.

{% call callout('note', 'Idéal dans l\'app native') %}
L'émulation d'appareils, les captures d'écran CLI et la capture console / réseau ne fonctionnent que dans le build Electron. Le repli onglet-navigateur vous donne barre d'adresse, retour / suivant et rechargement, mais les intégrations plus profondes ont besoin d'une webview.
{% endcall %}

## Navigation pilotée par CLI

Le panneau expose une petite API HTTP que la CLI `purplemux` embarquée encapsule. Depuis n'importe quel terminal — y compris celui qui se trouve à côté du panneau navigateur — vous pouvez :

```bash
# lister les onglets et trouver l'ID d'un onglet web-browser
purplemux tab list -w <workspace-id>

# lire l'URL et le titre courants
purplemux tab browser url -w <ws> <tabId>

# capturer une copie d'écran dans un fichier (ou pleine page avec --full)
purplemux tab browser screenshot -w <ws> <tabId> -o shot.png --full

# suivre les logs console récents (ring buffer de 500 entrées)
purplemux tab browser console -w <ws> <tabId> --since 60000 --level error

# inspecter l'activité réseau, en récupérant éventuellement le corps d'une réponse
purplemux tab browser network -w <ws> <tabId> --method POST --status 500
purplemux tab browser network -w <ws> <tabId> --request <id>

# évaluer du JavaScript dans l'onglet et obtenir le résultat sérialisé
purplemux tab browser eval -w <ws> <tabId> "document.title"
```

La CLI s'authentifie via un token dans `~/.purplemux/cli-token` et lit le port depuis `~/.purplemux/port`. Aucun flag n'est nécessaire quand vous tournez sur la même machine. Lancez `purplemux help` pour voir toutes les commandes ou `purplemux api-guide` pour les endpoints HTTP sous-jacents.

C'est ce qui rend le panneau utile pour Claude : demandez à Claude de prendre une copie d'écran, de vérifier la console pour l'erreur, ou de lancer un script de sonde — et Claude a la même CLI que vous.

## Émulateur d'appareils

Pour le travail mobile, basculez le panneau en mode mobile. Un sélecteur d'appareils propose des préréglages pour iPhone SE jusqu'au 14 Pro Max, Pixel 7, Galaxy S20 Ultra, iPad Mini et iPad Pro 12.9". Chaque préréglage inclut :

- Largeur / hauteur
- Device pixel ratio
- Un user agent mobile correspondant

Basculez portrait / paysage, et choisissez un niveau de zoom (`fit` pour ajuster au panneau, ou fixe `50% / 75% / 100% / 125% / 150%`). Quand vous changez d'appareil, la webview se recharge avec le nouveau UA pour que la détection mobile côté serveur voie ce que verrait votre téléphone.

## Pour aller plus loin

- **[Onglets & volets](/purplemux/fr/docs/tabs-panes/)** — placer le navigateur dans une division à côté de Claude.
- **[Panneau de workflow Git](/purplemux/fr/docs/git-workflow/)** — l'autre type de panneau dédié.
- **[Installation](/purplemux/fr/docs/installation/)** — l'app native macOS, où vit l'intégration webview complète.
