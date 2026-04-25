---
title: Espacios de trabajo y grupos
description: Organiza pestañas relacionadas en espacios de trabajo y agrupa los espacios en la barra lateral con drag-and-drop.
eyebrow: Espacios de trabajo y terminal
permalink: /es/docs/workspaces-groups/index.html
---
{% from "docs/callouts.njk" import callout %}

Un espacio de trabajo es una carpeta de pestañas relacionadas — la terminal, el panel de diff y la sesión de Claude de un mismo proyecto, todo junto. Cuando ya tienes varios, los grupos en la barra lateral los mantienen ordenados.

## Qué contiene un espacio de trabajo

Cada espacio de trabajo tiene su propio:

- **Directorio por defecto** — donde arrancan los shells de las nuevas pestañas.
- **Pestañas y paneles** — terminales, sesiones de Claude, paneles de diff, paneles de navegador web.
- **Disposición** — proporciones de las divisiones, foco, pestaña activa de cada panel.

Todo se persiste en `~/.purplemux/workspaces.json`, así que un espacio de trabajo es la unidad que purplemux guarda y restaura. Cerrar el navegador no disuelve un espacio; tmux mantiene los shells abiertos y la disposición intacta.

## Crear un espacio de trabajo

El primer arranque te da un espacio por defecto. Para añadir otro:

1. Haz clic en **+ Nuevo espacio de trabajo** en lo alto de la barra lateral, o pulsa <kbd>⌘N</kbd>.
2. Ponle nombre y elige un directorio por defecto — normalmente la raíz del repositorio del proyecto.
3. Pulsa Enter. Se abre el espacio vacío.

{% call callout('tip', 'Elige el directorio inicial correcto') %}
El directorio por defecto es el cwd de cada nuevo shell de este espacio. Si apuntas a la raíz del proyecto, cada pestaña recién creada está a una pulsación de `pnpm dev`, `git status` o de iniciar una sesión de Claude en el sitio correcto.
{% endcall %}

## Renombrar y borrar

En la barra lateral, haz clic derecho sobre un espacio (o usa el menú de tres puntos) para **Renombrar** y **Borrar**. Renombrar también está asignado a <kbd>⌘⇧R</kbd> para el espacio activo.

Borrar un espacio cierra sus sesiones de tmux y lo elimina de `workspaces.json`. No hay deshacer. Las pestañas que ya estaban cerradas o caídas siguen así; las activas se cierran limpiamente.

## Cambiar de espacio de trabajo

Haz clic en cualquier espacio de la barra lateral, o usa la fila de números:

| Acción | macOS | Linux / Windows |
|---|---|---|
| Cambiar al espacio 1–9 | <kbd>⌘1</kbd> – <kbd>⌘9</kbd> | <kbd>Ctrl+1</kbd> – <kbd>Ctrl+9</kbd> |
| Mostrar/ocultar barra lateral | <kbd>⌘B</kbd> | <kbd>Ctrl+B</kbd> |
| Cambiar modo de la barra lateral (Espacio ↔ Sesiones) | <kbd>⌘⇧B</kbd> | <kbd>Ctrl+Shift+B</kbd> |

El orden en la barra lateral es el orden al que se asignan las teclas numéricas. Arrastra un espacio hacia arriba o abajo para cambiar la posición que ocupa.

## Agrupar espacios

Cuando tienes varios espacios, agrúpalos arrastrándolos y soltándolos en la barra lateral. Un grupo es un encabezado plegable — útil para separar "trabajo de cliente", "proyectos paralelos" y "ops" sin meterlos en una lista plana.

- **Crear un grupo** — arrastra un espacio sobre otro y la barra lateral te ofrecerá agruparlos.
- **Renombrar** — haz clic derecho sobre el encabezado del grupo.
- **Reordenar** — arrastra grupos arriba o abajo, mueve espacios dentro y fuera.
- **Plegar** — haz clic en el chevrón del encabezado del grupo.

Los grupos son organización visual. No cambian cómo se persisten las pestañas ni cómo funcionan los atajos; <kbd>⌘1</kbd> – <kbd>⌘9</kbd> sigue recorriendo el orden plano de arriba abajo.

## Dónde vive en disco

Cada cambio se escribe en `~/.purplemux/workspaces.json`. Puedes inspeccionarlo o respaldarlo — consulta [Directorio de datos](/purplemux/es/docs/data-directory/) para la disposición completa de archivos. Si lo borras mientras el servidor está en marcha, purplemux vuelve a un espacio vacío y empieza de cero.

## Siguientes pasos

- **[Pestañas y paneles](/purplemux/es/docs/tabs-panes/)** — divide, reordena y enfoca dentro de un espacio.
- **[Guardar y restaurar disposiciones](/purplemux/es/docs/save-restore/)** — cómo sobreviven los espacios al cierre del navegador y al reinicio del servidor.
- **[Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/)** — la tabla completa.
