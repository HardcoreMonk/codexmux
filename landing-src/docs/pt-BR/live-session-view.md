---
title: Visualização de sessão ao vivo
description: O que o painel de timeline mostra de fato — mensagens, chamadas de ferramenta, tarefas e prompts dispostos como eventos, em vez de scrollback de CLI.
eyebrow: Claude Code
permalink: /pt-BR/docs/live-session-view/index.html
---
{% from "docs/callouts.njk" import callout %}

Quando uma aba está rodando o Claude Code, o purplemux substitui a visualização de terminal crua por uma timeline estruturada. Mesma sessão, mesma transcrição JSONL — mas disposta como eventos discretos que você pode escanear, rolar e linkar.

## Por que uma timeline supera o scrollback

O CLI do Claude é interativo. Olhar o que ele fez quinze minutos atrás em um terminal significa rolar por tudo que aconteceu desde então, ler linhas quebradas e adivinhar onde uma chamada de ferramenta termina e a próxima começa.

A timeline mantém os mesmos dados e adiciona estrutura:

- Uma linha por mensagem, chamada de ferramenta, tarefa ou prompt
- Inputs e outputs de ferramenta agrupados juntos
- Âncoras permanentes — eventos não somem do topo quando o buffer enche
- O passo atual fica sempre fixado na base, com um contador de tempo decorrido

Você ainda pode entrar no terminal a qualquer momento pelo seletor de modo na barra superior. A timeline é uma visualização sobre a mesma sessão, não uma sessão separada.

## O que você vê

Cada linha da timeline corresponde a uma entrada na transcrição JSONL do Claude Code:

| Tipo | O que mostra |
|---|---|
| **Mensagem do usuário** | Seu prompt como balão de chat. |
| **Mensagem do assistente** | A resposta do Claude, renderizada como Markdown. |
| **Chamada de ferramenta** | O nome da ferramenta, argumentos-chave e a resposta — `read`, `edit`, `bash`, etc. |
| **Grupo de ferramenta** | Chamadas consecutivas de ferramenta colapsadas em um cartão. |
| **Tarefa / plano** | Planos de múltiplas etapas com progresso por checkbox. |
| **Sub-agente** | Invocações de agentes agrupadas com seu próprio progresso. |
| **Prompt de permissão** | O prompt interceptado, com as mesmas opções que o Claude oferece. |
| **Compacting** | Um indicador discreto quando o Claude está auto-compactando o contexto. |

Mensagens longas do assistente colapsam para um trecho com botão de expandir; outputs longos de ferramenta são truncados com um botão "mostrar mais".

## Como ela se mantém ao vivo

A timeline é alimentada por um WebSocket em `/api/timeline`. O servidor roda um `fs.watch` sobre o arquivo JSONL ativo, faz parse das entradas anexadas e empurra para o navegador conforme acontecem. Não há polling nem re-fetch completo — o payload inicial envia as entradas existentes, e tudo a partir dali é incremental.

Enquanto o Claude está `busy`, você também vê:

- Um spinner com o tempo decorrido ao vivo do passo atual
- A chamada de ferramenta atual (ex.: "Reading src/lib/auth.ts")
- Um trecho curto do texto mais recente do assistente

Esses dados vêm do passe de metadata do watcher do JSONL e atualizam sem alterar o estado da sessão.

## Rolagem, âncoras e histórico

A timeline auto-rola quando você já está na base e fica parada quando você rola para cima para ler algo. Um botão flutuante **Rolar para o final** aparece quando você está mais de uma tela acima da última entrada.

Para sessões longas, entradas mais antigas carregam sob demanda conforme você rola para cima. O ID da sessão Claude é preservado entre resumes, então retomar uma sessão de ontem te leva direto para onde você parou.

{% call callout('tip', 'Pule para o input') %}
Pressione <kbd>⌘I</kbd> de qualquer lugar na timeline para focar a barra de input no final. <kbd>Esc</kbd> envia um interrupt ao processo Claude em execução.
{% endcall %}

## Prompts de permissão inline

Quando o Claude pede para rodar uma ferramenta ou editar um arquivo, o prompt aparece inline na timeline em vez de como modal. Você pode clicar na opção, pressionar a tecla numérica correspondente, ou ignorar e responder pelo celular via Web Push. Veja [Prompts de permissão](/purplemux/pt-BR/docs/permission-prompts/) para o fluxo completo.

## Modos em uma única aba

A barra superior permite alternar o que o painel da direita mostra para a mesma sessão:

- **Claude** — a timeline (padrão)
- **Terminal** — a visualização xterm.js crua
- **Diff** — mudanças do Git para o diretório de trabalho

Trocar de modo não reinicia nada. A sessão continua rodando no tmux por trás das três visualizações.

Atalhos: <kbd>⌘⇧C</kbd> · <kbd>⌘⇧T</kbd> · <kbd>⌘⇧F</kbd>.

## Próximos passos

- **[Prompts de permissão](/purplemux/pt-BR/docs/permission-prompts/)** — o fluxo de aprovação inline.
- **[Status da sessão](/purplemux/pt-BR/docs/session-status/)** — os badges que dirigem os indicadores da timeline.
- **[Quick prompts e anexos](/purplemux/pt-BR/docs/quick-prompts-attachments/)** — o que a barra de input no final faz.
