---
title: Quick prompts e anexos
description: Uma biblioteca de prompts salvos, drag-and-drop de imagens, anexos de arquivo e um histórico reutilizável de mensagens — tudo a partir da barra de input no final da timeline.
eyebrow: Claude Code
permalink: /pt-BR/docs/quick-prompts-attachments/index.html
---
{% from "docs/callouts.njk" import callout %}

A barra de input abaixo da timeline é mais que um textarea. É onde vivem os prompts salvos, os anexos e o histórico de mensagens, para que aquilo que você digita dez vezes ao dia pare de custar dez digitadas por dia.

## Quick prompts

Quick prompts são entradas curtas, com nome, armazenadas em `~/.purplemux/quick-prompts.json`. Aparecem como chips acima da barra de input — um clique envia o prompt como se você o tivesse digitado.

Dois built-ins vêm de fábrica e podem ser desabilitados a qualquer hora:

- **Commit** — executa `/commit-commands:commit`
- **Simplify** — executa `/simplify`

Adicione os seus em **Configurações → Quick prompts**:

1. Clique em **Adicionar prompt**.
2. Dê um nome (rótulo do chip) e um corpo (o que será enviado).
3. Arraste para reordenar. Desligue para esconder sem deletar.

Tudo que você digita no corpo é enviado verbatim — incluindo slash commands, prompts multilinha ou pedidos templatizados como "Explique o arquivo aberto no editor e sugira uma melhoria".

{% call callout('tip', 'Slash commands valem') %}
Quick prompts funcionam bem como gatilhos de um clique para slash commands do Claude Code. Um chip "Review this PR" apontando para `/review` economiza algumas teclas toda vez.
{% endcall %}

## Drag and drop de imagens

Solte um arquivo de imagem (PNG, JPG, WebP, etc.) em qualquer lugar da barra de input para anexar. O purplemux faz upload do arquivo para um caminho temporário no servidor e insere uma referência no seu prompt automaticamente.

Você também pode:

- **Colar** uma imagem diretamente da área de transferência
- **Clicar no clipe** para escolher por um diálogo de arquivos
- Anexar **até 20 arquivos** por mensagem

Uma faixa de thumbnails aparece acima do input enquanto há anexos pendentes. Cada thumbnail tem um X para removê-lo antes do envio.

## Outros tipos de anexo

O mesmo clipe vale para arquivos não-imagem — markdown, JSON, CSV, código-fonte, qualquer coisa. O purplemux os coloca em um diretório temporário e insere o caminho, para que o Claude possa `read` como parte da requisição.

Esse é o jeito mais fácil de compartilhar algo que o Claude não alcança sozinho, como um stack trace colado de outra máquina ou um arquivo de configuração de outro projeto.

## Amigável para mobile

Anexos e o clipe ficam em tamanho cheio nos celulares. Solte um screenshot da folha de compartilhamento do iOS, ou use o botão da câmera (Android) para anexar uma foto direto da galeria.

A barra de input se reflui para telas estreitas — os chips viram um scroller horizontal, e o textarea cresce até cinco linhas antes de começar a rolar.

## Histórico de mensagens

Cada prompt que você enviou em um workspace fica em um histórico por workspace. Para reutilizar:

- Pressione <kbd>↑</kbd> em uma barra de input vazia para percorrer mensagens recentes
- Ou abra o seletor **Histórico** para uma lista pesquisável

Entradas antigas podem ser apagadas pelo seletor. O histórico é salvo junto aos outros dados do workspace em `~/.purplemux/`, nunca enviado para fora da máquina.

## Teclado

| Tecla | Ação |
|---|---|
| <kbd>⌘I</kbd> | Focar o input de qualquer lugar da visualização da sessão |
| <kbd>Enter</kbd> | Enviar |
| <kbd>⇧Enter</kbd> | Inserir uma quebra de linha |
| <kbd>Esc</kbd> | Enquanto o Claude está busy, enviar um interrupt |
| <kbd>↑</kbd> | Voltar pelo histórico de mensagens (quando o input está vazio) |

## Próximos passos

- **[Visualização de sessão ao vivo](/purplemux/pt-BR/docs/live-session-view/)** — onde seus prompts e as respostas do Claude aparecem.
- **[Atalhos de teclado](/purplemux/pt-BR/docs/keyboard-shortcuts/)** — a tabela completa.
- **[Prompts de permissão](/purplemux/pt-BR/docs/permission-prompts/)** — o que acontece depois de enviar uma requisição que precisa de aprovação.
