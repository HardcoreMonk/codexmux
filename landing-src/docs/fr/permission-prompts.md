---
title: Invites de permission
description: Comment purplemux intercepte les boîtes de dialogue « puis-je exécuter ceci ? » de Claude Code et vous laisse approuver depuis le tableau de bord, le clavier ou votre téléphone.
eyebrow: Claude Code
permalink: /fr/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Claude Code se bloque par défaut sur les dialogues de permission — pour les appels d'outils, les écritures de fichiers, etc. purplemux attrape ces dialogues dès qu'ils apparaissent et les route vers l'appareil dont vous êtes le plus proche.

## Ce qui est intercepté

Claude Code déclenche un hook `Notification` pour plusieurs raisons. purplemux ne traite que deux types de notification comme des invites de permission :

- `permission_prompt` — le dialogue standard « Autoriser cet outil ? »
- `worker_permission_prompt` — la même chose depuis un sous-agent

Tout le reste (rappels d'inactivité, etc.) est ignoré côté statut et ne fait pas basculer l'onglet en **needs-input** ni n'envoie de push.

## Ce qui se passe quand un en déclenche

1. Claude Code émet un hook `Notification`. Le script shell `~/.purplemux/status-hook.sh` POST l'événement et le type de notification au serveur local.
2. Le serveur bascule l'état de l'onglet en **needs-input** (pulsation orange) et diffuse le changement sur le WebSocket de statut.
3. Le tableau de bord affiche l'invite **en ligne dans la timeline**, avec les mêmes options que Claude proposait — pas de modale, pas de changement de contexte.
4. Si vous avez accordé la permission de notifications, un Web Push et / ou une notification desktop se déclenche pour `needs-input`.

La CLI Claude elle-même attend toujours sur stdin. purplemux lit les options de l'invite depuis tmux et renvoie votre choix quand vous en sélectionnez un.

## Comment répondre

Trois moyens équivalents :

- **Cliquer** sur l'option dans la timeline.
- **Presser le numéro** — <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> — correspondant à l'index de l'option.
- **Toucher la push** sur votre téléphone, qui ouvre directement l'invite ; choisissez-y.

Une fois sélectionné, purplemux envoie l'entrée à tmux, l'onglet retransitionne en **busy**, et Claude reprend en plein flux. Vous n'avez rien d'autre à acquitter — le clic *est* l'acquittement.

{% call callout('tip', 'Les invites consécutives se rechargent automatiquement') %}
Si Claude pose plusieurs questions à la suite, l'invite en ligne se redessine avec les nouvelles options dès que la prochaine `Notification` arrive. Vous n'avez pas besoin de fermer la précédente.
{% endcall %}

## Flux mobile

Avec la PWA installée et les notifications accordées, Web Push se déclenche que l'onglet du navigateur soit ouvert, en arrière-plan ou fermé :

- La notification dit « Saisie requise » et identifie la session.
- Toucher l'ouvre purplemux focalisé sur cet onglet.
- L'invite en ligne est déjà rendue ; choisissez une option en un toucher.

C'est la principale raison de mettre en place [Tailscale + PWA](/purplemux/fr/docs/quickstart/#y-acceacuteder-depuis-votre-teacuteleacutephone) — ça permet aux approbations de vous suivre hors du bureau.

## Quand les options ne peuvent pas être lues

Dans de rares cas (une invite qui a sorti du scrollback tmux avant que purplemux ne puisse la lire), la liste d'options revient vide. La timeline affiche une carte « impossible de lire l'invite » et réessaie jusqu'à quatre fois avec backoff. Si ça échoue toujours, basculez l'onglet en mode **Terminal** et répondez dans la CLI brute — le processus Claude sous-jacent attend toujours.

## Et les rappels d'inactivité ?

Les autres types de notification de Claude — par exemple les rappels d'inactivité — arrivent quand même à l'endpoint hook. Le serveur les loggue mais ne change pas l'état de l'onglet, n'envoie pas de push et n'affiche pas d'invite UI. C'est intentionnel : seuls les événements qui *bloquent* Claude méritent votre attention.

## Pour aller plus loin

- **[Statut de session](/purplemux/fr/docs/session-status/)** — ce que signifie l'état **needs-input** et comment il est détecté.
- **[Vue de session en direct](/purplemux/fr/docs/live-session-view/)** — où l'invite en ligne est rendue.
- **[Compatibilité navigateur](/purplemux/fr/docs/browser-support/)** — exigences Web Push (notamment iOS Safari 16.4+).
