---
title: Temas do terminal
description: Uma paleta de cores separada para o terminal xterm.js — escolha uma para claro, uma para escuro.
eyebrow: Personalização
permalink: /pt-BR/docs/terminal-themes/index.html
---
{% from "docs/callouts.njk" import callout %}

O painel de terminal usa xterm.js com a sua própria paleta, independente do resto da UI. Você escolhe um tema escuro e um tema claro; o purplemux alterna entre eles conforme o tema do app alterna.

## Abrindo o seletor

Configurações (<kbd>⌘,</kbd>) → aba **Terminal**. Você verá duas sub-abas, Escuro e Claro, cada uma com uma grade de cards de tema. Clique em um — ele é aplicado ao vivo em todos os terminais abertos.

## Por que uma paleta separada

Apps de terminal dependem da paleta ANSI de 16 cores (vermelho, verde, amarelo, azul, magenta, ciano e suas variantes brilhantes). A paleta da UI é desbotada por design e tornaria a saída do terminal ilegível. Uma paleta feita para esse fim faz com que `vim`, `git diff`, realce de sintaxe e ferramentas TUI rendam corretamente.

Cada tema define:

- Background, foreground, cursor, seleção
- Oito cores ANSI base (preto, vermelho, verde, amarelo, azul, magenta, ciano, branco)
- Oito variantes brilhantes

## Temas embutidos

**Escuro**

- Snazzy *(padrão)*
- Dracula
- One Dark
- Tokyo Night
- Nord
- Catppuccin Mocha

**Claro**

- Catppuccin Latte *(padrão)*
- GitHub Light
- One Light
- Solarized Light
- Tokyo Night Light
- Nord Light

A prévia do card mostra as sete cores ANSI principais contra o background do tema, para você medir o contraste de bate-pronto antes de confirmar.

## Como funciona o switch claro/escuro

Você escolhe **um tema escuro** e **um tema claro** independentemente. O tema ativo é decidido pelo tema do app resolvido:

- App em **Escuro** → o seu tema escuro escolhido.
- App em **Claro** → o seu tema claro escolhido.
- App em **Sistema** → segue o SO, troca automaticamente.

Então escolher Sistema para o tema do app e configurar os dois lados te dá um terminal que segue o dia/noite do SO sem precisar de mais nada.

{% call callout('tip', 'Combine com o app, ou contraste') %}
Algumas pessoas preferem que o terminal combine com o resto da UI. Outras preferem um Dracula ou Tokyo Night de alto contraste mesmo num app claro. Os dois funcionam; o seletor não impõe nada.
{% endcall %}

## Por tema, não por aba

A escolha é global. Cada painel de terminal e cada sessão Claude usa o mesmo tema ativo. Não há override por aba; se você precisa, abra uma issue.

## Adicionando os seus

Entradas de tema customizadas não fazem parte da UI atualmente. A lista embutida vive em `src/lib/terminal-themes.ts`. Se você buildar do código-fonte, pode adicionar os seus; senão, o caminho suportado é abrir um PR com o novo tema.

## Próximos passos

- **[Temas e fontes](/purplemux/pt-BR/docs/themes-fonts/)** — tema do app e tamanho de fonte.
- **[CSS personalizado](/purplemux/pt-BR/docs/custom-css/)** — sobrescreva o resto da UI.
- **[Integração com editor](/purplemux/pt-BR/docs/editor-integration/)** — abra arquivos em um editor externo.
