---
title: Uso y límites de tasa
description: Cuentas atrás en tiempo real de los límites de 5 horas y 7 días en la barra lateral, además de un dashboard de estadísticas con tokens, coste y desgloses por proyecto.
eyebrow: Claude Code
permalink: /es/docs/usage-rate-limits/index.html
---
{% from "docs/callouts.njk" import callout %}

Llegar al límite a mitad de tarea es la peor interrupción. purplemux trae los números de cuota de Claude Code a la barra lateral y añade un dashboard de estadísticas para que veas tu ritmo de uso de un vistazo.

## El widget de la barra lateral

Dos barras finas viven al pie de la barra lateral: **5h** y **7d**. Cada una muestra:

- El porcentaje de la ventana que has consumido
- El tiempo restante hasta el reseteo
- Una barra tenue de proyección que indica dónde acabarás si mantienes el ritmo actual

Pasa el ratón por cualquier barra para ver el desglose completo — porcentaje usado, porcentaje proyectado y hora de reseteo como duración relativa.

Los números vienen del JSON de statusline propio de Claude Code. purplemux instala un script `~/.purplemux/statusline.sh` que postea los datos al servidor local cada vez que Claude refresca su statusline; un `fs.watch` mantiene la UI sincronizada.

## Umbrales de color

Ambas barras cambian de color según el porcentaje usado:

| Usado | Color |
|---|---|
| 0–49 % | verde azulado — cómodo |
| 50–79 % | ámbar — modera el ritmo |
| 80–100 % | rojo — a punto de chocar contra el muro |

Los umbrales coinciden con el widget de límites de la página principal. Tras ver ámbar unas cuantas veces, la barra lateral se convierte en una herramienta periférica de cadencia — dejas de notarla conscientemente, pero empiezas a repartir el trabajo entre ventanas.

{% call callout('tip', 'La proyección le gana al porcentaje') %}
La barra tenue detrás de la sólida es una proyección — si sigues al ritmo actual, ahí estarás cuando se resetee. Ver la proyección cruzar el 80 % mucho antes que el uso real es la alerta temprana más limpia.
{% endcall %}

## El dashboard de estadísticas

Abre el dashboard desde la barra lateral (o con <kbd>⌘⇧U</kbd>). Cinco secciones, de arriba abajo:

### Tarjetas de visión general

Cuatro tarjetas: **Total de sesiones**, **Coste total**, **Coste de hoy**, **Coste de este mes**. Cada tarjeta muestra el cambio frente al periodo anterior en verde o rojo.

### Uso de tokens por modelo

Un gráfico de barras apiladas por día, desglosado por modelo y por tipo de token — entrada, salida, lecturas de caché, escrituras de caché. La leyenda de modelos usa los nombres mostrados de Claude (Opus / Sonnet / Haiku) y el mismo tratamiento de color que las barras de la barra lateral.

Es el sitio más fácil para ver, por ejemplo, que un pico de coste inesperado fue un día con mucho Opus, o que las lecturas de caché están haciendo la mayor parte del trabajo.

### Desglose por proyecto

Una tabla con cada proyecto de Claude Code (directorio de trabajo) que has usado, con sesiones, mensajes, tokens y coste. Haz clic en una fila para ver un gráfico por día solo de ese proyecto.

Útil para máquinas compartidas o para separar trabajo de cliente del personal.

### Actividad y rachas

Un gráfico de área de actividad diaria de 30 días, más cuatro métricas de racha:

- **Racha más larga** — tu récord de días laborables consecutivos
- **Racha actual** — cuántos días llevas trabajando seguidos ahora mismo
- **Total de días activos** — conteo en el periodo
- **Promedio de sesiones por día**

### Línea de tiempo semanal

Una rejilla día × hora que muestra cuándo usaste Claude la última semana. Las sesiones concurrentes se apilan visualmente, así que un martes de "cinco sesiones a las 3 pm" es fácil de detectar.

## De dónde vienen los datos

Todo en el dashboard se calcula localmente desde los JSONLs de sesión propios de Claude Code en `~/.claude/projects/`. purplemux los lee, cachea los conteos parseados en `~/.purplemux/stats/` y nunca envía un byte fuera de la máquina. Cambiar de idioma o regenerar la caché no llega a ninguna parte.

## Comportamiento del reseteo

Las ventanas de 5 horas y 7 días son rodantes y están atadas a tu cuenta de Claude Code. Cuando una ventana se resetea, la barra cae a 0 % y el porcentaje y tiempo restante se recalculan desde el siguiente timestamp de reseteo. Si purplemux se perdió el reseteo (servidor apagado), el widget se autocorrige en el siguiente tick de statusline.

## Siguientes pasos

- **[Notas (informe diario de IA)](/purplemux/es/docs/notes-daily-report/)** — los mismos datos, redactados como un brief diario.
- **[Estado de la sesión](/purplemux/es/docs/session-status/)** — la otra cosa que la barra lateral rastrea por pestaña.
- **[Atajos de teclado](/purplemux/es/docs/keyboard-shortcuts/)** — incluyendo <kbd>⌘⇧U</kbd> para estadísticas.
