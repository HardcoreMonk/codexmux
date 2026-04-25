---
title: Integración con el editor
description: Abre la carpeta actual en tu editor — VS Code, Cursor, Zed, code-server o una URL personalizada — directamente desde la cabecera.
eyebrow: Personalización
permalink: /es/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

Cada espacio de trabajo tiene un botón **EDITOR** en la cabecera. Al hacer clic, abre la carpeta de la sesión activa en el editor que elijas. Elige un preset, apunta a una URL o confía en el handler del sistema y listo.

## Abrir el selector

Configuración (<kbd>⌘,</kbd>) → pestaña **Editor**. Verás una lista de presets y, según la elección, un campo de URL.

## Presets disponibles

| Preset | Qué hace |
|---|---|
| **Code Server (Web)** | Abre una instancia alojada de [code-server](https://github.com/coder/code-server) con `?folder=<ruta>`. Requiere una URL. |
| **VS Code** | Dispara `vscode://file/<ruta>?windowId=_blank`. |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<ruta>` |
| **URL personalizada** | Una plantilla de URL que tú controlas, con marcadores `{folder}` / `{folderEncoded}`. |
| **Desactivado** | Oculta el botón EDITOR por completo. |

Los cuatro presets de IDE de escritorio (VS Code, Cursor, Windsurf, Zed) se apoyan en que el SO tenga registrado un manejador de URI. Si tienes el IDE instalado localmente, el enlace funciona como esperas.

## Web vs. local

Hay una distinción significativa en cómo cada preset abre una carpeta:

- **code-server** corre dentro del navegador. La URL apunta al servidor que estás alojando (tuyo, en tu red, o tras Tailscale). Haz clic en el botón EDITOR y una nueva pestaña carga la carpeta.
- **IDEs locales** (VS Code, Cursor, Windsurf, Zed) requieren tener el IDE instalado en la *máquina donde corre el navegador*. El enlace se entrega al SO, que lanza el manejador registrado.

Si usas purplemux desde el móvil, solo el preset code-server funciona — los móviles no pueden abrir URLs `vscode://` en una app de escritorio.

## Configurar code-server

Una configuración local típica, surfaceada en producto:

```bash
# Instalar en macOS
brew install code-server

# Ejecutar
code-server --port 8080

# Acceso externo vía Tailscale (opcional)
tailscale serve --bg --https=8443 http://localhost:8080
```

Luego en la pestaña Editor, pon la URL a la dirección donde code-server es accesible — `http://localhost:8080` para local, o `https://<machine>.<tailnet>.ts.net:8443` si lo has puesto tras Tailscale Serve. purplemux valida que la URL empiece con `http://` o `https://` y añade `?folder=<ruta absoluta>` automáticamente.

{% call callout('note', 'Elige un puerto que no sea 8022') %}
purplemux ya vive en `8022`. Ejecuta code-server en un puerto diferente (el ejemplo usa `8080`) para que no peleen.
{% endcall %}

## Plantilla de URL personalizada

El preset Personalizado te permite apuntar a cualquier cosa que acepte una carpeta en su URL — workspaces de Coder, Gitpod, Theia, una herramienta interna. La plantilla **debe** contener al menos uno de estos marcadores:

- `{folder}` — ruta absoluta, sin codificar.
- `{folderEncoded}` — codificada para URL.

```
mieditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux valida la plantilla al guardar y rechaza una sin marcador.

## Desactivar el botón

Elige **Desactivado**. El botón desaparece de la cabecera del espacio de trabajo.

## Siguientes pasos

- **[Barra lateral y opciones de Claude](/purplemux/es/docs/sidebar-options/)** — reordena elementos de la barra lateral, alterna flags de Claude.
- **[CSS personalizado](/purplemux/es/docs/custom-css/)** — más ajustes visuales.
- **[Tailscale](/purplemux/es/docs/tailscale/)** — acceso externo seguro también para code-server.
