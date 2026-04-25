---
title: Início rápido
description: Coloque o purplemux para rodar em menos de um minuto, com Node.js e tmux.
eyebrow: Primeiros passos
permalink: /pt-BR/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux é um multiplexador web-nativo que gerencia todas as suas sessões do Claude Code em um único painel, apoiado por `tmux` para persistência e pensado para uso tanto no desktop quanto no celular.

## Antes de começar

Você precisa de duas coisas na máquina que vai hospedar o purplemux.

- **Node.js 20 ou mais novo** — verifique com `node -v`.
- **tmux** — verifique com `tmux -V`. Qualquer versão 3.0+ serve.

{% call callout('note', 'Apenas macOS / Linux') %}
O Windows não é oficialmente suportado. O purplemux depende de `node-pty` e tmux, que não rodam nativamente no Windows. O WSL2 normalmente funciona, mas está fora do nosso escopo de testes.
{% endcall %}

## Execute

Um comando. Sem necessidade de instalação global.

```bash
npx purplemux
```

O purplemux vai subir na porta `8022`. Abra no navegador:

```
http://localhost:8022
```

Na primeira execução, um guia leva você pela criação de uma senha e do seu primeiro workspace.

{% call callout('tip') %}
Prefere uma instalação persistente? `pnpm add -g purplemux && purplemux` funciona da mesma forma. Atualizar é só rodar `pnpm up -g purplemux`.
{% endcall %}

## Abra uma sessão Claude

No painel:

1. Clique em **Nova aba** em qualquer workspace.
2. Escolha o template **Claude** (ou simplesmente rode `claude` em um terminal comum).
3. O purplemux detecta o Claude CLI em execução e começa a exibir status, a timeline ao vivo e os prompts de permissão.

A sessão persiste mesmo se você fechar o navegador — o tmux mantém o processo vivo no servidor.

## Acesse pelo celular

Por padrão, o purplemux só escuta em `localhost`. Para acesso externo seguro, use o Tailscale Serve (WireGuard + HTTPS automático, sem port forwarding):

```bash
tailscale serve --bg 8022
```

Abra `https://<máquina>.<tailnet>.ts.net` no celular, toque em **Compartilhar → Adicionar à Tela de Início**, e o purplemux vira um PWA que recebe notificações Web Push em segundo plano.

Veja [Acesso via Tailscale](/purplemux/pt-BR/docs/tailscale/) para a configuração completa, ou pule para [Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/) para detalhes de iOS e Android.

## Próximos passos

- **[Instalação](/purplemux/pt-BR/docs/installation/)** — detalhes por plataforma, app nativo do macOS, autostart.
- **[Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/)** — matriz de compatibilidade desktop e mobile.
- **[Primeira sessão](/purplemux/pt-BR/docs/first-session/)** — um tour guiado pelo painel.
- **[Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/)** — todos os atalhos em uma tabela.
