---
title: Prompts de permissão
description: Como o purplemux intercepta os diálogos "posso rodar isto?" do Claude Code e te deixa aprovar pelo painel, pelo teclado ou pelo celular.
eyebrow: Claude Code
permalink: /pt-BR/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Por padrão, o Claude Code bloqueia em diálogos de permissão — para chamadas de ferramenta, escrita em arquivos e similares. O purplemux captura esses diálogos no momento em que aparecem e os roteia para o dispositivo que estiver mais perto de você.

## O que é interceptado

O Claude Code dispara um hook `Notification` por vários motivos. O purplemux só trata dois tipos de notificação como prompts de permissão:

- `permission_prompt` — o diálogo padrão "Permitir que esta ferramenta rode?"
- `worker_permission_prompt` — o mesmo, vindo de um sub-agente

Qualquer outra coisa (lembretes de inatividade etc.) é ignorada do lado do status e não vira a aba para **needs-input** nem dispara push.

## O que acontece quando um dispara

1. O Claude Code emite um hook `Notification`. O script de shell em `~/.purplemux/status-hook.sh` dá POST do evento e do tipo de notificação para o servidor local.
2. O servidor vira o estado da aba para **needs-input** (pulso âmbar) e propaga a mudança pelo WebSocket de status.
3. O painel renderiza o prompt **inline na timeline**, com as mesmas opções que o Claude ofereceu — sem modal, sem troca de contexto.
4. Se você concedeu permissão de notificações, dispara um Web Push e/ou notificação de desktop para `needs-input`.

O CLI do Claude continua aguardando no stdin. O purplemux está lendo as opções do prompt pelo tmux e devolvendo a sua escolha quando você seleciona uma.

## Como responder

Três caminhos equivalentes:

- **Clicar** na opção dentro da timeline.
- **Pressionar o número** — <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> — correspondente ao índice da opção.
- **Tocar no push** no celular, que faz deep-link direto para o prompt; escolha por ali.

Assim que você seleciona, o purplemux envia o input ao tmux, a aba transita de volta para **busy** e o Claude continua de onde estava. Você não precisa confirmar mais nada — o clique *é* a confirmação.

{% call callout('tip', 'Prompts consecutivos atualizam automaticamente') %}
Se o Claude faz várias perguntas em sequência, o prompt inline re-renderiza com as novas opções assim que a próxima `Notification` chega. Você não precisa dispensar a anterior.
{% endcall %}

## Fluxo mobile

Com o PWA instalado e notificações concedidas, o Web Push dispara independentemente da aba do navegador estar aberta, em background ou fechada:

- A notificação diz "Input Required" e identifica a sessão.
- Tocar nela abre o purplemux focado naquela aba.
- O prompt inline já está renderizado; escolha uma opção com um toque.

Esse é o motivo principal para configurar [Tailscale + PWA](/purplemux/pt-BR/docs/quickstart/#acesse-pelo-celular) — assim as aprovações te seguem para fora da mesa.

## Quando as opções não podem ser parseadas

Em casos raros (um prompt que rolou para fora do scrollback do tmux antes do purplemux conseguir lê-lo), a lista de opções volta vazia. A timeline mostra um cartão "não foi possível ler o prompt" e tenta de novo até quatro vezes com backoff. Se ainda assim falhar, troque para o modo **Terminal** dessa aba e responda no CLI cru — o processo Claude por baixo continua aguardando.

## E os lembretes de idle?

Os outros tipos de notificação do Claude — por exemplo, lembretes de inatividade — ainda chegam ao endpoint de hook. O servidor os registra, mas não muda o estado da aba, não dispara push e não exibe prompt na UI. Isso é proposital: só eventos que *bloqueiam* o Claude precisam da sua atenção.

## Próximos passos

- **[Status da sessão](/purplemux/pt-BR/docs/session-status/)** — o que o estado **needs-input** significa e como é detectado.
- **[Visualização de sessão ao vivo](/purplemux/pt-BR/docs/live-session-view/)** — onde o prompt inline é renderizado.
- **[Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/)** — requisitos de Web Push (especialmente iOS Safari 16.4+).
