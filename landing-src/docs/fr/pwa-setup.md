---
title: Configuration PWA
description: Ajoutez purplemux à votre écran d'accueil sur iOS Safari et Android Chrome pour une expérience plein écran, façon application.
eyebrow: Mobile & distant
permalink: /fr/docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

Installer purplemux comme Progressive Web App transforme l'onglet du navigateur en icône autonome sur votre écran d'accueil, avec mise en page plein écran et écrans de splash propres. Sur iOS, c'est aussi le prérequis pour Web Push.

## Ce que vous gagnez

- **Mise en page plein écran** — pas de chrome navigateur, plus d'espace vertical pour terminal et timeline.
- **Icône d'app** — purplemux se lance depuis l'écran d'accueil comme n'importe quelle app native.
- **Écrans de splash** — purplemux livre des images de splash par appareil pour iPhones, donc la transition de lancement paraît native.
- **Web Push** (iOS uniquement) — les notifications push ne se déclenchent qu'après installation PWA.

Le manifeste est servi à `/api/manifest` et enregistre `display: standalone` avec la marque purplemux et la couleur de thème.

## Avant l'installation

La page doit être joignable en **HTTPS** pour que les PWA marchent. Depuis `localhost` ça marche dans Chrome (exception loopback) mais iOS Safari refuse d'installer en HTTP. Le chemin propre est Tailscale Serve — voir [Accès Tailscale](/purplemux/fr/docs/tailscale/).

{% call callout('warning', 'iOS demande Safari 16.4 ou plus récent') %}
Les versions iOS antérieures peuvent installer la PWA mais ne livreront pas Web Push. Si la push compte pour vous, mettez d'abord iOS à jour. Détail navigateur par navigateur dans [Compatibilité navigateur](/purplemux/fr/docs/browser-support/).
{% endcall %}

## iOS Safari

1. Ouvrez l'URL purplemux dans **Safari** (les autres navigateurs iOS n'exposent pas Sur l'écran d'accueil pour les PWA).
2. Touchez l'icône **Partager** dans la barre du bas.
3. Faites défiler la feuille d'action et choisissez **Sur l'écran d'accueil**.
4. Modifiez le nom si vous voulez, puis touchez **Ajouter** en haut à droite.
5. Lancez purplemux depuis la nouvelle icône d'écran d'accueil — il s'ouvre en plein écran.

Le premier lancement depuis l'icône est le moment où iOS le traite comme une vraie PWA. Toute invite de permission push doit être déclenchée depuis l'intérieur de cette fenêtre standalone, pas depuis un onglet Safari classique.

## Android Chrome

Chrome détecte automatiquement un manifeste installable et propose une bannière. Si vous ne la voyez pas :

1. Ouvrez l'URL purplemux dans **Chrome**.
2. Touchez le menu **⋮** en haut à droite.
3. Choisissez **Installer l'application** (parfois libellé **Sur l'écran d'accueil**).
4. Confirmez. L'icône apparaît sur l'écran d'accueil et dans le tiroir d'apps.

Samsung Internet se comporte pareil — l'invite d'installation apparaît en général automatiquement.

## Vérifier l'installation

Ouvrez purplemux depuis l'icône de l'écran d'accueil. La barre d'adresse du navigateur doit avoir disparu. Si vous voyez encore l'UI navigateur, le manifeste ne s'est pas appliqué — généralement parce que la page est chargée en HTTP simple ou via un proxy inhabituel.

Vous pouvez aussi confirmer dans **Paramètres → Notification** — une fois la PWA installée et Web Push pris en charge, le toggle devient activable.

## Mettre à jour la PWA

Rien à faire. La PWA charge le même `index.html` servi par votre instance purplemux, donc mettre à jour purplemux met à jour l'app installée au prochain lancement.

Pour la retirer, appui long sur l'icône et choisir l'action de désinstallation native de l'OS.

## Pour aller plus loin

- **[Notifications Web Push](/purplemux/fr/docs/web-push/)** — activer les alertes en arrière-plan maintenant que la PWA est installée.
- **[Accès Tailscale](/purplemux/fr/docs/tailscale/)** — obtenir l'URL HTTPS qu'iOS exige.
- **[Compatibilité navigateur](/purplemux/fr/docs/browser-support/)** — matrice de compatibilité complète.
