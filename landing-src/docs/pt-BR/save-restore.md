---
title: Salvar e restaurar layouts
description: Por que suas abas voltam exatamente onde você as deixou, mesmo após um reboot do servidor.
eyebrow: Workspaces e Terminal
permalink: /pt-BR/docs/save-restore/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux foi construído em torno da ideia de que fechar uma aba do navegador não deveria encerrar uma sessão. Duas peças trabalham juntas: o tmux mantém os shells rodando, e `~/.purplemux/workspaces.json` lembra do layout.

## O que é persistido

Tudo que você consegue ver em um workspace:

- Abas e a ordem delas
- Divisões de painéis e suas proporções
- Tipo do painel de cada aba — Terminal, Claude, Diff, Navegador web
- Diretório de trabalho de cada shell
- Grupos, nomes e ordem dos workspaces

`workspaces.json` é atualizado de forma transacional a cada mudança de layout, então o arquivo sempre reflete o estado atual. Veja [Diretório de dados](/purplemux/pt-BR/docs/data-directory/) para o mapa completo dos arquivos em disco.

## Fechando o navegador

Feche a aba, atualize, baixe a tampa do laptop. Nada disso encerra sessões.

Cada shell vive em uma sessão tmux no socket dedicado `purple` — totalmente isolado do seu `~/.tmux.conf` pessoal. Reabra `http://localhost:8022` uma hora depois e o WebSocket reconecta na mesma sessão tmux, recompõe o scrollback e devolve o PTY ativo ao xterm.js.

Você não restaura nada; você reconecta.

{% call callout('tip', 'No celular também') %}
A mesma coisa vale no celular. Feche o PWA, bloqueie o aparelho, volte amanhã — o painel reconecta com tudo no lugar.
{% endcall %}

## Recuperando após um reboot do servidor

Um reboot mata os processos tmux — eles são apenas processos do SO. O purplemux trata isso na próxima inicialização:

1. **Lê o layout** — `workspaces.json` descreve cada workspace, painel e aba.
2. **Recria sessões em paralelo** — para cada aba, uma nova sessão tmux é criada no diretório de trabalho salvo.
3. **Auto-resume do Claude** — abas que tinham uma sessão Claude rodando são reiniciadas com `claude --resume {sessionId}` para que a conversa continue de onde parou.

A parte do "paralelo" importa: se você tinha dez abas, todas as dez sessões tmux sobem ao mesmo tempo, em vez de uma após a outra. Quando você abre o navegador, o layout já está pronto.

## O que não volta

Algumas coisas não conseguem ser persistidas:

- **Estado em memória do shell** — variáveis de ambiente que você definiu, jobs em background, REPLs no meio de uma execução.
- **Prompts de permissão em andamento** — se o Claude estava aguardando uma decisão de permissão quando o servidor caiu, o prompt aparece de novo no resume.
- **Processos em primeiro plano que não sejam `claude`** — buffers do `vim`, `htop`, `docker logs -f`. O shell volta no mesmo diretório; o processo, não.

Esse é o contrato padrão do tmux: o shell sobrevive, mas os processos dentro dele não necessariamente.

## Controle manual

Você normalmente não precisa mexer nisso, mas para os curiosos:

- O socket do tmux se chama `purple`. Inspecione com `tmux -L purple ls`.
- As sessões são nomeadas `pt-{workspaceId}-{paneId}-{tabId}`.
- Editar `workspaces.json` enquanto o purplemux está rodando é inseguro — o servidor o mantém aberto e grava por cima.

Para a história mais profunda (protocolo binário, backpressure, observação de JSONL) veja [Como funciona](/purplemux/#how) na landing page.

## Próximos passos

- **[Workspaces e grupos](/purplemux/pt-BR/docs/workspaces-groups/)** — o que é salvo por workspace.
- **[Abas e painéis](/purplemux/pt-BR/docs/tabs-panes/)** — o que é salvo por aba.
- **[Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/)** — peculiaridades conhecidas em torno de abas em background no mobile e reconexões.
