---
title: Primeira sessão
description: Um tour guiado pelo painel — de um workspace em branco à sua primeira sessão Claude, rodando e monitorada.
eyebrow: Primeiros passos
permalink: /pt-BR/docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux já está rodando (se ainda não, veja o [Início rápido](/purplemux/pt-BR/docs/quickstart/)). Esta página percorre o que a UI realmente faz, para que os primeiros minutos pareçam menos abstratos.

## O painel

Quando você abre `http://localhost:8022`, cai em um **workspace**. Pense em um workspace como uma pasta de abas relacionadas — uma para o projeto em que você está fazendo Claude-coding, outra para a documentação que está escrevendo, outra para trabalhos pontuais no shell.

O layout:

- **Barra lateral à esquerda** — workspaces e sessões, badges de status do Claude, widget de rate-limit, notas, estatísticas
- **Área principal** — painéis dentro do workspace atual; cada painel pode ter várias abas
- **Barra superior** — nome do workspace, controles de divisão, configurações

Alterne a barra lateral a qualquer momento com <kbd>⌘B</kbd>. Mude o modo Workspace/Sessões na barra lateral com <kbd>⌘⇧B</kbd>.

## Crie um workspace

A primeira execução já entrega um workspace padrão. Para adicionar outro:

1. Clique em **+ Novo workspace** no topo da barra lateral (<kbd>⌘N</kbd>).
2. Dê um nome e escolha um diretório padrão — é onde os shells de novas abas vão começar.
3. Pressione Enter. O workspace vazio se abre.

Você pode reordenar e renomear workspaces depois, arrastando na barra lateral.

## Abra sua primeira aba

Um workspace começa vazio. Adicione uma aba com <kbd>⌘T</kbd> ou pelo botão **+** na barra de abas.

Escolha um **template**:

- **Terminal** — um shell em branco. Bom para `vim`, `docker`, scripts.
- **Claude** — começa com `claude` já rodando no shell.

{% call callout('tip', 'Templates são apenas atalhos') %}
Por baixo dos panos, toda aba é um shell comum. O template Claude é só "abre um terminal e roda `claude`". Se mais tarde você rodar `claude` manualmente em uma aba Terminal, o purplemux percebe e começa a exibir o status do mesmo jeito.
{% endcall %}

## Leia o status da sessão

Olhe a **linha da sessão na barra lateral** correspondente à sua aba. Você verá um destes indicadores:

| Estado | Significado |
|---|---|
| **Idle** (cinza) | O Claude está esperando seu próximo input. |
| **Busy** (spinner roxo) | O Claude está trabalhando — lendo arquivos, executando ferramentas. |
| **Needs input** (âmbar) | O Claude bateu em um prompt de permissão ou fez uma pergunta. |
| **Review** (azul) | Trabalho concluído, Claude parou; tem algo para você conferir. |

As transições são quase instantâneas. Veja [Status da sessão](/purplemux/pt-BR/docs/session-status/) para entender como isso é detectado.

## Responda a um prompt de permissão

Quando o Claude pede para rodar uma ferramenta ou editar um arquivo, o purplemux **intercepta o prompt** e o exibe inline na visualização de sessão. Você pode:

- Clicar em **1 · Sim** / **2 · Sim, sempre** / **3 · Não**, ou
- Pressionar as teclas de número no teclado, ou
- Ignorar e responder pelo celular — o Web Push mobile dispara o mesmo alerta.

O CLI do Claude nunca de fato fica travado no prompt interceptado; o purplemux devolve a sua resposta.

## Divida e alterne

Com uma aba aberta, experimente:

- <kbd>⌘D</kbd> — divide o painel atual à direita
- <kbd>⌘⇧D</kbd> — divide para baixo
- <kbd>⌘⌥←/→/↑/↓</kbd> — move o foco entre divisões
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — aba anterior / próxima

Lista completa em [Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/).

## Salvar e restaurar

Feche o navegador. Suas abas não vão a lugar nenhum — o tmux as mantém vivas no servidor. Volte daqui a uma hora (ou uma semana), e o purplemux restaura o layout exato, incluindo proporções de divisão e diretórios de trabalho.

Até um reboot do servidor é recuperável: ao reiniciar, o purplemux lê o layout salvo em `~/.purplemux/workspaces.json`, relança shells nos diretórios certos e reconecta sessões Claude quando possível.

## Acesse pelo celular

Rode:

```bash
tailscale serve --bg 8022
```

No celular, abra `https://<máquina>.<tailnet>.ts.net`, toque em **Compartilhar → Adicionar à Tela de Início** e conceda permissão para notificações. Agora você recebe alertas push para os estados **needs-input** e **review** mesmo com a aba fechada.

Passo a passo completo: [Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/) · [Web Push](/purplemux/pt-BR/docs/web-push/) · [Tailscale](/purplemux/pt-BR/docs/tailscale/).

## Próximos passos

- **[Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/)** — todos os atalhos em uma tabela.
- **[Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/)** — matriz de compatibilidade, em especial iOS Safari 16.4+.
- Explore a barra lateral: **Notas** (<kbd>⌘⇧E</kbd>) para o relatório diário com IA, **Estatísticas** (<kbd>⌘⇧U</kbd>) para análises de uso.
