---
title: Configuración de PWA
description: Añade purplemux a tu pantalla de inicio en iOS Safari y Android Chrome para una experiencia a pantalla completa, tipo app.
eyebrow: Móvil y remoto
permalink: /es/docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

Instalar purplemux como una Progressive Web App convierte la pestaña del navegador en un icono independiente en la pantalla de inicio, con disposición a pantalla completa y splash screens en condiciones. En iOS además es el requisito previo para Web Push.

## Qué consigues

- **Disposición a pantalla completa** — sin chrome del navegador, más espacio vertical para terminal y línea de tiempo.
- **Icono de app** — purplemux se lanza desde la pantalla de inicio como cualquier app nativa.
- **Splash screens** — purplemux trae imágenes de splash por dispositivo para iPhones, así la transición de arranque parece nativa.
- **Web Push** (solo iOS) — las notificaciones push solo se disparan tras instalar la PWA.

El manifest se sirve en `/api/manifest` y registra `display: standalone` con la marca purplemux y el color del tema.

## Antes de instalar

La página tiene que ser accesible por **HTTPS** para que las PWAs funcionen. Desde `localhost` funciona en Chrome (excepción de loopback) pero iOS Safari rehúsa instalar sobre HTTP plano. La ruta limpia es Tailscale Serve — consulta [Acceso por Tailscale](/purplemux/es/docs/tailscale/).

{% call callout('warning', 'iOS necesita Safari 16.4 o superior') %}
Las versiones anteriores de iOS pueden instalar la PWA pero no entregarán Web Push. Si te importa el push, actualiza iOS primero. El detalle por navegador vive en [Compatibilidad de navegadores](/purplemux/es/docs/browser-support/).
{% endcall %}

## iOS Safari

1. Abre la URL de purplemux en **Safari** (otros navegadores de iOS no exponen "Añadir a pantalla de inicio" para PWAs).
2. Toca el icono **Compartir** en la barra inferior.
3. Desplaza el panel de acciones y elige **Añadir a pantalla de inicio**.
4. Edita el nombre si quieres y toca **Añadir** arriba a la derecha.
5. Lanza purplemux desde el nuevo icono — se abre a pantalla completa.

El primer arranque desde el icono es el momento en que iOS lo trata como una PWA real. Cualquier aviso de permiso de push debería dispararse desde dentro de esta ventana standalone, no desde una pestaña normal de Safari.

## Android Chrome

Chrome auto-detecta un manifest instalable y ofrece un banner. Si no lo ves:

1. Abre la URL de purplemux en **Chrome**.
2. Toca el menú **⋮** arriba a la derecha.
3. Elige **Instalar app** (a veces aparece como **Añadir a pantalla de inicio**).
4. Confirma. El icono aparece en la pantalla de inicio y en el cajón de apps.

Samsung Internet se comporta igual — el aviso de instalación suele aparecer automáticamente.

## Verificar la instalación

Abre purplemux desde el icono de la pantalla de inicio. La barra de direcciones del navegador debería desaparecer. Si todavía ves UI del navegador, el manifest no se aplicó — normalmente porque la página se carga sobre HTTP plano o vía un proxy inusual.

También puedes confirmar en **Configuración → Notificación** — una vez la PWA está instalada y Web Push está soportado, el interruptor se habilita.

## Actualizar la PWA

No hay que hacer nada. La PWA carga el mismo `index.html` que sirve tu instancia de purplemux, así que actualizar purplemux actualiza la app instalada en el siguiente arranque.

Para eliminarla, mantén pulsado el icono y elige la acción de desinstalación nativa del SO.

## Siguientes pasos

- **[Notificaciones Web Push](/purplemux/es/docs/web-push/)** — activa las alertas en segundo plano ahora que la PWA está instalada.
- **[Acceso por Tailscale](/purplemux/es/docs/tailscale/)** — consigue la URL HTTPS que iOS requiere.
- **[Compatibilidad de navegadores](/purplemux/es/docs/browser-support/)** — matriz completa.
