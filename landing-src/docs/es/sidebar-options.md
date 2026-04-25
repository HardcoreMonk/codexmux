---
title: Barra lateral y opciones de Claude
description: Reordena y oculta atajos de la barra lateral, gestiona la biblioteca de prompts rápidos y alterna los flags del CLI de Claude.
eyebrow: Personalización
permalink: /es/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

La barra lateral y la barra de entrada están hechas de pequeñas listas que puedes reformar — enlaces de atajos en el pie de la barra lateral, botones de prompt encima del input. La pestaña Claude en Configuración tiene los interruptores a nivel de CLI para las sesiones que lances desde el panel.

## Elementos de la barra lateral

Configuración (<kbd>⌘,</kbd>) → pestaña **Barra lateral**. La lista controla la fila de atajos que vive en el pie de la barra lateral — enlaces a dashboards, herramientas internas, cualquier cosa direccionable por URL.

Cada fila tiene un asa, nombre, URL y un interruptor. Puedes:

- **Arrastrar** el asa para reordenar. Tanto los integrados como los personalizados se mueven libremente.
- **Alternar** el interruptor para ocultar un elemento sin borrarlo.
- **Editar** elementos personalizados (icono de lápiz) — cambia nombre, icono o URL.
- **Borrar** elementos personalizados (icono de papelera).
- **Restablecer por defecto** — restaura los integrados, borra los personalizados, limpia el orden.

### Añadir un elemento personalizado

Haz clic en **Añadir elemento** abajo. Verás un pequeño formulario:

- **Nombre** — aparece como tooltip y etiqueta.
- **Icono** — elegido de una galería buscable de lucide-react.
- **URL** — cualquier `http(s)://...` funciona. Grafana interno, dashboards de Vercel, una herramienta de admin.

Haz clic en Guardar y la fila aparece al final de la lista. Arrástrala donde quieras.

{% call callout('note', 'Los integrados se ocultan, no se borran') %}
Los elementos integrados (los que trae purplemux) solo tienen interruptor y asa — sin editar ni borrar. Siempre están ahí por si cambias de opinión. Los personalizados llevan el kit completo.
{% endcall %}

## Prompts rápidos

Configuración → pestaña **Prompts rápidos**. Son los botones que viven encima del campo de input de Claude — un solo clic envía un mensaje pre-armado.

Mismo patrón que los elementos de la barra lateral:

- Arrastra para reordenar.
- Alterna para ocultar.
- Edita / borra prompts personalizados.
- Restablecer por defecto.

Al añadir un prompt te pide un **nombre** (la etiqueta del botón) y el **prompt** en sí (texto multilínea). Úsalos para cosas que escribes a menudo: "Ejecuta el suite de tests", "Resume el último commit", "Revisa el diff actual".

## Opciones del CLI de Claude

Configuración → pestaña **Claude**. Estos flags afectan *cómo lanza purplemux el CLI de Claude* en pestañas nuevas — no cambian el comportamiento de una sesión ya en marcha.

### Saltar verificación de permisos

Añade `--dangerously-skip-permissions` al comando `claude`. Claude ejecutará herramientas y editará archivos sin pedir aprobación cada vez.

Es el mismo flag que expone el CLI oficial — purplemux no relaja ninguna seguridad sobre él. Lee la [documentación de Anthropic](https://docs.anthropic.com/en/docs/claude-code/cli-reference) antes de activarlo. Trátalo como opt-in solo para espacios de trabajo de confianza.

### Mostrar terminal con Claude

Cuando está **on** (por defecto): una pestaña de Claude muestra la vista de sesión en directo *y* el panel de terminal subyacente lado a lado, así puedes saltar al shell cuando quieras.

Cuando está **off**: las pestañas nuevas de Claude se abren con la terminal colapsada. La vista de sesión llena todo el panel. Aún puedes expandir la terminal manualmente por pestaña; esto solo cambia el por defecto para pestañas recién creadas.

Usa el ajuste off si manejas Claude principalmente por la línea de tiempo y quieres un por defecto más limpio.

## Siguientes pasos

- **[Temas y fuentes](/purplemux/es/docs/themes-fonts/)** — claro, oscuro, sistema; presets de tamaño de fuente.
- **[Integración con el editor](/purplemux/es/docs/editor-integration/)** — conecta VS Code, Cursor, code-server.
- **[Primera sesión](/purplemux/es/docs/first-session/)** — repaso de la disposición del panel.
