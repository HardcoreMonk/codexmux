---
title: Workspaces e grupos
description: Organize abas relacionadas em workspaces e depois agrupe workspaces em grupos arrastáveis na barra lateral.
eyebrow: Workspaces e Terminal
permalink: /pt-BR/docs/workspaces-groups/index.html
---
{% from "docs/callouts.njk" import callout %}

Um workspace é uma pasta de abas relacionadas — terminal, painel de diff e sessão Claude do mesmo projeto convivem ali. Quando você passa a ter vários, os grupos da barra lateral mantêm tudo organizado.

## O que um workspace contém

Cada workspace tem o seu próprio:

- **Diretório padrão** — onde os shells de novas abas começam.
- **Abas e painéis** — terminais, sessões Claude, painéis de diff, painéis de navegador web.
- **Layout** — proporções de divisão, foco, a aba ativa em cada painel.

Tudo isso é persistido em `~/.purplemux/workspaces.json`, então o workspace é a unidade que o purplemux salva e restaura. Fechar o navegador não desfaz um workspace; o tmux mantém os shells abertos e o layout permanece.

## Crie um workspace

A primeira execução entrega um workspace padrão. Para adicionar outro:

1. Clique em **+ Novo workspace** no topo da barra lateral, ou pressione <kbd>⌘N</kbd>.
2. Dê um nome e escolha um diretório padrão — geralmente a raiz do repositório do projeto.
3. Pressione Enter. O workspace vazio se abre.

{% call callout('tip', 'Escolha o diretório inicial certo') %}
O diretório padrão é o cwd de todo shell novo neste workspace. Se você apontar para a raiz do projeto, cada nova aba está a uma tecla de distância de `pnpm dev`, `git status`, ou de iniciar uma sessão Claude no lugar certo.
{% endcall %}

## Renomear e excluir

Na barra lateral, clique com o botão direito em um workspace (ou use o menu kebab) para **Renomear** e **Excluir**. Renomear também está atalho em <kbd>⌘⇧R</kbd> para o workspace ativo.

Excluir um workspace fecha suas sessões tmux e o remove de `workspaces.json`. Não há desfazer. Abas que já tinham caído ou sido fechadas continuam fora; abas vivas são finalizadas de forma limpa.

## Alterne entre workspaces

Clique em qualquer workspace na barra lateral, ou use a linha de números:

| Ação | macOS | Linux / Windows |
|---|---|---|
| Ir para o workspace 1–9 | <kbd>⌘1</kbd> – <kbd>⌘9</kbd> | <kbd>Ctrl+1</kbd> – <kbd>Ctrl+9</kbd> |
| Alternar a barra lateral | <kbd>⌘B</kbd> | <kbd>Ctrl+B</kbd> |
| Alternar o modo da barra lateral (Workspace ↔ Sessões) | <kbd>⌘⇧B</kbd> | <kbd>Ctrl+Shift+B</kbd> |

A ordem na barra lateral é a ordem que as teclas de número seguem. Arraste um workspace para cima ou para baixo para mudar a posição que ele ocupa.

## Agrupe workspaces

Quando tiver alguns workspaces, junte-os em grupos via arrastar e soltar na barra lateral. Um grupo é um cabeçalho recolhível — útil para separar "trabalho do cliente", "projetos paralelos" e "ops" sem comprimir tudo em uma lista plana.

- **Crie um grupo** — arraste um workspace sobre outro e a barra lateral oferece agrupá-los.
- **Renomeie** — clique com o botão direito no cabeçalho do grupo.
- **Reordene** — arraste grupos para cima e para baixo, e arraste workspaces para dentro e para fora.
- **Recolha** — clique no chevron no cabeçalho do grupo.

Grupos são organização visual. Eles não mudam como as abas persistem nem como os atalhos se comportam; <kbd>⌘1</kbd> – <kbd>⌘9</kbd> ainda percorrem a ordem plana de cima para baixo.

## Onde fica em disco

Toda mudança grava em `~/.purplemux/workspaces.json`. Você pode inspecionar ou fazer backup — veja [Diretório de dados](/purplemux/pt-BR/docs/data-directory/) para a estrutura completa do arquivo. Se você apagá-lo com o servidor rodando, o purplemux cai de volta para um workspace vazio e recomeça.

## Próximos passos

- **[Abas e painéis](/purplemux/pt-BR/docs/tabs-panes/)** — dividir, reordenar e focar dentro de um workspace.
- **[Salvar e restaurar layouts](/purplemux/pt-BR/docs/save-restore/)** — como os workspaces sobrevivem ao fechamento do navegador e ao reboot do servidor.
- **[Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/)** — a tabela completa de bindings.
