---
title: Uso e rate limits
description: Contagem regressiva em tempo real dos rate limits de 5 horas e 7 dias na barra lateral, mais um dashboard de estatísticas para tokens, custo e quebra por projeto.
eyebrow: Claude Code
permalink: /pt-BR/docs/usage-rate-limits/index.html
---
{% from "docs/callouts.njk" import callout %}

Bater no rate limit no meio de uma tarefa é a pior interrupção possível. O purplemux puxa os números de cota do Claude Code para a barra lateral e adiciona um dashboard de estatísticas, para você ler seu ritmo de uso de relance.

## O widget da barra lateral

Duas barras finas ficam no fim da barra lateral: **5h** e **7d**. Cada uma mostra:

- A porcentagem da janela que você consumiu
- O tempo restante até o reset
- Uma barra fraca de projeção, indicando onde você vai parar mantendo o ritmo atual

Passe o mouse em qualquer barra para ver a quebra completa — porcentagem usada, projetada e tempo de reset como duração relativa.

Os números vêm do próprio JSON de statusline do Claude Code. O purplemux instala um pequeno script `~/.purplemux/statusline.sh` que envia os dados ao servidor local toda vez que o Claude atualiza sua statusline; um `fs.watch` mantém a UI em sincronia.

## Faixas de cor

As duas barras mudam de cor com base na porcentagem usada:

| Usado | Cor |
|---|---|
| 0–49 % | teal — confortável |
| 50–79 % | âmbar — segure o ritmo |
| 80–100 % | vermelho — prestes a bater |

As faixas casam com o widget de rate-limit da landing page. Depois de ver âmbar algumas vezes, a barra lateral vira uma ferramenta de ritmo periférica — você para de notá-la conscientemente, mas começa a distribuir o trabalho entre janelas.

{% call callout('tip', 'Projeção bate porcentagem') %}
A barra fraca por trás da sólida é uma projeção — se você seguir nesse ritmo, é onde estará no momento do reset. Ver a projeção atravessar 80% bem antes do uso real é o aviso prévio mais limpo.
{% endcall %}

## O dashboard de estatísticas

Abra o dashboard pela barra lateral (ou com <kbd>⌘⇧U</kbd>). Cinco seções, de cima para baixo:

### Cards de visão geral

Quatro cards: **Total de sessões**, **Custo total**, **Custo de hoje** e **Custo deste mês**. Cada card mostra a variação em relação ao período anterior em verde ou vermelho.

### Uso de tokens por modelo

Um gráfico de barras empilhadas por dia, quebrado por modelo e por tipo de token — input, output, cache reads, cache writes. A legenda usa os nomes de exibição do Claude (Opus / Sonnet / Haiku) e o mesmo tratamento de cor das barras da barra lateral.

É o lugar mais fácil de ver, por exemplo, que um pico inesperado de custo foi um dia pesado em Opus, ou que cache reads estão fazendo a maior parte do trabalho.

### Quebra por projeto

Uma tabela com cada projeto Claude Code (diretório de trabalho) que você usou, com sessões, mensagens, tokens e custo. Clique em uma linha para ver um gráfico diário só daquele projeto.

Útil para máquinas compartilhadas ou para separar trabalho de cliente de hacks pessoais.

### Atividade e streaks

Um gráfico de área da atividade diária dos últimos 30 dias, mais quatro métricas de streak:

- **Streak mais longo** — sua maior sequência de dias úteis consecutivos
- **Streak atual** — quantos dias seguidos você trabalhou agora
- **Total de dias ativos** — contagem no período
- **Média de sessões por dia**

### Timeline semanal

Um grid dia × hora mostrando quando você de fato usou o Claude na última semana. Sessões concorrentes empilham visualmente, então uma terça com "cinco sessões às 15h" salta aos olhos.

## De onde vêm os dados

Tudo no dashboard é computado localmente a partir dos JSONLs de sessão do próprio Claude Code em `~/.claude/projects/`. O purplemux os lê, faz cache das contagens parseadas em `~/.purplemux/stats/` e nunca envia um byte para fora da máquina. Trocar de idioma ou regenerar o cache não chama nada lá fora.

## Comportamento do reset

As janelas de 5 horas e 7 dias são deslizantes e atreladas à sua conta do Claude Code. Quando uma janela reseta, a barra cai para 0 % e a porcentagem e o tempo restante recalculam a partir do próximo timestamp de reset. Se o purplemux perdeu o reset (servidor estava fora), o widget se autocorrige no próximo tick da statusline.

## Próximos passos

- **[Notas (relatório diário com IA)](/purplemux/pt-BR/docs/notes-daily-report/)** — os mesmos dados, escritos como um briefing por dia.
- **[Status da sessão](/purplemux/pt-BR/docs/session-status/)** — a outra coisa que a barra lateral acompanha por aba.
- **[Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/)** — incluindo <kbd>⌘⇧U</kbd> para estatísticas.
