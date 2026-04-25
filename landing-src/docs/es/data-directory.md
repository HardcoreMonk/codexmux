---
title: Directorio de datos
description: Qué vive bajo ~/.purplemux/, qué es seguro borrar y cómo respaldarlo.
eyebrow: Referencia
permalink: /es/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

Cada pieza persistente de estado que purplemux guarda — ajustes, disposiciones, historial de sesiones, cachés — vive bajo `~/.purplemux/`. Nada más. Sin `localStorage`, sin keychain del sistema, sin servicio externo.

## Disposición de un vistazo

```
~/.purplemux/
├── config.json              # config de la app (auth, tema, locale, …)
├── workspaces.json          # lista de espacios + estado de la barra lateral
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # árbol de paneles/pestañas
│       ├── message-history.json  # historial de input por espacio
│       └── claude-prompt.md      # contenido de --append-system-prompt-file
├── hooks.json               # config de hook de Claude Code + statusline (generado)
├── status-hook.sh           # script de hook (generado, 0755)
├── statusline.sh            # script de statusline (generado, 0755)
├── rate-limits.json         # último JSON de statusline
├── session-history.json     # log de sesiones de Claude completadas (multi-espacio)
├── quick-prompts.json       # prompts rápidos personalizados + integrados desactivados
├── sidebar-items.json       # elementos personalizados + integrados desactivados
├── vapid-keys.json          # keypair VAPID de Web Push (generado)
├── push-subscriptions.json  # suscripciones de endpoint Web Push
├── cli-token                # token de auth del CLI (generado)
├── port                     # puerto actual del servidor
├── pmux.lock                # lock de instancia única {pid, port, startedAt}
├── logs/                    # archivos de log de pino-roll
├── uploads/                 # imágenes adjuntadas vía la barra de chat
└── stats/                   # caché de estadísticas de uso de Claude
```

Los archivos que contienen secretos (config, tokens, disposiciones, claves VAPID, lock) se escriben con modo `0600` vía un patrón `tmpFile → rename`.

## Archivos de nivel superior

| Archivo | Qué almacena | ¿Seguro borrar? |
|---|---|---|
| `config.json` | contraseña de login hasheada con scrypt, secreto HMAC de sesión, tema, locale, tamaño de fuente, interruptor de notificaciones, URL de editor, acceso de red, CSS personalizado | Sí — re-ejecuta onboarding |
| `workspaces.json` | índice de espacios, ancho de barra lateral / estado plegado, ID del espacio activo | Sí — borra todos los espacios y pestañas |
| `hooks.json` | mapping `--settings` de Claude Code (evento → script) + `statusLine.command` | Sí — se regenera al siguiente arranque |
| `status-hook.sh`, `statusline.sh` | POSTean a `/api/status/hook` y `/api/status/statusline` con `x-pmux-token` | Sí — se regeneran al siguiente arranque |
| `rate-limits.json` | último JSON de statusline de Claude: `ts`, `model`, `five_hour`, `seven_day`, `context`, `cost` | Sí — se vuelve a poblar a medida que Claude corre |
| `session-history.json` | últimas 200 sesiones de Claude completadas (prompts, resultados, duraciones, herramientas, archivos) | Sí — limpia el historial |
| `quick-prompts.json`, `sidebar-items.json` | `{ custom: […], disabledBuiltinIds: […], order: […] }` superpuestos sobre las listas integradas | Sí — restaura por defecto |
| `vapid-keys.json` | keypair VAPID de Web Push, generado al primer arranque | No, salvo que también borres `push-subscriptions.json` (las suscripciones existentes se rompen) |
| `push-subscriptions.json` | endpoints de push por navegador | Sí — vuelve a suscribirte en cada dispositivo |
| `cli-token` | token hex de 32 bytes para el CLI `purplemux` y los scripts de hook (cabecera `x-pmux-token`) | Sí — se regenera al siguiente arranque, pero cualquier script de hook ya generado mantiene el token viejo hasta que el servidor lo sobrescriba |
| `port` | puerto actual en texto plano, leído por scripts de hook y el CLI | Sí — se regenera al siguiente arranque |
| `pmux.lock` | guarda de instancia única `{ pid, port, startedAt }` | Solo si no hay un proceso purplemux vivo |

