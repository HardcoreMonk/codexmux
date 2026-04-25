---
title: Solución de problemas y FAQ
description: Problemas comunes, respuestas rápidas y las preguntas que aparecen con más frecuencia.
eyebrow: Referencia
permalink: /es/docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

Si algo aquí no coincide con lo que ves, [abre una issue](https://github.com/subicura/purplemux/issues) con tu plataforma, navegador y el archivo de log relevante de `~/.purplemux/logs/`.

## Instalación y arranque

### `tmux: command not found`

purplemux necesita tmux 3.0+ en el host. Instálalo:

```bash
# macOS (Homebrew)
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

Verifica con `tmux -V`. tmux 2.9+ pasa técnicamente la comprobación previa, pero 3.0+ es contra lo que probamos.

### `node: command not found` o "Node.js 20 o superior"

Instala Node 20 LTS o posterior. Verifica con `node -v`. La app nativa de macOS empaqueta su propio Node, así que esto solo aplica a las rutas `npx` / `npm install -g`.

### "purplemux is already running (pid=…, port=…)"

Otra instancia de purplemux está viva y respondiendo en `/api/health`. O usa esa (abre la URL impresa) o párala primero:

```bash
# encuéntrala
ps aux | grep purplemux

# o mátala vía el archivo lock
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### Lock obsoleto — rehúsa arrancar pero no hay proceso

`~/.purplemux/pmux.lock` quedó atrás. Bórralo:

```bash
rm ~/.purplemux/pmux.lock
```

Si alguna vez ejecutaste purplemux con `sudo`, el archivo puede pertenecer a root — `sudo rm` una vez.

### `Port 8022 is in use, finding an available port...`

Otro proceso ocupa `8022`. El servidor cae a un puerto libre aleatorio e imprime la nueva URL. Para elegir el puerto tú:

```bash
PORT=9000 purplemux
```

Encuentra qué retiene `8022` con `lsof -iTCP:8022 -sTCP:LISTEN -n -P`.

### ¿Funciona en Windows?

**No oficialmente.** purplemux depende de `node-pty` y tmux, ninguno de los cuales corre nativamente en Windows. WSL2 suele funcionar (estás efectivamente en Linux a esa altura) pero queda fuera de nuestra matriz de pruebas.

## Sesiones y restauración

### Cerrar el navegador mató todo

No debería — tmux mantiene cada shell abierto en el servidor. Si refrescar no devuelve las pestañas:

1. Comprueba que el servidor sigue corriendo (`http://localhost:8022/api/health`).
2. Comprueba que las sesiones tmux existen: `tmux -L purple ls`.
3. Mira `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log` por errores durante `autoResumeOnStartup`.

Si tmux dice "no server running", la máquina se reinició o algo mató tmux. Las sesiones se perdieron, pero la disposición (espacios, pestañas, directorios de trabajo) se preserva en `~/.purplemux/workspaces/{wsId}/layout.json` y se relanza al siguiente arranque de purplemux.

### Una sesión de Claude no reanuda

`autoResumeOnStartup` reejecuta el `claude --resume <uuid>` guardado para cada pestaña, pero si el correspondiente `~/.claude/projects/.../sessionId.jsonl` ya no existe (borrado, archivado, o el proyecto se movió) el resume fallará. Abre la pestaña e inicia una conversación nueva.

### Mis pestañas todas muestran "unknown"

`unknown` significa que una pestaña estaba `busy` antes de un reinicio del servidor y la recuperación está en curso. `resolveUnknown` corre en segundo plano y confirma `idle` (Claude salió) o `ready-for-review` (mensaje final del asistente presente). Si una pestaña queda atascada en `unknown` más de diez minutos, la **red de seguridad de busy atascado** la pasa silenciosamente a `idle`. Consulta [STATUS.md](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) para la máquina de estados completa.

## Navegador y UI

### Las notificaciones Web Push nunca se disparan

Recorre esta checklist:

1. **Solo iOS Safari ≥ 16.4.** iOS anterior no tiene Web Push en absoluto.
2. **Debe ser una PWA en iOS.** Toca **Compartir → Añadir a pantalla de inicio** primero; el push no se dispara desde una pestaña normal de Safari.
3. **HTTPS requerido.** Los certificados autofirmados no funcionan — Web Push se niega silenciosamente a registrarse. Usa Tailscale Serve (Let's Encrypt gratis) o un dominio real tras Nginx / Caddy.
4. **Permiso de notificación concedido.** **Configuración → Notificación → On** en purplemux *y* el permiso a nivel de navegador deben estar ambos permitidos.
5. **Existen suscripciones.** `~/.purplemux/push-subscriptions.json` debería tener una entrada para el dispositivo. Si está vacío, vuelve a conceder el permiso.

Consulta [Compatibilidad de navegadores](/purplemux/es/docs/browser-support/) para la matriz completa.

### iOS Safari 16.4+ pero aún sin notificaciones

Algunas versiones de iOS pierden la suscripción tras un periodo largo con la PWA cerrada. Abre la PWA, deniega y vuelve a conceder permisos de notificación, y comprueba `push-subscriptions.json` de nuevo.

### La ventana privada de Safari no persiste nada

IndexedDB está desactivado en ventanas privadas de Safari 17+, así que la caché del espacio no sobrevivirá a un reinicio. Usa una ventana normal.

### El terminal móvil desaparece tras pasar a segundo plano

iOS Safari desconecta el WebSocket tras unos 30 s en segundo plano. tmux mantiene la sesión real activa — cuando vuelves a la pestaña, purplemux reconecta y rerenderiza. Es iOS, no nosotros.

### Firefox + Tailscale serve = aviso de certificado

Si tu tailnet usa un dominio personalizado que no es `*.ts.net`, Firefox es más estricto con la confianza HTTPS que Chrome. Acepta el certificado una vez y se queda.

### "Navegador demasiado antiguo" o faltan funcionalidades

Ejecuta **Configuración → Verificación del navegador** para un informe por API. Cualquier cosa por debajo de los mínimos en [Compatibilidad de navegadores](/purplemux/es/docs/browser-support/) pierde funcionalidades con elegancia pero no está soportada.

## Red y acceso remoto

### ¿Puedo exponer purplemux a internet?

Puedes, pero siempre sobre HTTPS. Recomendado:

1. **Tailscale Serve** — `tailscale serve --bg 8022` da cifrado WireGuard + certificados automáticos. Sin redirección de puertos.
2. **Reverse proxy** — Nginx / Caddy / Traefik. Asegúrate de reenviar las cabeceras `Upgrade` y `Connection`, si no los WebSockets se rompen.

HTTP plano por internet abierto es mala idea — la cookie de auth está firmada con HMAC pero las cargas WebSocket (¡bytes de terminal!) no van cifradas.

### Otros dispositivos en mi LAN no pueden llegar a purplemux

Por defecto purplemux solo permite localhost. Abre acceso vía env o desde la app:

```bash
HOST=lan,localhost purplemux       # apto para LAN
HOST=tailscale,localhost purplemux # apto para tailnet
HOST=all purplemux                 # todo
```

O **Configuración → Acceso de red** en la app, que escribe a `~/.purplemux/config.json`. (Cuando `HOST` se define vía env, ese campo queda bloqueado.) Consulta [Puertos y variables de entorno](/purplemux/es/docs/ports-env-vars/) para la sintaxis de keyword y CIDR.

### Problemas WebSocket con reverse-proxy

Si `/api/terminal` conecta y cae inmediatamente, el proxy está quitando las cabeceras `Upgrade` / `Connection`. Nginx mínimo:

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy: el reenvío de WebSocket es por defecto; con `reverse_proxy 127.0.0.1:8022` basta.

## Datos y almacenamiento

### ¿Dónde están mis datos?

Todo es local bajo `~/.purplemux/`. Nada sale de tu máquina. La contraseña de login es un hash scrypt en `config.json`. Consulta [Directorio de datos](/purplemux/es/docs/data-directory/) para la disposición completa.

### Olvidé mi contraseña

Borra `~/.purplemux/config.json` y reinicia. El onboarding empieza de nuevo. Espacios, disposiciones e historial se mantienen (son archivos separados).

### Indicador de pestaña atascado en "busy" para siempre

La `red de seguridad de busy atascado` pasa una pestaña silenciosamente a `idle` tras diez minutos si el proceso de Claude ha muerto. Si no quieres esperar, cierra y reabre la pestaña — eso resetea el estado local y el siguiente evento de hook continuará desde cero. Para investigar la causa raíz, ejecuta con `LOG_LEVELS=hooks=debug,status=debug`.

### ¿Entra en conflicto con mi config tmux existente?

No. purplemux ejecuta un tmux aislado en un socket dedicado (`-L purple`) con su propia config (`src/config/tmux.conf`). Tu `~/.tmux.conf` y cualquier sesión tmux existente quedan intactos.

## Coste y uso

### ¿Me ahorra dinero purplemux?

No directamente. Lo que hace es **transparentar el uso**: coste hoy / mes / por proyecto, desgloses de tokens por modelo y cuentas atrás de límites 5h / 7d en una pantalla, para que te marques el ritmo antes de chocar contra el muro.

### ¿purplemux es de pago?

No. purplemux es código abierto con licencia MIT. El uso de Claude Code lo factura Anthropic por separado.

### ¿Mis datos se envían a algún sitio?

No. purplemux es totalmente self-hosted. Las únicas llamadas de red que hace son al CLI de Claude local (que habla con Anthropic por su cuenta) y la comprobación de versión vía `update-notifier` al arrancar. Desactiva la comprobación de versión con `NO_UPDATE_NOTIFIER=1`.

## Siguientes pasos

- **[Compatibilidad de navegadores](/purplemux/es/docs/browser-support/)** — matriz detallada y particularidades conocidas.
- **[Directorio de datos](/purplemux/es/docs/data-directory/)** — qué hace cada archivo y qué es seguro borrar.
- **[Arquitectura](/purplemux/es/docs/architecture/)** — cómo encajan las piezas cuando algo necesita una excavación más profunda.
