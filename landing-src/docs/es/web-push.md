---
title: Notificaciones Web Push
description: Alertas push en segundo plano para los estados necesita-entrada y tarea completada, incluso con la pestaña del navegador cerrada.
eyebrow: Móvil y remoto
permalink: /es/docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

Web Push permite a purplemux avisarte cuando una sesión de Claude requiere tu atención — un aviso de permisos, una tarea terminada — incluso después de cerrar la pestaña. Toca la notificación y aterrizas directamente en esa sesión.

## Qué dispara una notificación

purplemux dispara un push para las mismas transiciones que ves como insignias coloreadas en la barra lateral.

- **Necesita entrada** — Claude llegó a un aviso de permisos o hizo una pregunta.
- **Tarea completada** — Claude terminó un turno (el estado **revisión**).

Las transiciones a inactivo y ocupado intencionalmente no se empujan. Son ruido.

## Activarlo

El interruptor está en **Configuración → Notificación**. Pasos:

1. Abre **Configuración → Notificación** y ponlo en **On**.
2. El navegador te pide permiso de notificaciones — concédelo.
3. purplemux registra una suscripción Web Push contra las claves VAPID del servidor.

La suscripción se guarda en `~/.purplemux/push-subscriptions.json` e identifica tu navegador/dispositivo concreto. Repite los pasos en cada dispositivo en el que quieras recibir notificaciones.

{% call callout('warning', 'iOS requiere Safari 16.4 + una PWA') %}
En iPhone y iPad, Web Push solo funciona después de añadir purplemux a la pantalla de inicio y lanzarlo desde ese icono. Abre la página de Configuración desde la ventana standalone de la PWA — el aviso de permisos en una pestaña normal de Safari no hará nada. Configura la PWA primero: [Configuración de PWA](/purplemux/es/docs/pwa-setup/).
{% endcall %}

## Claves VAPID

purplemux genera un keypair VAPID de servidor de aplicación en el primer arranque y lo guarda en `~/.purplemux/vapid-keys.json` (modo `0600`). No tienes que hacer nada — la clave pública se sirve al navegador automáticamente cuando te suscribes.

Si alguna vez quieres resetear todas las suscripciones (por ejemplo tras rotar las claves), borra `vapid-keys.json` y `push-subscriptions.json` y reinicia purplemux. Cada dispositivo tendrá que volver a suscribirse.

## Entrega en segundo plano

Una vez suscrito, tu móvil recibe la notificación a través del servicio push del SO:

- **iOS** — APNs, vía el puente Web Push de Safari. La entrega es best-effort y puede coalescerse si el móvil está muy throttled.
- **Android** — FCM vía Chrome. Generalmente instantáneo.

La notificación llega tanto si purplemux está en primer plano como si no. Si el panel está visible en _alguno_ de tus dispositivos, purplemux se salta el push para evitar el doble zumbido.

## Tocar para saltar dentro

Tocar una notificación abre purplemux directamente en la sesión que la disparó. Si la PWA ya está corriendo, el foco cambia a la pestaña correcta; si no, la app se lanza y navega ahí.

## Solución de problemas

- **El interruptor está en gris** — Service Workers o Notifications API no están soportados. Ejecuta **Configuración → Verificación del navegador**, o consulta [Compatibilidad de navegadores](/purplemux/es/docs/browser-support/).
- **Permiso denegado** — limpia el permiso de notificaciones del sitio en la configuración del navegador, luego vuelve a activar el interruptor en purplemux.
- **No llegan pushes en iOS** — confirma que estás lanzando desde el icono de la pantalla de inicio, no desde Safari. Confirma que iOS es **16.4 o superior**.
- **Certificado autofirmado** — Web Push se negará a registrarse. Usa Tailscale Serve o un reverse proxy con un certificado real. Consulta [Acceso por Tailscale](/purplemux/es/docs/tailscale/).

## Siguientes pasos

- **[Configuración de PWA](/purplemux/es/docs/pwa-setup/)** — requerido para push en iOS.
- **[Acceso por Tailscale](/purplemux/es/docs/tailscale/)** — HTTPS para entrega externa.
- **[Seguridad y autenticación](/purplemux/es/docs/security-auth/)** — qué más vive bajo `~/.purplemux/`.
