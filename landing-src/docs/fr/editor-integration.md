---
title: Intégration éditeur
description: Ouvrez le dossier courant dans votre éditeur — VS Code, Cursor, Zed, code-server, ou une URL personnalisée — directement depuis l'en-tête.
eyebrow: Personnalisation
permalink: /fr/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

Chaque espace de travail a un bouton **EDITOR** dans l'en-tête. Cliquer dessus ouvre le dossier de la session active dans l'éditeur de votre choix. Choisissez un préréglage, pointez sur une URL ou laissez-vous porter par le gestionnaire système, et c'est tout.

## Ouvrir le sélecteur

Paramètres (<kbd>⌘,</kbd>) → onglet **Éditeur**. Vous verrez une liste de préréglages et, selon le choix, un champ URL.

## Préréglages disponibles

| Préréglage | Ce qu'il fait |
|---|---|
| **Code Server (Web)** | Ouvre une instance [code-server](https://github.com/coder/code-server) hébergée avec `?folder=<path>`. Demande une URL. |
| **VS Code** | Déclenche `vscode://file/<path>?windowId=_blank`. |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<path>` |
| **URL personnalisée** | Un template d'URL que vous contrôlez, avec les placeholders `{folder}` / `{folderEncoded}`. |
| **Désactivé** | Cache complètement le bouton EDITOR. |

Les quatre préréglages d'IDE desktop (VS Code, Cursor, Windsurf, Zed) reposent sur l'OS pour enregistrer un gestionnaire d'URI. Si vous avez l'IDE installé localement, le lien marche comme prévu.

## Web vs. local

Il y a une distinction importante dans la façon dont chaque préréglage ouvre un dossier :

- **code-server** tourne dans le navigateur. L'URL pointe sur le serveur que vous hébergez (le vôtre, sur votre réseau, ou derrière Tailscale). Cliquez le bouton EDITOR et un nouvel onglet charge le dossier.
- **IDE locaux** (VS Code, Cursor, Windsurf, Zed) demandent que l'IDE soit installé sur la *machine qui fait tourner le navigateur*. Le lien est passé à l'OS, qui lance le gestionnaire enregistré.

Si vous utilisez purplemux sur votre téléphone, seul le préréglage code-server marche — les téléphones ne peuvent pas ouvrir d'URL `vscode://` dans une app desktop.

## Configuration code-server

Un setup local typique, surfacé dans l'app :

```bash
# Installer sur macOS
brew install code-server

# Lancer
code-server --port 8080

# Accès externe via Tailscale (optionnel)
tailscale serve --bg --https=8443 http://localhost:8080
```

Puis dans l'onglet Éditeur, réglez l'URL à l'adresse à laquelle code-server est joignable — `http://localhost:8080` pour le local, ou `https://<machine>.<tailnet>.ts.net:8443` si vous l'avez mis derrière Tailscale Serve. purplemux valide que l'URL commence par `http://` ou `https://` et ajoute automatiquement `?folder=<chemin absolu>`.

{% call callout('note', 'Choisissez un port qui n\'est pas 8022') %}
purplemux vit déjà sur `8022`. Faites tourner code-server sur un port différent (l'exemple utilise `8080`) pour qu'ils ne se battent pas.
{% endcall %}

## Template d'URL personnalisée

Le préréglage Personnalisé permet de pointer sur n'importe quoi qui prend un dossier dans son URL — workspaces Coder, Gitpod, Theia, un outil interne. Le template **doit** contenir au moins un des placeholders :

- `{folder}` — chemin absolu, non encodé.
- `{folderEncoded}` — encodé URL.

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux valide le template à la sauvegarde et refuse celui qui n'a pas de placeholder.

## Désactiver le bouton

Choisissez **Désactivé**. Le bouton disparaît de l'en-tête de l'espace de travail.

## Pour aller plus loin

- **[Barre latérale & options Claude](/purplemux/fr/docs/sidebar-options/)** — réordonner les éléments de la barre latérale, basculer les flags Claude.
- **[CSS personnalisé](/purplemux/fr/docs/custom-css/)** — peaufinage visuel supplémentaire.
- **[Tailscale](/purplemux/fr/docs/tailscale/)** — accès externe sécurisé pour code-server aussi.