{% call callout('warning', 'Detalles del archivo lock') %}
Si purplemux rehúsa arrancar con "ya en marcha" pero no hay proceso vivo, `pmux.lock` está obsoleto. `rm ~/.purplemux/pmux.lock` y vuelve a intentar. Si alguna vez ejecutaste purplemux con `sudo`, el archivo lock puede pertenecer a root — `sudo rm` una vez.
{% endcall %}

## Directorio por espacio (`workspaces/{wsId}/`)

Cada espacio tiene su propia carpeta, nombrada con el ID generado.

| Archivo | Contenido |
|---|---|
| `layout.json` | árbol recursivo de paneles/pestañas: nodos hoja `pane` con `tabs[]`, nodos `split` con `children[]` y un `ratio`. Cada pestaña lleva su nombre de sesión tmux (`pt-{wsId}-{paneId}-{tabId}`), `cliState` cacheado, `claudeSessionId`, último comando de resume. |
| `message-history.json` | historial de input de Claude por espacio. Limitado a 500 entradas. |
| `claude-prompt.md` | contenido `--append-system-prompt-file` pasado a cada pestaña de Claude de este espacio. Se regenera al crear/renombrar el espacio o cambiar de directorio. |

Borra un solo `workspaces/{wsId}/layout.json` para resetear la disposición de ese espacio a un panel por defecto sin tocar los otros.

## `logs/`

Salida de pino-roll, un archivo por día UTC, con un sufijo numérico cuando se exceden los límites de tamaño:

```
logs/purplemux.2026-04-19.1.log
```

Nivel por defecto `info`. Sobrescribe con `LOG_LEVEL` o por módulo con `LOG_LEVELS` — consulta [Puertos y variables de entorno](/purplemux/es/docs/ports-env-vars/).

Los logs rotan semanalmente (límite de 7 archivos). Seguro borrar en cualquier momento.

## `uploads/`

Imágenes adjuntadas vía la barra de chat (drag, paste, clip):

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- Permitidos: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Máximo 10 MB por archivo, modo `0600`
- Auto-limpieza al arranque del servidor: cualquier cosa con más de 24 horas se elimina
- Limpieza manual en **Configuración → Sistema → Imágenes adjuntas → Limpiar ahora**

## `stats/`

Caché pura. Derivada de `~/.claude/projects/**/*.jsonl` — purplemux solo lee ese directorio.

| Archivo | Contenido |
|---|---|
| `cache.json` | agregados por día: mensajes, sesiones, llamadas a herramientas, conteos por hora, uso de tokens por modelo |
| `uptime-cache.json` | resumen por día de uptime / minutos activos |
| `daily-reports/{YYYY-MM-DD}.json` | brief diario generado por IA |

Borra la carpeta entera para forzar un recálculo en la siguiente petición de estadísticas.

## Matriz de reseteo

| Para resetear… | Borrar |
|---|---|
| Contraseña de login (re-onboarding) | `config.json` |
| Todos los espacios y pestañas | `workspaces.json` + `workspaces/` |
| La disposición de un espacio | `workspaces/{wsId}/layout.json` |
| Estadísticas de uso | `stats/` |
| Suscripciones push | `push-subscriptions.json` |
| "Ya en marcha" atascado | `pmux.lock` (solo si no hay proceso vivo) |
| Todo (reset de fábrica) | `~/.purplemux/` |

`hooks.json`, `status-hook.sh`, `statusline.sh`, `port`, `cli-token` y `vapid-keys.json` se regeneran automáticamente al siguiente arranque, así que borrarlos es inocuo.

## Backups

Todo el directorio es JSON plano más unos pocos shell scripts. Para respaldar:

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

Para restaurar en una máquina nueva, descomprime y arranca purplemux. Los scripts de hook se reescribirán con el puerto del servidor nuevo; todo lo demás (espacios, historial, ajustes) se traslada tal cual.

{% call callout('warning') %}
No restaures `pmux.lock` — está atado a un PID concreto y bloqueará el arranque. Excluye con `--exclude pmux.lock`.
{% endcall %}

## Borrar todo

```bash
rm -rf ~/.purplemux
```

Asegúrate de que ningún purplemux esté corriendo primero. El siguiente arranque será la experiencia de primer uso de nuevo.

## Siguientes pasos

- **[Puertos y variables de entorno](/purplemux/es/docs/ports-env-vars/)** — cada variable que influye en este directorio.
- **[Arquitectura](/purplemux/es/docs/architecture/)** — cómo se conectan los archivos al servidor en marcha.
- **[Solución de problemas](/purplemux/es/docs/troubleshooting/)** — problemas comunes y soluciones.
