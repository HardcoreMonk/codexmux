---
title: Notas (relatório diário com IA)
description: Um resumo de fim de dia de cada sessão do Claude Code, escrito por um LLM, salvo localmente em Markdown.
eyebrow: Claude Code
permalink: /pt-BR/docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

Quando o dia termina, o purplemux pode ler os logs de sessão do dia e escrever para você um briefing de uma linha mais um resumo Markdown por projeto. Ele vive na barra lateral como **Notas** e existe para que retros, dailies e 1:1s parem de começar com "o que eu fiz ontem mesmo?"

## O que você ganha por dia

Cada entrada tem duas camadas:

- **Briefing de uma linha** — uma frase única que captura o formato do dia. Visível direto na lista de Notas.
- **Visualização detalhada** — expanda o briefing para ver um relatório Markdown agrupado por projeto, com seções H3 por tópico e destaques em bullets.

O briefing é o que você bate o olho; a visualização detalhada é o que você cola num documento de retro.

Um pequeno cabeçalho em cada dia mostra a contagem de sessões e o custo total — os mesmos números que o [dashboard de estatísticas](/purplemux/pt-BR/docs/usage-rate-limits/) usa, em forma resumida.

## Gerando um relatório

Relatórios são gerados sob demanda, não automaticamente. Pela visualização de Notas:

- **Gerar** ao lado de um dia faltando cria o relatório daquele dia a partir das transcrições JSONL.
- **Regerar** em uma entrada existente reconstrói o mesmo dia com conteúdo novo (útil se você adicionou contexto ou trocou de idioma).
- **Gerar todos** percorre cada dia faltante e os preenche em sequência. Você pode parar o lote a qualquer momento.

O LLM processa cada sessão individualmente antes de juntá-las por projeto, então o contexto não se perde em dias longos com muitas abas.

{% call callout('note', 'O idioma segue o app') %}
Os relatórios são escritos no idioma em que o purplemux está. Trocar o idioma do app e regenerar te entrega o mesmo conteúdo na nova locale.
{% endcall %}

## Onde fica

| Superfície | Caminho |
|---|---|
| Barra lateral | Entrada **Notas**, abre a visualização em lista |
| Atalho | <kbd>⌘⇧E</kbd> no macOS, <kbd>Ctrl⇧E</kbd> no Linux |
| Storage | `~/.purplemux/stats/daily-reports/<data>.json` |

Cada dia é um arquivo JSON contendo o briefing, o Markdown detalhado, a locale e os metadados das sessões. Nada sai da sua máquina, exceto a chamada do LLM em si, que vai pela conta Claude Code configurada no host.

## Estrutura por projeto

Dentro da visualização detalhada, um dia típico fica assim:

```markdown
**purplemux**

### Rascunho da landing page
- Desenhada a estrutura de oito seções com layouts Hero / Why / Mobile / Stats
- Cor da marca roxa virou variável OKLCH
- Aplicados frames de mockup de screenshot desktop / mobile

### Mockups dos cards de feature
- Reproduzidos indicadores reais de spinner / pulse no painel multi-sessão
- Apertado o CSS dos mockups Git Diff, workspace e self-hosted
```

Sessões que trabalharam no mesmo projeto são fundidas sob um cabeçalho de projeto; tópicos dentro de um projeto viram seções H3. Você pode copiar o Markdown renderizado direto em um template de retro.

## Quando os dias não fazem sentido para resumir

Um dia sem sessões Claude não recebe entrada. Um dia com uma sessão pequena pode produzir um briefing bem curto — tudo bem; ele regera mais longo na próxima vez em que você de fato trabalhar.

O gerador em lote pula dias que já têm relatório na locale atual e só preenche lacunas reais.

## Privacidade

O texto usado para construir um relatório são as mesmas transcrições JSONL que você consegue ler em `~/.claude/projects/`. O pedido de sumarização é uma única chamada de LLM por dia; o output em cache fica em `~/.purplemux/`. Não há telemetria, upload nem cache compartilhado.

## Próximos passos

- **[Uso e rate limits](/purplemux/pt-BR/docs/usage-rate-limits/)** — o dashboard de onde vêm essas contagens de sessão e custos.
- **[Visualização de sessão ao vivo](/purplemux/pt-BR/docs/live-session-view/)** — a fonte de dados, em tempo real.
- **[Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/)** — incluindo <kbd>⌘⇧E</kbd> para Notas.
