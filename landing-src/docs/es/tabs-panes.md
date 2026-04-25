---
title: Pestañas y paneles
description: Cómo funcionan las pestañas dentro de un espacio de trabajo, cómo dividir paneles y los atajos para mover el foco entre ellos.
eyebrow: Espacios de trabajo y terminal
permalink: /es/docs/tabs-panes/index.html
---
{% from "docs/callouts.njk" import callout %}

Un espacio de trabajo se divide en **paneles**, y cada panel contiene una pila de **pestañas**. Las divisiones te dan vistas paralelas; las pestañas permiten que un mismo panel aloje varios shells sin robar espacio en pantalla.

## Pestañas

Cada pestaña es un shell real anclado a una sesión de tmux. El título de la pestaña proviene del proceso en primer plano — escribe `vim` y la pestaña se renombra; sal y vuelve al nombre del directorio.

| Acción | macOS | Linux / Windows |
|---|---|---|
| Nueva pestaña | <kbd>⌘T</kbd> | <kbd>Ctrl+T</kbd> |
| Cerrar pestaña | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| Pestaña anterior | <kbd>⌘⇧[</kbd> | <kbd>Ctrl+Shift+[</kbd> |
| Pestaña siguiente | <kbd>⌘⇧]</kbd> | <kbd>Ctrl+Shift+]</kbd> |
| Ir a pestaña 1–9 | <kbd>⌃1</kbd> – <kbd>⌃9</kbd> | <kbd>Alt+1</kbd> – <kbd>Alt+9</kbd> |

Arrastra una pestaña dentro de la barra de pestañas para reordenarla. El botón **+** al final de la barra abre el mismo selector de plantilla que <kbd>⌘T</kbd>.

{% call callout('tip', 'Plantillas más allá de Terminal') %}
El menú de nueva pestaña te deja elegir **Terminal**, **Claude**, **Diff** o **Navegador web** como tipo de panel. Todas son pestañas — puedes mezclarlas en el mismo panel y alternar entre ellas con los atajos de arriba.
{% endcall %}

## Dividir paneles

Las pestañas comparten espacio de pantalla. Para ver dos cosas a la vez, divide el panel.

| Acción | macOS | Linux / Windows |
|---|---|---|
| Dividir a la derecha | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> |
| Dividir abajo | <kbd>⌘⇧D</kbd> | <kbd>Ctrl+Shift+D</kbd> |

Una nueva división hereda el directorio por defecto del espacio y empieza con una pestaña de terminal vacía. Cada panel tiene su propia barra de pestañas, así que el panel de la derecha puede alojar el visor de diff mientras el de la izquierda ejecuta `claude`.

## Mover el foco entre paneles

Usa los atajos direccionales — recorren el árbol de divisiones, así que <kbd>⌘⌥→</kbd> desde un panel anidado profundamente sigue aterrizando en el visualmente adyacente.

| Acción | macOS | Linux / Windows |
|---|---|---|
| Foco a la izquierda | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| Foco a la derecha | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| Foco arriba | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| Foco abajo | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |

## Redimensionar y equilibrar

Arrastra el separador entre paneles para ajustar finamente, o usa el teclado.

| Acción | macOS | Linux / Windows |
|---|---|---|
| Redimensionar izquierda | <kbd>⌘⌃⇧←</kbd> | <kbd>Ctrl+Alt+Shift+←</kbd> |
| Redimensionar derecha | <kbd>⌘⌃⇧→</kbd> | <kbd>Ctrl+Alt+Shift+→</kbd> |
| Redimensionar arriba | <kbd>⌘⌃⇧↑</kbd> | <kbd>Ctrl+Alt+Shift+↑</kbd> |
| Redimensionar abajo | <kbd>⌘⌃⇧↓</kbd> | <kbd>Ctrl+Alt+Shift+↓</kbd> |
| Igualar divisiones | <kbd>⌘⌥=</kbd> | <kbd>Ctrl+Alt+=</kbd> |

Igualar es la forma más rápida de reiniciar una disposición que se ha desplazado a extremos inutilizables.

## Limpiar la pantalla

<kbd>⌘K</kbd> limpia la terminal del panel actual, igual que la mayoría de terminales nativos. El proceso del shell sigue corriendo; solo se borra el buffer visible.

| Acción | macOS | Linux / Windows |
|---|---|---|
| Limpiar pantalla | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> |

## Las pestañas sobreviven a todo

Cerrar una pestaña mata su sesión de tmux. Cerrar el *navegador*, refrescar o perder la red, no — todas las pestañas siguen corriendo en el servidor. Vuelve a abrir y los mismos paneles, divisiones y pestañas regresan.

Para la historia de recuperación tras un reinicio del servidor, consulta [Guardar y restaurar disposiciones](/purplemux/es/docs/save-restore/).

## Siguientes pasos

- **[Guardar y restaurar disposiciones](/purplemux/es/docs/save-restore/)** — cómo se mantiene esta disposición.
- **[Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/)** — todos los atajos en una sola tabla.
- **[Panel de flujo de Git](/purplemux/es/docs/git-workflow/)** — un tipo de pestaña útil para colocar en una división.
