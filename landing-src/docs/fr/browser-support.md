---
title: Compatibilité navigateur
description: Matrice de compatibilité desktop et mobile, avec les particularités à connaître par navigateur.
eyebrow: Commencer
permalink: /fr/docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux est une application web : l'expérience dépend donc du navigateur dans lequel vous l'ouvrez. Voici les versions sur lesquelles nous testons activement — les navigateurs plus anciens peuvent fonctionner mais ne sont pas pris en charge.

## Desktop

| Navigateur | Minimum | Notes |
|---|---|---|
| Chrome | 110+ | Recommandé. PWA + Web Push complets. |
| Edge | 110+ | Même moteur que Chrome, même niveau de support. |
| Safari | 17+ | PWA complète sur macOS Sonoma+. Web Push nécessite macOS 13+ et une PWA installée. |
| Firefox | 115+ ESR | Fonctionne bien. Installation PWA manuelle (pas d'invite d'installation). |

Toutes les fonctionnalités — terminal xterm.js, timeline en direct, vue de session Claude, panneau Git diff — fonctionnent à l'identique sur ces moteurs.

## Mobile

| Navigateur | Minimum | Notes |
|---|---|---|
| iOS Safari | **16.4+** | Requis pour Web Push. Il faut d'abord **ajouter à l'écran d'accueil** ; les push ne se déclenchent pas depuis un onglet classique. |
| Android Chrome | 110+ | Web Push fonctionne aussi depuis un onglet classique, mais nous recommandons l'installation en PWA pour une mise en page plein écran. |
| Samsung Internet | 22+ | Fonctionne. L'invite d'installation apparaît automatiquement. |

{% call callout('warning', 'iOS Safari ≥ 16.4 est la limite') %}
Apple n'a ajouté Web Push à iOS qu'avec Safari 16.4 (mars 2023). Les versions iOS antérieures peuvent toujours utiliser le tableau de bord, mais vous ne recevrez pas de notifications push même après installation de la PWA.
{% endcall %}

## Exigences fonctionnelles

purplemux s'appuie sur quelques API navigateur modernes. Si l'une d'elles manque, l'application bascule en mode dégradé mais perd la fonctionnalité correspondante.

| API | Utilisée pour | Repli |
|---|---|---|
| WebSocket | E/S terminal, sync de statut, timeline | Requis — pas de repli. |
| Clipboard API | Copie de `npx purplemux`, copie de blocs de code | Bouton masqué si indisponible. |
| Notifications API | Push desktop / mobile | Ignoré — le statut intégré reste affiché. |
| Service Workers | PWA + Web Push | Servi uniquement comme app web classique. |
| IntersectionObserver | Timeline en direct, apparition de la nav | Éléments rendus sans animation. |
| `backdrop-filter` | Nav translucide, modales | Repli sur fond teinté plein. |
| CSS `color-mix()` + OKLCH | Variables de thème | Safari < 16.4 perd certains états teintés. |

## Mon navigateur convient-il ?

purplemux embarque un auto-diagnostic dans **Paramètres → Vérification du navigateur**. Il exécute les mêmes sondes que celles listées ci-dessus et affiche un badge vert / orange / rouge par fonctionnalité, sans avoir à lire de fiche technique.

## Particularités connues

- **Safari 17 + fenêtres privées** — IndexedDB est désactivé, donc le cache de votre espace de travail ne survit pas aux redémarrages. Utilisez une fenêtre normale.
- **iOS Safari + onglet en arrière-plan** — les terminaux sont automatiquement détruits après ~30 s en arrière-plan. tmux maintient la session réelle en vie ; l'interface se reconnecte à votre retour.
- **Firefox + certificat Tailscale Serve** — si vous utilisez un nom de tailnet personnalisé hors `ts.net`, Firefox peut être plus exigeant que Chrome sur la confiance HTTPS. Acceptez le certificat une fois et c'est réglé.
- **Certificats auto-signés** — Web Push refuse purement et simplement de s'enregistrer. Utilisez Tailscale Serve (Let's Encrypt automatique) ou un vrai domaine + reverse proxy.

## Non pris en charge

- **Internet Explorer** — jamais pris en charge.
- **UC Browser, Opera Mini, Puffin** — les navigateurs basés sur un proxy cassent les WebSockets. Ne fonctionnent pas.
- **Tout navigateur de plus de 3 ans** — notre CSS utilise les couleurs OKLCH et les container queries, qui nécessitent un moteur de l'ère 2023.

Si vous êtes dans une configuration inhabituelle et que quelque chose ne fonctionne pas, [ouvrez une issue](https://github.com/subicura/purplemux/issues) en y joignant votre user agent et le résultat de l'auto-diagnostic.
