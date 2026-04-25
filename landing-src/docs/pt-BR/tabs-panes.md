---
title: Abas e painéis
description: Como funcionam as abas dentro de um workspace, como dividir painéis e os atalhos para mover o foco entre eles.
eyebrow: Workspaces e Terminal
permalink: /pt-BR/docs/tabs-panes/index.html
---
{% from "docs/callouts.njk" import callout %}

Um workspace é dividido em **painéis**, e cada painel guarda uma pilha de **abas**. As divisões dão visualizações paralelas; as abas permitem que um único painel hospede vários shells sem roubar espaço da tela.

## Abas

Toda aba é um shell de verdade conectado a uma sessão tmux. O título da aba vem do processo em primeiro plano — digite `vim` e a aba renomeia sozinha; saia e ela volta a mostrar o nome do diretório.

| Ação | macOS | Linux / Windows |
|---|---|---|
| Nova aba | <kbd>⌘T</kbd> | <kbd>Ctrl+T</kbd> |
| Fechar aba | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| Aba anterior | <kbd>⌘⇧[</kbd> | <kbd>Ctrl+Shift+[</kbd> |
| Próxima aba | <kbd>⌘⇧]</kbd> | <kbd>Ctrl+Shift+]</kbd> |
| Ir para aba 1–9 | <kbd>⌃1</kbd> – <kbd>⌃9</kbd> | <kbd>Alt+1</kbd> – <kbd>Alt+9</kbd> |

Arraste uma aba na barra de abas para reordenar. O botão **+** ao final da barra abre o mesmo seletor de templates que <kbd>⌘T</kbd>.

{% call callout('tip', 'Templates além do Terminal') %}
O menu de nova aba permite escolher **Terminal**, **Claude**, **Diff** ou **Navegador web** como tipo de painel. Todos são abas — você pode misturá-los no mesmo painel e alternar com os atalhos acima.
{% endcall %}

## Dividindo painéis

As abas compartilham o mesmo espaço de tela. Para ver duas coisas ao mesmo tempo, divida o painel.

| Ação | macOS | Linux / Windows |
|---|---|---|
| Dividir à direita | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> |
| Dividir para baixo | <kbd>⌘⇧D</kbd> | <kbd>Ctrl+Shift+D</kbd> |

Uma nova divisão herda o diretório padrão do workspace e começa com uma aba de terminal vazia. Cada painel tem sua própria barra de abas, então o painel da direita pode hospedar o visualizador de diff enquanto o da esquerda roda `claude`.

## Mova o foco entre painéis

Use os atalhos direcionais — eles percorrem a árvore de divisões, então <kbd>⌘⌥→</kbd> a partir de um painel profundamente aninhado ainda cai no painel visualmente adjacente.

| Ação | macOS | Linux / Windows |
|---|---|---|
| Foco à esquerda | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| Foco à direita | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| Foco acima | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| Foco abaixo | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |

## Redimensionar e equalizar

Arraste o divisor entre painéis para controle fino, ou use o teclado.

| Ação | macOS | Linux / Windows |
|---|---|---|
| Redimensionar à esquerda | <kbd>⌘⌃⇧←</kbd> | <kbd>Ctrl+Alt+Shift+←</kbd> |
| Redimensionar à direita | <kbd>⌘⌃⇧→</kbd> | <kbd>Ctrl+Alt+Shift+→</kbd> |
| Redimensionar acima | <kbd>⌘⌃⇧↑</kbd> | <kbd>Ctrl+Alt+Shift+↑</kbd> |
| Redimensionar abaixo | <kbd>⌘⌃⇧↓</kbd> | <kbd>Ctrl+Alt+Shift+↓</kbd> |
| Equalizar divisões | <kbd>⌘⌥=</kbd> | <kbd>Ctrl+Alt+=</kbd> |

Equalizar é o jeito mais rápido de resetar um layout que tomou proporções extremas e ficou inutilizável.

## Limpar a tela

<kbd>⌘K</kbd> limpa o terminal do painel atual, do mesmo jeito que a maioria dos terminais nativos. O processo do shell continua rodando; só o buffer visível é apagado.

| Ação | macOS | Linux / Windows |
|---|---|---|
| Limpar tela | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> |

## Abas sobrevivem a tudo

Fechar uma aba mata a sua sessão tmux. Fechar o *navegador*, atualizar a página ou perder a rede não — toda aba continua rodando no servidor. Volte e os mesmos painéis, divisões e abas ressurgem.

Para a história de recuperação após reboots do servidor, veja [Salvar e restaurar layouts](/purplemux/pt-BR/docs/save-restore/).

## Próximos passos

- **[Salvar e restaurar layouts](/purplemux/pt-BR/docs/save-restore/)** — como esse layout fica preservado.
- **[Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/)** — todos os atalhos em uma tabela.
- **[Painel de Git workflow](/purplemux/pt-BR/docs/git-workflow/)** — um tipo de aba útil para colocar em uma divisão.
