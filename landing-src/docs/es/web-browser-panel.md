---
title: Panel de navegador web
description: Una pestaña de navegador integrado para probar la salida de tu dev server, manejable desde el CLI de purplemux, con emulador de dispositivos para viewports móviles.
eyebrow: Espacios de trabajo y terminal
permalink: /es/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

Coloca una pestaña de navegador web junto a tu terminal y a la sesión de Claude. Ejecuta tu servidor local de desarrollo, el sitio de staging, cualquier cosa accesible — y puedes manejarla desde el CLI `purplemux` sin salir del shell.

## Abrir una pestaña de navegador

Añade una nueva pestaña y elige **Navegador web** como tipo de panel. Escribe una URL en la barra de direcciones — `localhost:3000`, una IP, o una URL https completa. La barra de direcciones normaliza la entrada: los hostnames y IPs sueltos van a `http://`, todo lo demás a `https://`.

El panel se ejecuta como un webview real de Chromium cuando purplemux es la app nativa de macOS (build de Electron), y como respaldo usa un iframe cuando se accede desde un navegador normal. La ruta del iframe cubre la mayoría de páginas pero no funcionará con sitios que envíen `X-Frame-Options: deny`; la ruta de Electron no tiene ese límite.

{% call callout('note', 'Mejor en la app nativa') %}
La emulación de dispositivos, las capturas desde el CLI y la captura de consola/red solo funcionan en el build de Electron. La pestaña de navegador como respaldo te da barra de direcciones, atrás/adelante y recargar, pero las integraciones más profundas necesitan un webview.
{% endcall %}

## Navegación desde el CLI

El panel expone una pequeña HTTP API que el CLI `purplemux` empaquetado envuelve. Desde cualquier terminal — incluyendo la que está al lado del panel del navegador — puedes:

```bash
# listar pestañas y encontrar el ID de una pestaña de navegador web
purplemux tab list -w <workspace-id>

# leer la URL y el título actuales
purplemux tab browser url -w <ws> <tabId>

# capturar una pantalla a un archivo (o página completa con --full)
purplemux tab browser screenshot -w <ws> <tabId> -o shot.png --full

# leer logs recientes de consola (buffer circular de 500 entradas)
purplemux tab browser console -w <ws> <tabId> --since 60000 --level error

# inspeccionar actividad de red, opcionalmente recuperando el cuerpo de una respuesta
purplemux tab browser network -w <ws> <tabId> --method POST --status 500
purplemux tab browser network -w <ws> <tabId> --request <id>

# evaluar JavaScript dentro de la pestaña y obtener el resultado serializado
purplemux tab browser eval -w <ws> <tabId> "document.title"
```

El CLI se autentica con un token en `~/.purplemux/cli-token` y lee el puerto desde `~/.purplemux/port`. No necesitas flags si lo ejecutas en la misma máquina. Ejecuta `purplemux help` para ver la superficie completa o `purplemux api-guide` para los endpoints HTTP subyacentes.

Esto es lo que hace útil al panel para Claude: pídele a Claude que tome una captura, revise la consola en busca del error, o ejecute un script de prueba — y Claude tiene el mismo CLI que tú.

## Emulador de dispositivos

Para trabajo móvil, pon el panel en modo móvil. Un selector ofrece presets para iPhone SE hasta 14 Pro Max, Pixel 7, Galaxy S20 Ultra, iPad Mini e iPad Pro 12.9". Cada preset incluye:

- Ancho / alto
- Ratio de píxel del dispositivo
- Un user agent móvil acorde

Alterna vertical/horizontal, y elige el nivel de zoom (`fit` para escalar al panel, o fijo `50% / 75% / 100% / 125% / 150%`). Cuando cambias de dispositivo, el webview se recarga con el nuevo UA para que la detección móvil del lado del servidor vea lo que vería tu móvil.

## Siguientes pasos

- **[Pestañas y paneles](/purplemux/es/docs/tabs-panes/)** — poner el navegador en una división al lado de Claude.
- **[Panel de flujo de Git](/purplemux/es/docs/git-workflow/)** — el otro tipo de panel hecho a propósito.
- **[Instalación](/purplemux/es/docs/installation/)** — la app nativa de macOS, donde vive la integración completa del webview.
