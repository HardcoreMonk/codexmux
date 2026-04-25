---
title: Suporte a navegadores
description: Matriz de compatibilidade desktop e mobile, com notas sobre as peculiaridades específicas de cada navegador.
eyebrow: Primeiros passos
permalink: /pt-BR/docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux é um app web, então a experiência depende do navegador em que você abre. Estas são as versões que testamos ativamente — versões mais antigas podem funcionar, mas não são suportadas.

## Desktop

| Navegador | Mínimo | Notas |
|---|---|---|
| Chrome | 110+ | Recomendado. PWA + Web Push completo. |
| Edge | 110+ | Mesma engine do Chrome, mesmo suporte. |
| Safari | 17+ | PWA completo no macOS Sonoma+. Web Push exige macOS 13+ e PWA instalado. |
| Firefox | 115+ ESR | Funciona bem. A instalação como PWA é manual (sem prompt automático). |

Todos os recursos — terminal xterm.js, timeline ao vivo, visualização de sessão Claude, painel de Git diff — funcionam de forma idêntica nesses motores.

## Mobile

| Navegador | Mínimo | Notas |
|---|---|---|
| iOS Safari | **16.4+** | Requisito para Web Push. É preciso **Adicionar à Tela de Início** primeiro; o push não dispara em uma aba comum. |
| Android Chrome | 110+ | Web Push funciona em aba comum também, mas recomendamos instalar como PWA para layout em tela cheia. |
| Samsung Internet | 22+ | Funciona. O prompt de instalação aparece automaticamente. |

{% call callout('warning', 'iOS Safari ≥ 16.4 é o piso') %}
A Apple só adicionou Web Push ao iOS no Safari 16.4 (março de 2023). Versões anteriores do iOS ainda conseguem usar o painel, mas não recebem notificações push, mesmo após instalar o PWA.
{% endcall %}

## Requisitos por recurso

O purplemux se apoia em algumas APIs modernas de navegador. Se alguma estiver ausente, o app degrada graciosamente, mas perde o recurso correspondente.

| API | Usada para | Fallback |
|---|---|---|
| WebSocket | I/O de terminal, sync de status, timeline | Requisito obrigatório — sem fallback. |
| Clipboard API | Copiar `npx purplemux`, copiar blocos de código | O botão fica oculto se indisponível. |
| Notifications API | Push de desktop / mobile | Pulado — você ainda vê o status no app. |
| Service Workers | PWA + Web Push | Servido apenas como app web normal. |
| IntersectionObserver | Timeline de sessão ao vivo, reveal de navegação | Elementos renderizam sem animação. |
| `backdrop-filter` | Navegação translúcida, modais | Cai para fundo sólido tonalizado. |
| CSS `color-mix()` + OKLCH | Variáveis de tema | Safari < 16.4 perde alguns estados tonalizados. |

## Meu navegador funciona?

O purplemux traz um auto-teste embutido em **Configurações → Verificação de navegador**. Ele roda as mesmas verificações listadas acima e mostra um selo verde / âmbar / vermelho por recurso, para você confirmar sem precisar ler especificações.

## Peculiaridades conhecidas

- **Safari 17 + janelas privadas** — IndexedDB fica desabilitado, então o cache de workspace não persiste entre reinícios. Use uma janela normal.
- **iOS Safari + aba em segundo plano** — terminais são automaticamente desmontados após cerca de 30s em background. O tmux mantém a sessão ativa; a UI reconecta quando você volta.
- **Firefox + certificado do Tailscale Serve** — se você usa um nome customizado de tailnet que não esteja em `ts.net`, o Firefox é mais exigente que o Chrome com a confiança de HTTPS. Aceite o certificado uma vez e ele fica.
- **Certificados autoassinados** — o Web Push simplesmente não registra. Use Tailscale Serve (Let's Encrypt automático) ou um domínio real + reverse proxy.

## Não suportados

- **Internet Explorer** — não, e nunca foi.
- **UC Browser, Opera Mini, Puffin** — navegadores baseados em proxy quebram WebSocket. Não funcionam.
- **Qualquer navegador com mais de 3 anos** — nosso CSS usa cores OKLCH e container queries, que precisam de uma engine de 2023 ou mais nova.

Se você está em uma configuração incomum e algo não funciona, por favor [abra uma issue](https://github.com/subicura/purplemux/issues) com seu user agent e o resultado do auto-teste.
