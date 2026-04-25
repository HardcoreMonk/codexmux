---
title: Compatibilidad de navegadores
description: Matriz de compatibilidad para escritorio y móvil, con notas sobre las particularidades específicas de cada navegador.
eyebrow: Primeros pasos
permalink: /es/docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux es una app web, así que la experiencia depende del navegador donde la abras. Estas son las versiones que probamos activamente — las anteriores pueden funcionar pero no están soportadas.

## Escritorio

| Navegador | Mínimo | Notas |
|---|---|---|
| Chrome | 110+ | Recomendado. PWA + Web Push completos. |
| Edge | 110+ | Mismo motor que Chrome, mismo soporte. |
| Safari | 17+ | PWA completa en macOS Sonoma+. Web Push requiere macOS 13+ y la PWA instalada. |
| Firefox | 115+ ESR | Funciona bien. La instalación de PWA es manual (no aparece el aviso de instalación). |

Todas las funciones — terminal con xterm.js, línea de tiempo en directo, vista de sesión de Claude, panel de diff de Git — funcionan igual en estos motores.

## Móvil

| Navegador | Mínimo | Notas |
|---|---|---|
| iOS Safari | **16.4+** | Necesario para Web Push. Antes hay que **Añadir a pantalla de inicio**; el push no se dispara desde una pestaña normal. |
| Android Chrome | 110+ | Web Push funciona también desde una pestaña normal, pero recomendamos instalarlo como PWA para tener pantalla completa. |
| Samsung Internet | 22+ | Funciona. El aviso de instalación aparece automáticamente. |

{% call callout('warning', 'iOS Safari ≥ 16.4 es el límite') %}
Apple añadió Web Push a iOS solo en Safari 16.4 (marzo de 2023). Las versiones anteriores de iOS pueden seguir usando el panel, pero no recibirán notificaciones push aunque instalen la PWA.
{% endcall %}

## Requisitos de funcionalidades

purplemux se apoya en un puñado de APIs modernas del navegador. Si falta alguna, la app degrada con elegancia pero pierde la función correspondiente.

| API | Para qué se usa | Comportamiento de respaldo |
|---|---|---|
| WebSocket | E/S de terminal, sincronización de estado, línea de tiempo | Requisito obligatorio — sin alternativa. |
| Clipboard API | Copiar `npx purplemux`, copiar bloques de código | El botón se oculta si no está disponible. |
| Notifications API | Push de escritorio/móvil | Se omite — verás el estado dentro de la app. |
| Service Workers | PWA + Web Push | Se sirve solo como app web normal. |
| IntersectionObserver | Línea de tiempo en directo, animaciones de la barra de navegación | Los elementos aparecen sin animación. |
| `backdrop-filter` | Barra translúcida, modales | Se usa un fondo tintado sólido como respaldo. |
| CSS `color-mix()` + OKLCH | Variables del tema | Safari < 16.4 pierde algunos estados tintados. |

## ¿Mi navegador es compatible?

purplemux trae un autocomprobador en **Configuración → Verificación del navegador**. Ejecuta las mismas pruebas listadas arriba y muestra una insignia verde / ámbar / roja por funcionalidad, así puedes verificarlo sin leer una hoja técnica.

## Particularidades conocidas

- **Safari 17 + ventanas privadas** — IndexedDB está desactivado, así que la caché de tu espacio de trabajo no persistirá entre reinicios. Usa una ventana normal.
- **iOS Safari + pestaña en segundo plano** — los terminales se desconectan automáticamente tras unos 30 s en segundo plano. tmux mantiene la sesión real activa; la UI vuelve a conectar cuando regresas.
- **Firefox + certificado de Tailscale Serve** — si usas un nombre de tailnet personalizado que no esté en `ts.net`, Firefox puede ser más estricto con la confianza HTTPS que Chrome. Acepta el certificado una vez y se queda.
- **Certificados autofirmados** — Web Push simplemente no se registrará. Usa Tailscale Serve (Let's Encrypt automático) o un dominio real + reverse proxy.

## No soportados

- **Internet Explorer** — no soportado nunca.
- **UC Browser, Opera Mini, Puffin** — los navegadores tipo proxy rompen WebSocket. No funcionan.
- **Cualquier navegador con más de 3 años** — nuestro CSS usa color OKLCH y consultas de contenedor que necesitan un motor de 2023 en adelante.

Si tienes una configuración inusual y algo no funciona, [abre una issue](https://github.com/subicura/purplemux/issues) con tu user agent y la salida del autocomprobador.
