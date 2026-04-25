---
title: CSS personalizado
description: Sobrescreva variáveis CSS para reajustar cores, espaçamento e superfícies individuais.
eyebrow: Personalização
permalink: /pt-BR/docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux é construído sobre um sistema de variáveis CSS. Você pode mudar quase qualquer coisa visual sem tocar no código — cole regras na aba **Aparência**, clique em Aplicar, e elas entram em vigor imediatamente em todos os clientes conectados.

## Onde colocar

Abra as Configurações (<kbd>⌘,</kbd>) e escolha **Aparência**. Você verá um único textarea rotulado Custom CSS.

1. Escreva suas regras.
2. Clique em **Aplicar**. O CSS é injetado em uma tag `<style>` em todas as páginas.
3. Clique em **Resetar** para limpar todos os overrides.

O CSS é guardado no servidor em `~/.purplemux/config.json` (`customCSS`), então se aplica em todos os dispositivos que conectam.

{% call callout('note', 'Servidor inteiro, não por dispositivo') %}
O CSS personalizado vive na config do servidor e te segue em todos os navegadores. Se você quer um dispositivo diferente do outro, isso não é suportado atualmente.
{% endcall %}

## Como funciona

A maioria das cores, superfícies e acentos no purplemux é exposta como variáveis CSS sob `:root` (claro) e `.dark`. Sobrescrever a variável cascateia a mudança para todos os lugares onde ela é usada — barra lateral, diálogos, gráficos, badges de status.

Mudar uma única variável é quase sempre melhor do que sobrescrever seletores de componente direto. Classes de componente não são uma API estável; variáveis são.

## Um exemplo mínimo

Aqueça um pouco a barra lateral no modo claro e empurre a superfície escura para mais escuro:

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

Ou recolora a marca sem mexer no resto:

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## Grupos de variáveis

O painel de Aparência expõe a lista completa em **Variáveis disponíveis**. Os grandes baldes são:

- **Surface** — `--background`, `--card`, `--popover`, `--muted`, `--secondary`, `--accent`, `--sidebar`
- **Text** — `--foreground` e as variantes `*-foreground` correspondentes
- **Interactive** — `--primary`, `--primary-foreground`, `--destructive`
- **Border** — `--border`, `--input`, `--ring`
- **Palette** — `--ui-blue`, `--ui-teal`, `--ui-coral`, `--ui-amber`, `--ui-purple`, `--ui-pink`, `--ui-green`, `--ui-gray`, `--ui-red`
- **Semantic** — `--positive`, `--negative`, `--accent-color`, `--brand`, `--focus-indicator`, `--claude-active`

Para a lista completa de tokens com valores oklch padrão e o racional de design, veja [`docs/STYLE.md`](https://github.com/subicura/purplemux/blob/main/docs/STYLE.md) no repositório. Esse documento é a fonte da verdade.

## Mirando só um modo

Embrulhe regras em `:root` para o claro e `.dark` para o escuro. A classe é colocada em `<html>` pelo `next-themes`.

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

Se você só precisa mudar um modo, deixe o outro em paz.

## E o terminal?

O terminal xterm.js usa sua própria paleta, escolhida de uma lista curada — não é dirigido por essas variáveis CSS. Troque na aba **Terminal**. Veja [Temas do terminal](/purplemux/pt-BR/docs/terminal-themes/).

## Próximos passos

- **[Temas e fontes](/purplemux/pt-BR/docs/themes-fonts/)** — claro, escuro, sistema; presets de tamanho de fonte.
- **[Temas do terminal](/purplemux/pt-BR/docs/terminal-themes/)** — paleta separada para a área do terminal.
- **[Barra lateral e opções do Claude](/purplemux/pt-BR/docs/sidebar-options/)** — reordene itens, alterne flags do Claude.
