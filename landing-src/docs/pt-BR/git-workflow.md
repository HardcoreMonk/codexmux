---
title: Painel de Git workflow
description: Um visualizador de diff, navegador de histórico e controles de sync que ficam ao lado do seu terminal — com um repasse em um clique para o Claude quando algo dá errado.
eyebrow: Workspaces e Terminal
permalink: /pt-BR/docs/git-workflow/index.html
---
{% from "docs/callouts.njk" import callout %}

O painel de Git é um tipo de aba, igual a um terminal. Abra ao lado de uma sessão Claude e você consegue ler mudanças, percorrer o histórico e dar push sem sair do painel. Quando o próprio git complica, o "Pergunte ao Claude" entrega o problema a uma sessão em um clique.

## Abrindo o painel

Adicione uma nova aba e escolha **Diff** como tipo de painel, ou troque para ele pelo menu de tipo de aba em uma aba existente. O painel é vinculado ao mesmo diretório de trabalho dos shells irmãos — se sua aba está em `~/code/api`, o painel de diff lê esse repositório.

| Ação | macOS | Linux / Windows |
|---|---|---|
| Trocar a aba ativa para o modo Diff | <kbd>⌘⇧F</kbd> | <kbd>Ctrl+Shift+F</kbd> |

Se o diretório não for um repositório git, o painel avisa e fica fora do caminho.

## O visualizador de diff

A aba Mudanças mostra as alterações da working tree por arquivo.

- **Lado a lado ou inline** — alterne no cabeçalho do painel. Lado a lado replica a visualização split do GitHub; inline replica a visualização unificada.
- **Realce de sintaxe** — detecção completa para as linguagens que seu editor destacaria.
- **Expansão inline de hunks** — clique em linhas de contexto ao redor de um hunk para expandir o código vizinho sem sair do painel.
- **Lista de arquivos** — navegue entre os arquivos modificados pela barra lateral do painel.

As mudanças se atualizam a cada 10 segundos enquanto o painel está visível, e imediatamente quando você salva em outra ferramenta.

## Histórico de commits

Vá para a aba **Histórico** para um log paginado de commits no branch atual. Cada entrada mostra hash, assunto, autor e horário; clique para ver o diff que entrou nesse commit. Útil quando você quer relembrar por que um arquivo está do jeito que está, sem precisar voltar ao terminal para `git log`.

## Painel de sync

A faixa do cabeçalho mostra o branch atual, o upstream e um contador de ahead/behind. Três ações:

- **Fetch** — `git fetch` contra o upstream a cada 3 minutos em background, mais o sob demanda.
- **Pull** — fast-forward quando possível.
- **Push** — empurra para o upstream configurado.

O sync é intencionalmente restrito. Ele recusa qualquer coisa que precise de uma decisão — branches divergentes, working tree suja, upstream ausente — e te diz por quê.

{% call callout('warning', 'Quando o sync não vai') %}
Falhas comuns que o painel reporta com clareza:

- **Sem upstream** — `git push -u` ainda não foi executado.
- **Auth** — credenciais ausentes ou rejeitadas.
- **Diverged** — local e remoto têm commits únicos; rebase ou merge primeiro.
- **Mudanças locais** — trabalho não commitado bloqueia o pull.
- **Rejeitado** — push rejeitado por não ser fast-forward.
{% endcall %}

## Pergunte ao Claude

Quando o sync falha, o toast de erro oferece um botão **Pergunte ao Claude**. Ao clicar, ele encaminha o contexto da falha — o tipo de erro, o output relevante do `git` e o estado atual do branch — para a aba Claude do mesmo workspace, como prompt. O Claude então conduz a recuperação: rebase, resolução de conflitos, configuração do upstream, o que o erro pediu.

Essa é a aposta principal do painel: ferramentas para o caso comum, um LLM para a cauda longa. Você não troca de contexto; o prompt chega exatamente na sessão que você ia usar de qualquer forma.

## Próximos passos

- **[Abas e painéis](/purplemux/pt-BR/docs/tabs-panes/)** — dividindo o painel de diff ao lado de uma sessão Claude.
- **[Primeira sessão](/purplemux/pt-BR/docs/first-session/)** — como os prompts de permissão do Claude aparecem no painel.
- **[Painel de navegador web](/purplemux/pt-BR/docs/web-browser-panel/)** — o outro tipo de painel que vale rodar lado a lado com um terminal.
