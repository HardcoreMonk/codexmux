---
title: Referencia del CLI
description: Cada subcomando y flag de los binarios purplemux y pmux.
eyebrow: Referencia
permalink: /es/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux` viene con dos formas de usar el binario: como arrancador del servidor (`purplemux` / `purplemux start`) y como wrapper de la API HTTP (`purplemux <subcomando>`) que habla con un servidor en marcha. El alias corto `pmux` es idéntico.

## Dos roles, un binario

| Forma | Qué hace |
|---|---|
| `purplemux` | Arranca el servidor. Igual que `purplemux start`. |
| `purplemux <subcomando>` | Habla con la API HTTP del CLI de un servidor en marcha. |
| `pmux ...` | Alias para `purplemux ...`. |

El dispatcher en `bin/purplemux.js` separa el primer argumento: los subcomandos conocidos van a `bin/cli.js`, cualquier otra cosa (o sin argumento) lanza el servidor.

## Arrancar el servidor

```bash
purplemux              # por defecto
purplemux start        # lo mismo, explícito
PORT=9000 purplemux    # puerto personalizado
HOST=all purplemux     # enlazar en todas partes
```

Consulta [Puertos y variables de entorno](/purplemux/es/docs/ports-env-vars/) para la superficie env completa.

El servidor imprime sus URLs enlazadas, modo y estado de auth:

```
  ⚡ purplemux  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

Si `8022` ya está en uso, el servidor avisa y enlaza a un puerto libre aleatorio.

## Subcomandos

Todos los subcomandos requieren un servidor en marcha. Leen el puerto desde `~/.purplemux/port` y el token de auth desde `~/.purplemux/cli-token`, ambos escritos automáticamente al arrancar el servidor.

| Comando | Propósito |
|---|---|
| `purplemux workspaces` | Listar espacios de trabajo |
| `purplemux tab list [-w WS]` | Listar pestañas (opcionalmente acotadas a un espacio) |
| `purplemux tab create -w WS [-n NAME] [-t TYPE]` | Crear una nueva pestaña |
| `purplemux tab send -w WS TAB_ID CONTENT...` | Enviar entrada a una pestaña |
| `purplemux tab status -w WS TAB_ID` | Inspeccionar el estado de una pestaña |
| `purplemux tab result -w WS TAB_ID` | Capturar el contenido actual del panel de la pestaña |
| `purplemux tab close -w WS TAB_ID` | Cerrar una pestaña |
| `purplemux tab browser ...` | Manejar una pestaña `web-browser` (solo Electron) |
| `purplemux api-guide` | Imprimir la referencia HTTP API completa |
| `purplemux help` | Mostrar uso |

La salida es JSON salvo que se indique. `--workspace` y `-w` son intercambiables.

### Tipos de panel para `tab create`

El flag `-t` / `--type` elige el tipo de panel. Valores válidos:

| Valor | Panel |
|---|---|
| `terminal` | Shell normal |
| `claude-code` | Shell con `claude` ya en marcha |
| `web-browser` | Navegador embebido (solo Electron) |
| `diff` | Panel de diff de Git |

Sin `-t`, obtienes una terminal normal.

### Subcomandos de `tab browser`

Solo funcionan cuando el tipo de panel de la pestaña es `web-browser`, y solo en la app Electron de macOS — el puente devuelve 503 en otro caso.

| Subcomando | Qué devuelve |
|---|---|
| `purplemux tab browser url -w WS TAB_ID` | URL actual + título de la página |
| `purplemux tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG. Con `-o` guarda en disco; sin él, devuelve base64. `--full` captura la página completa. |
| `purplemux tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | Entradas recientes de consola (buffer circular, 500 entradas) |
| `purplemux tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | Entradas recientes de red; `--request ID` recupera un body |
| `purplemux tab browser eval -w WS TAB_ID EXPR` | Evalúa una expresión JS y serializa el resultado |

## Ejemplos

```bash
# Encontrar tu espacio de trabajo
purplemux workspaces

# Crear una pestaña Claude en el espacio ws-MMKl07
purplemux tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# Enviar un prompt (TAB_ID viene de `tab list`)
purplemux tab send -w ws-MMKl07 tb-abc "Refactoriza src/lib/auth.ts para quitar el cookie path"

# Ver su estado
purplemux tab status -w ws-MMKl07 tb-abc

# Snapshot del panel
purplemux tab result -w ws-MMKl07 tb-abc

# Captura de página completa de una pestaña web-browser
purplemux tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## Autenticación

Cada subcomando envía `x-pmux-token: $(cat ~/.purplemux/cli-token)` y se verifica del lado del servidor con `timingSafeEqual`. El archivo `~/.purplemux/cli-token` se genera en el primer arranque del servidor con `randomBytes(32)` y se almacena con modo `0600`.

Si necesitas manejar el CLI desde otro shell o un script que no puede ver `~/.purplemux/`, define las variables de entorno:

| Variable | Por defecto | Efecto |
|---|---|---|
| `PMUX_PORT` | contenido de `~/.purplemux/port` | Puerto al que habla el CLI |
| `PMUX_TOKEN` | contenido de `~/.purplemux/cli-token` | Bearer token enviado como `x-pmux-token` |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux workspaces
```

{% call callout('warning') %}
El token CLI da acceso completo al servidor. Trátalo como una contraseña. No lo pegues en chat, no lo commitees, no lo expongas como variable de build. Rótalo borrando `~/.purplemux/cli-token` y reiniciando el servidor.
{% endcall %}

## update-notifier

`purplemux` consulta npm en cada arranque por una versión más nueva (vía `update-notifier`) e imprime un banner si existe una. Desactiva con `NO_UPDATE_NOTIFIER=1` o cualquiera de los [opt-outs estándar de `update-notifier`](https://github.com/yeoman/update-notifier#user-settings).

## API HTTP completa

`purplemux api-guide` imprime la referencia HTTP API completa para cada endpoint `/api/cli/*`, incluyendo cuerpos de petición y formas de respuesta — útil cuando quieres manejar purplemux directamente desde `curl` u otro runtime.

## Siguientes pasos

- **[Puertos y variables de entorno](/purplemux/es/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` en la superficie env más amplia.
- **[Arquitectura](/purplemux/es/docs/architecture/)** — con qué está hablando realmente el CLI.
- **[Solución de problemas](/purplemux/es/docs/troubleshooting/)** — cuando el CLI dice "¿está corriendo el servidor?".
