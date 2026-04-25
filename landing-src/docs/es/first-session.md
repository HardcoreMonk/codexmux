---
title: Primera sesión
description: Un recorrido guiado por el panel — desde un espacio de trabajo vacío hasta tu primera sesión de Claude, en marcha y monitorizada.
eyebrow: Primeros pasos
permalink: /es/docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux ya está en marcha (si no, consulta [Inicio rápido](/purplemux/es/docs/quickstart/)). Esta página explica qué hace realmente la UI para que los primeros minutos sean menos abstractos.

## El panel

Cuando abres `http://localhost:8022` aterrizas en un **espacio de trabajo**. Piensa en un espacio de trabajo como una carpeta con pestañas relacionadas — una para el proyecto en el que estás programando con Claude, otra para la documentación que escribes, otra para tareas puntuales en el shell.

La disposición:

- **Barra lateral izquierda** — espacios de trabajo y sesiones, insignias de estado de Claude, widget de límites de uso, notas, estadísticas.
- **Área principal** — paneles dentro del espacio actual; cada panel puede tener varias pestañas.
- **Barra superior** — nombre del espacio, controles de división, configuración.

Alterna la barra lateral en cualquier momento con <kbd>⌘B</kbd>. Cambia el modo Espacio/Sesiones en la barra lateral con <kbd>⌘⇧B</kbd>.

## Crear un espacio de trabajo

El primer arranque te crea un espacio por defecto. Para añadir otro:

1. Haz clic en **+ Nuevo espacio de trabajo** en la parte superior de la barra lateral (<kbd>⌘N</kbd>).
2. Ponle nombre y elige un directorio por defecto — ahí arrancarán los nuevos shells.
3. Pulsa Enter. Se abre el espacio vacío.

Puedes reordenar y renombrar espacios después arrastrándolos en la barra lateral.

## Abre tu primera pestaña

Un espacio de trabajo arranca vacío. Añade una pestaña con <kbd>⌘T</kbd> o el botón **+** de la barra de pestañas.

Elige una **plantilla**:

- **Terminal** — un shell vacío. Perfecto para `vim`, `docker`, scripts.
- **Claude** — arranca con `claude` ya en marcha en el shell.

{% call callout('tip', 'Las plantillas son solo atajos') %}
Por dentro, cada pestaña es un shell normal. La plantilla Claude es solo "abre una terminal y ejecuta `claude`". Si más tarde ejecutas `claude` manualmente en una pestaña Terminal, purplemux lo nota y empieza a mostrar su estado igual.
{% endcall %}

## Lee el estado de la sesión

Mira la **fila de sesión en la barra lateral** de tu pestaña. Verás uno de estos indicadores:

| Estado | Significado |
|---|---|
| **Inactivo** (gris) | Claude espera tu siguiente entrada. |
| **Ocupado** (spinner morado) | Claude está trabajando — leyendo archivos, ejecutando herramientas. |
| **Necesita entrada** (ámbar) | Claude llegó a un aviso de permisos o hizo una pregunta. |
| **Revisión** (azul) | Trabajo terminado, Claude se detuvo; hay algo que revisar. |

Las transiciones son casi instantáneas. Consulta [Estado de la sesión](/purplemux/es/docs/session-status/) para ver cómo se detecta.

## Responder a un aviso de permisos

Cuando Claude pide ejecutar una herramienta o editar un archivo, purplemux **intercepta el aviso** y lo muestra en línea dentro de la vista de la sesión. Puedes:

- Hacer clic en **1 · Sí** / **2 · Sí, siempre** / **3 · No**, o
- Pulsar las teclas numéricas, o
- Ignorarlo y responder desde el móvil — el Web Push móvil dispara la misma alerta.

El CLI de Claude nunca se queda realmente bloqueado en el aviso interceptado; purplemux le devuelve tu respuesta.

## Dividir y cambiar

Una vez tengas una pestaña en marcha, prueba:

- <kbd>⌘D</kbd> — divide el panel actual hacia la derecha
- <kbd>⌘⇧D</kbd> — divide hacia abajo
- <kbd>⌘⌥←/→/↑/↓</kbd> — mueve el foco entre divisiones
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — pestaña anterior/siguiente

Lista completa en la página [Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/).

## Guardar y restaurar

Cierra el navegador. Tus pestañas no se pierden — tmux las mantiene abiertas en el servidor. Refresca dentro de una hora (o de una semana) y purplemux restaurará exactamente la misma disposición, incluyendo las proporciones de las divisiones y los directorios de trabajo.

Incluso un reinicio del servidor es recuperable: al volver a arrancar, purplemux lee la disposición guardada en `~/.purplemux/workspaces.json`, vuelve a lanzar los shells en los directorios correctos y reconecta las sesiones de Claude cuando es posible.

## Acceder desde el móvil

Ejecuta:

```bash
tailscale serve --bg 8022
```

En el móvil, abre `https://<machine>.<tailnet>.ts.net`, toca **Compartir → Añadir a pantalla de inicio** y concede el permiso de notificaciones. Ya recibirás avisos push para los estados **necesita entrada** y **revisión** incluso con la pestaña cerrada.

Recorrido completo: [Configuración de PWA](/purplemux/es/docs/pwa-setup/) · [Web Push](/purplemux/es/docs/web-push/) · [Tailscale](/purplemux/es/docs/tailscale/).

## Siguientes pasos

- **[Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/)** — todos los atajos en una tabla.
- **[Compatibilidad de navegadores](/purplemux/es/docs/browser-support/)** — matriz de compatibilidad, sobre todo iOS Safari 16.4+.
- Explora la barra lateral: **Notas** (<kbd>⌘⇧E</kbd>) para el informe diario de IA, **Estadísticas** (<kbd>⌘⇧U</kbd>) para el análisis de uso.
