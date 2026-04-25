---
title: Notifications Web Push
description: Alertes push en arrière-plan pour les états saisie-requise et tâche-terminée, même quand l'onglet du navigateur est fermé.
eyebrow: Mobile & distant
permalink: /fr/docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

Web Push permet à purplemux de vous prévenir quand une session Claude a besoin de votre attention — une invite de permission, une tâche finie — même après que vous avez fermé l'onglet. Touchez la notification et vous arrivez directement sur cette session.

## Ce qui déclenche une notification

purplemux envoie une push pour les mêmes transitions que les badges colorés de la barre latérale.

- **Saisie requise** — Claude a heurté une invite de permission ou posé une question.
- **Tâche terminée** — Claude a fini un tour (l'état **review**).

Les transitions inactif et occupé ne sont volontairement pas pushées. C'est du bruit.

## L'activer

Le toggle est dans **Paramètres → Notification**. Étapes :

1. Ouvrez **Paramètres → Notification** et passez sur **On**.
2. Le navigateur demande la permission de notifications — accordez-la.
3. purplemux enregistre une souscription Web Push contre les clés VAPID du serveur.

La souscription est stockée dans `~/.purplemux/push-subscriptions.json` et identifie votre navigateur/appareil spécifique. Répétez les étapes sur chaque appareil sur lequel vous voulez être notifié.

{% call callout('warning', 'iOS demande Safari 16.4 + une PWA') %}
Sur iPhone et iPad, Web Push ne marche qu'après avoir ajouté purplemux à l'écran d'accueil et l'avoir lancé depuis cette icône. Ouvrez la page Paramètres depuis la fenêtre PWA standalone — l'invite de permission de notification sera un no-op dans un onglet Safari classique. Mettez d'abord la PWA en place : [Configuration PWA](/purplemux/fr/docs/pwa-setup/).
{% endcall %}

## Clés VAPID

purplemux génère une paire de clés VAPID application-server au premier lancement et la stocke dans `~/.purplemux/vapid-keys.json` (mode `0600`). Vous n'avez rien à faire — la clé publique est servie au navigateur automatiquement quand vous vous abonnez.

Si vous voulez réinitialiser toutes les souscriptions (par exemple après rotation des clés), supprimez `vapid-keys.json` et `push-subscriptions.json` et redémarrez purplemux. Chaque appareil devra se réabonner.

## Livraison en arrière-plan

Une fois abonné, votre téléphone reçoit la notification via le service push de l'OS :

- **iOS** — APNs, via le pont Web Push de Safari. La livraison est best-effort et peut être coalescée si votre téléphone est sévèrement throttled.
- **Android** — FCM via Chrome. Généralement instantané.

La notification arrive que purplemux soit au premier plan ou non. Si le tableau de bord est actuellement visible sur _l'un_ de vos appareils, purplemux saute la push pour éviter le double buzz.

## Toucher pour entrer

Toucher une notification ouvre purplemux directement sur la session qui l'a déclenchée. Si la PWA tourne déjà, le focus passe au bon onglet ; sinon l'app se lance et navigue droit dessus.

## Dépannage

- **Toggle grisé** — Service Workers ou Notifications API non pris en charge. Lancez **Paramètres → Vérification du navigateur**, ou voir [Compatibilité navigateur](/purplemux/fr/docs/browser-support/).
- **Permission refusée** — effacez la permission de notification du site dans les paramètres de votre navigateur, puis re-toggle dans purplemux.
- **Pas de push sur iOS** — vérifiez que vous lancez depuis l'icône d'écran d'accueil, pas Safari. Vérifiez qu'iOS est en **16.4 ou plus récent**.
- **Cert auto-signé** — Web Push refuse de s'enregistrer. Utilisez Tailscale Serve ou un reverse proxy avec un vrai certificat. Voir [Accès Tailscale](/purplemux/fr/docs/tailscale/).

## Pour aller plus loin

- **[Configuration PWA](/purplemux/fr/docs/pwa-setup/)** — requise pour la push iOS.
- **[Accès Tailscale](/purplemux/fr/docs/tailscale/)** — HTTPS pour livraison externe.
- **[Sécurité & auth](/purplemux/fr/docs/security-auth/)** — ce qui vit aussi sous `~/.purplemux/`.
