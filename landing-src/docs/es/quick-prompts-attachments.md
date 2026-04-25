---
title: Prompts rápidos y adjuntos
description: Una biblioteca de prompts guardados, drag-and-drop de imágenes, adjuntos de archivos y un historial de mensajes reutilizable — todo desde la barra de entrada bajo la línea de tiempo.
eyebrow: Claude Code
permalink: /es/docs/quick-prompts-attachments/index.html
---
{% from "docs/callouts.njk" import callout %}

La barra de entrada bajo la línea de tiempo es más que un textarea. Es donde viven los prompts guardados, los adjuntos y el historial de mensajes, para que las cosas que escribes diez veces al día dejen de costarte diez tecleos al día.

## Prompts rápidos

Los prompts rápidos son entradas cortas con nombre que se guardan en `~/.purplemux/quick-prompts.json`. Aparecen como chips encima de la barra de entrada — un clic envía el prompt como si lo hubieras escrito.

Vienen dos integrados de fábrica y se pueden desactivar en cualquier momento:

- **Commit** — ejecuta `/commit-commands:commit`
- **Simplify** — ejecuta `/simplify`

Añade los tuyos desde **Configuración → Prompts rápidos**:

1. Haz clic en **Añadir prompt**.
2. Dale un nombre (la etiqueta del chip) y un cuerpo (lo que se envía).
3. Arrastra para reordenar. Desactiva el interruptor para ocultarlo sin borrarlo.

Lo que escribes en el cuerpo se envía tal cual — incluyendo slash commands, prompts multilínea, o peticiones plantilla como "Explica el archivo abierto en el editor y sugiere una mejora."

{% call callout('tip', 'Los slash commands cuentan') %}
Los prompts rápidos funcionan muy bien como disparadores de un solo clic para los slash commands de Claude Code. Un chip "Revisar este PR" apuntando a `/review` ahorra tecleos cada vez.
{% endcall %}

## Drag-and-drop de imágenes

Suelta un archivo de imagen (PNG, JPG, WebP, etc.) en cualquier parte de la barra de entrada para adjuntarlo. purplemux sube el archivo a una ruta temporal en el servidor e inserta una referencia en tu prompt automáticamente.

También puedes:

- **Pegar** una imagen directamente desde el portapapeles
- **Hacer clic en el clip** para elegir desde un diálogo de archivos
- Adjuntar **hasta 20 archivos** por mensaje

Aparece una tira de miniaturas encima del input mientras los adjuntos están pendientes. Cada miniatura tiene una X para quitarla antes de enviar.

## Otros adjuntos de archivo

El mismo clip funciona también para archivos que no son imagen — markdown, JSON, CSV, archivos de código, lo que sea. purplemux los pone en un directorio temporal e inserta la ruta para que Claude pueda hacer `read` sobre ellos como parte de la petición.

Es la forma más fácil de compartir algo a lo que Claude no llega por sí mismo, como un stack trace pegado desde otra máquina o un archivo de configuración de otro proyecto.

## Apto para móvil

Los adjuntos y el clip son a tamaño completo en móviles. Suelta una captura desde la hoja de compartir de iOS, o usa el botón de cámara (Android) para adjuntar una foto directamente desde el carrete.

La barra de entrada se reorganiza para pantallas estrechas — los chips se convierten en un scroll horizontal, y el textarea crece hasta cinco líneas antes de desplazarse.

## Historial de mensajes

Cada prompt que has enviado en un espacio de trabajo se guarda en un historial por espacio. Para reutilizar uno:

- Pulsa <kbd>↑</kbd> con la barra de entrada vacía para ir recorriendo los mensajes recientes
- O abre el selector **Historial** para una lista buscable

Las entradas antiguas pueden borrarse desde el selector. El historial se almacena junto con otros datos del espacio en `~/.purplemux/`, nunca sale de la máquina.

## Teclado

| Tecla | Acción |
|---|---|
| <kbd>⌘I</kbd> | Enfocar el input desde cualquier parte de la vista de sesión |
| <kbd>Enter</kbd> | Enviar |
| <kbd>⇧Enter</kbd> | Insertar una nueva línea |
| <kbd>Esc</kbd> | Mientras Claude está ocupado, enviar una interrupción |
| <kbd>↑</kbd> | Retroceder por el historial de mensajes (cuando está vacío) |

## Siguientes pasos

- **[Vista de sesión en directo](/purplemux/es/docs/live-session-view/)** — donde aparecen tus prompts y las respuestas de Claude.
- **[Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/)** — la tabla completa.
- **[Avisos de permisos](/purplemux/es/docs/permission-prompts/)** — qué pasa después de enviar una petición que necesita aprobación.
