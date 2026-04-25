---
title: Acceso por Tailscale
description: Llega a purplemux desde el móvil sobre HTTPS vía Tailscale Serve — sin redireccionar puertos, sin malabares con certificados.
eyebrow: Móvil y remoto
permalink: /es/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

Por defecto purplemux solo escucha localmente. Tailscale Serve es la forma más limpia de exponerlo a tus otros dispositivos: cifrado WireGuard, certificados Let's Encrypt automáticos y cero cambios en el firewall.

## Por qué Tailscale

- **WireGuard** — cada conexión está cifrada de dispositivo a dispositivo.
- **HTTPS automático** — Tailscale provisiona un certificado real para `*.<tailnet>.ts.net`.
- **Sin redirección de puertos** — tu máquina nunca abre un puerto al internet público.
- **HTTPS es obligatorio para iOS** — la instalación de PWA y Web Push se niegan a funcionar sin él. Consulta [Configuración de PWA](/purplemux/es/docs/pwa-setup/) y [Web Push](/purplemux/es/docs/web-push/).

## Requisitos previos

- Una cuenta de Tailscale, con el demonio `tailscale` instalado y con sesión iniciada en la máquina que ejecuta purplemux.
- HTTPS activado en el tailnet (Admin console → DNS → activar HTTPS Certificates, si no lo está ya).
- purplemux corriendo en el puerto por defecto `8022` (o donde hayas puesto `PORT`).

## Ejecutarlo

Una línea:

```bash
tailscale serve --bg 8022
```

Tailscale envuelve tu `http://localhost:8022` local en HTTPS y lo expone dentro del tailnet en:

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` es el hostname de la máquina; `<tailnet>` es el sufijo MagicDNS de tu tailnet. Abre esa URL en cualquier otro dispositivo con sesión iniciada en el mismo tailnet y estás dentro.

Para parar el serve:

```bash
tailscale serve --bg off 8022
```

## Qué puedes hacer cuando funciona

- Abrir la URL en el móvil, tocar **Compartir → Añadir a pantalla de inicio**, y seguir [Configuración de PWA](/purplemux/es/docs/pwa-setup/).
- Activar el push desde dentro de la PWA standalone: [Web Push](/purplemux/es/docs/web-push/).
- Llegar al mismo panel desde una tablet, un portátil u otro escritorio — el estado del espacio de trabajo se sincroniza en tiempo real.

{% call callout('tip', 'Funnel vs Serve') %}
`tailscale serve` mantiene purplemux privado a tu tailnet — eso es casi siempre lo que quieres. `tailscale funnel` lo expondría al internet público, lo cual es excesivo (y arriesgado) para un multiplexor personal.
{% endcall %}

## Reverse-proxy como alternativa

Si Tailscale no es una opción, cualquier reverse proxy con un certificado TLS real sirve. Lo único que tienes que hacer bien son las **mejoras WebSocket** — purplemux las usa para E/S de terminal, sincronización de estado y la línea de tiempo en directo.

Nginx (esbozo):

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy es más simple — `reverse_proxy 127.0.0.1:8022` se encarga de las cabeceras de upgrade automáticamente.

Sin reenvío de `Upgrade` / `Connection` el panel se renderiza, pero los terminales nunca conectan y el estado se queda atascado. Si algo va a medias, sospecha de esas cabeceras primero.

## Solución de problemas

- **HTTPS aún no provisionado** — el primer certificado puede tardar un minuto. Volver a ejecutar `tailscale serve --bg 8022` tras esperar un poco suele resolverlo.
- **El navegador avisa del certificado** — asegúrate de estar accediendo a la URL `<machine>.<tailnet>.ts.net` exacta, no a la IP de la LAN.
- **El móvil dice "no accesible"** — confirma que el móvil tiene sesión iniciada en el mismo tailnet y que Tailscale está activo en los ajustes del SO.
- **Certificados autofirmados** — Web Push no se registrará. Usa Tailscale Serve o un certificado ACME real vía tu reverse proxy.

## Siguientes pasos

- **[Configuración de PWA](/purplemux/es/docs/pwa-setup/)** — instala en la pantalla de inicio ahora que tienes HTTPS.
- **[Notificaciones Web Push](/purplemux/es/docs/web-push/)** — activa las alertas en segundo plano.
- **[Seguridad y autenticación](/purplemux/es/docs/security-auth/)** — contraseña, hashing y qué implica la exposición al tailnet.
