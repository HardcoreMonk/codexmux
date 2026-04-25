---
title: Seguridad y autenticación
description: Cómo purplemux protege tu panel — contraseña hasheada con scrypt, datos solo locales y HTTPS para acceso externo.
eyebrow: Móvil y remoto
permalink: /es/docs/security-auth/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux es self-hosted y se queda en tu máquina. No hay servidores externos, ni telemetría, ni cuenta en la nube. Lo siguiente describe las pocas piezas que realmente protegen tu panel.

## Configurar la contraseña

La primera vez que abres purplemux, la pantalla de onboarding te pide elegir una contraseña. Tras enviarla:

- La contraseña se hashea con **scrypt** (sal aleatoria de 16 bytes, clave derivada de 64 bytes).
- El hash se escribe en `~/.purplemux/config.json` como `scrypt:{salt}:{hash}` — el texto plano nunca se guarda.
- Se genera un `authSecret` separado (hex aleatorio) y se almacena junto al hash. purplemux lo usa para firmar la cookie de sesión emitida tras login.

Las visitas siguientes muestran una pantalla de login que verifica la contraseña con `crypto.timingSafeEqual` contra el hash almacenado.

{% call callout('note', 'Longitud de contraseña') %}
El mínimo es corto (4 caracteres) para que las configuraciones solo-localhost no sean molestas. Si expones purplemux a un tailnet — o a cualquier otro lugar — elige algo más fuerte. Los logins fallidos están limitados a 16 intentos por 15 minutos por proceso.
{% endcall %}

## Resetear la contraseña

¿Se te olvidó? Solo necesitas acceso por shell al host:

```bash
rm ~/.purplemux/config.json
```

Reinicia purplemux (`pnpm start`, `npx purplemux`, o como lo hayas lanzado) y la pantalla de onboarding reaparece para que elijas una nueva contraseña.

Esto borra otros ajustes guardados en el mismo archivo (tema, locale, tamaño de fuente, interruptor de notificaciones, etc.). Tus espacios de trabajo y pestañas viven en `workspaces.json` y el directorio `workspaces/`, así que las disposiciones no se ven afectadas.

## HTTPS para acceso externo

El bind por defecto es `localhost`, sirviendo HTTP plano. Está bien en la misma máquina — pero en el momento que llegas a purplemux desde otro dispositivo, deberías estar sobre HTTPS.

- **Tailscale Serve** es la ruta recomendada: cifrado WireGuard más certificados Let's Encrypt automáticos. Consulta [Acceso por Tailscale](/purplemux/es/docs/tailscale/).
- **Reverse proxy** (Nginx, Caddy, etc.) también funciona, mientras reenvíes las cabeceras WebSocket `Upgrade` y `Connection`.

iOS Safari requiere además HTTPS para la instalación de PWA y el registro de Web Push. Consulta [Configuración de PWA](/purplemux/es/docs/pwa-setup/) y [Web Push](/purplemux/es/docs/web-push/).

## Qué vive en `~/.purplemux/`

Todo es local. Los permisos en archivos sensibles son `0600`.

| Archivo | Qué guarda |
|---|---|
| `config.json` | hash scrypt de la contraseña, secreto de sesión, preferencias de la app |
| `workspaces.json` + `workspaces/` | lista de espacios y disposiciones de paneles/pestañas por espacio |
| `vapid-keys.json` | keypair VAPID de Web Push (auto-generado) |
| `push-subscriptions.json` | suscripciones push por dispositivo |
| `cli-token` | token compartido para que hooks/CLI hablen con el servidor local |
| `pmux.lock` | lock de instancia única (`pid`, `port`, `startedAt`) |
| `logs/` | archivos de log rotantes de pino |

Para el inventario completo y la tabla de reseteo, consulta el listado fuente en [docs/DATA-DIR.md](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md).

## Sin telemetría

purplemux no hace peticiones salientes por su cuenta. Las únicas llamadas de red que inicia son:

- Notificaciones Web Push a las que te suscribiste, enviadas a través de los servicios push del SO.
- Lo que haga el propio CLI de Claude — eso es entre tú y Anthropic, no purplemux.

Tu código y datos de sesión nunca salen de la máquina.

## Siguientes pasos

- **[Acceso por Tailscale](/purplemux/es/docs/tailscale/)** — la ruta segura a HTTPS externo.
- **[Configuración de PWA](/purplemux/es/docs/pwa-setup/)** — una vez resuelta la auth, instálalo en la pantalla de inicio.
- **[Notificaciones Web Push](/purplemux/es/docs/web-push/)** — alertas en segundo plano.
