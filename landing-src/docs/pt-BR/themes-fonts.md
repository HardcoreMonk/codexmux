---
title: Temas e fontes
description: Claro, escuro ou sistema; três tamanhos de fonte; um único painel de configurações.
eyebrow: Personalização
permalink: /pt-BR/docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux vem com uma única aparência coerente e um pequeno conjunto de chaves: tema do app, tamanho de fonte e uma paleta separada para o terminal. Esta página cobre as duas primeiras — as cores do terminal têm página própria.

## Abrindo as Configurações

Pressione <kbd>⌘,</kbd> (macOS) ou <kbd>Ctrl,</kbd> (Linux) para abrir as Configurações. A aba **Geral** é onde tema e tamanho de fonte vivem.

Você também pode clicar no ícone de engrenagem na barra superior.

## Tema do app

Três modos, aplicados na hora:

| Modo | Comportamento |
|---|---|
| **Claro** | Força o tema claro independente da preferência do SO. |
| **Escuro** | Força o tema escuro. |
| **Sistema** | Segue o SO — alterna automaticamente quando macOS / GNOME / KDE muda entre claro e escuro. |

O tema é guardado em `~/.purplemux/config.json` sob `appTheme` e sincronizado para cada aba do navegador conectada ao servidor. No app nativo de macOS, a barra de título do SO também atualiza.

{% call callout('note', 'Pensado dark-first') %}
A marca foi construída em torno de um neutro com matiz roxo profundo, e o modo escuro mantém a chroma em zero para uma superfície estritamente acromática. O modo claro aplica um leve tom roxo (matiz 287), quase imperceptível, para aquecimento. Os dois são ajustados para sessões longas; escolha o que seus olhos preferirem.
{% endcall %}

## Tamanho de fonte

Três presets, expostos como um grupo de botões:

- **Normal** — o padrão; o root font-size segue o navegador.
- **Grande** — root font-size em `18px`.
- **Extra grande** — root font-size em `20px`.

Como toda a UI é dimensionada em `rem`, alternar presets escala a interface inteira — barra lateral, diálogos, terminal — de uma vez. A mudança é aplicada em tempo real, sem reload.

## O que muda, o que não muda

O tamanho da fonte escala o **chrome da UI e o texto do terminal**. Não muda:

- Hierarquia de cabeçalhos (os tamanhos relativos ficam iguais)
- Espaçamento — proporções são preservadas
- Estilização de sintaxe em blocos de código

Se você quer ajustar elementos individuais (ex.: só o terminal, ou só a barra lateral), veja [CSS personalizado](/purplemux/pt-BR/docs/custom-css/).

## Por dispositivo, não por navegador

As configurações ficam no servidor, não no localStorage. Mudar para o escuro no laptop também muda no celular — abra `https://<host>/` pelo celular e a mudança já está lá.

Se você prefere manter mobile e desktop diferentes, isso não é suportado atualmente; abra uma issue se precisar.

## Próximos passos

- **[CSS personalizado](/purplemux/pt-BR/docs/custom-css/)** — sobrescreva cores e espaçamentos individuais.
- **[Temas do terminal](/purplemux/pt-BR/docs/terminal-themes/)** — paleta separada para o xterm.js.
- **[Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/)** — todos os atalhos em uma tabela.
