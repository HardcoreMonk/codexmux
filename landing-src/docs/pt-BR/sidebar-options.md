---
title: Barra lateral e opções do Claude
description: Reordene e esconda atalhos da barra lateral, gerencie a biblioteca de quick prompts e alterne flags do CLI Claude.
eyebrow: Personalização
permalink: /pt-BR/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

A barra lateral e a barra de input são feitas de pequenas listas que você pode remodelar — links de atalho no fim da barra lateral, botões de prompt acima do input. A aba Claude nas Configurações guarda toggles em nível de CLI para sessões iniciadas pelo painel.

## Itens da barra lateral

Configurações (<kbd>⌘,</kbd>) → aba **Barra lateral**. A lista controla a faixa de atalhos que vive no fim da barra lateral — links para dashboards, ferramentas internas, qualquer coisa endereçável por URL.

Cada linha tem uma alça, nome, URL e um switch. Você pode:

- **Arrastar** a alça para reordenar. Itens built-in e customizados se movem livremente.
- **Alternar** o switch para esconder um item sem deletar.
- **Editar** itens customizados (ícone de lápis) — mude nome, ícone ou URL.
- **Deletar** itens customizados (ícone de lixeira).
- **Resetar para o padrão** — restaura os itens built-in, deleta todos os customizados, limpa a ordem.

### Adicionando um item customizado

Clique em **Adicionar item** no fim. Você verá um pequeno formulário:

- **Nome** — aparece como tooltip e label.
- **Ícone** — escolhido em uma galeria pesquisável do lucide-react.
- **URL** — qualquer `http(s)://...` funciona. Grafana interno, dashboards Vercel, uma ferramenta admin interna.

Clique em Salvar e a linha aparece no fim da lista. Arraste para onde quiser.

{% call callout('note', 'Built-ins podem ser escondidos, não deletados') %}
Itens built-in (os que o purplemux entrega) só têm switch e alça — sem editar ou deletar. Eles ficam sempre lá caso você mude de ideia. Itens customizados ganham o kit completo.
{% endcall %}

## Quick prompts

Configurações → aba **Quick Prompts**. São os botões que ficam acima do campo de input do Claude — clique único envia uma mensagem pré-definida.

Mesmo padrão dos itens da barra lateral:

- Arraste para reordenar.
- Alterne para esconder.
- Edite / delete prompts customizados.
- Resetar para o padrão.

Adicionar um prompt pede um **nome** (rótulo do botão) e o **prompt** em si (texto multilinha). Use para coisas que você digita com frequência: "Rode a suíte de testes", "Resuma o último commit", "Revise o diff atual".

## Opções do CLI Claude

Configurações → aba **Claude**. Essas flags afetam *como o purplemux inicia o CLI Claude* em novas abas — não mudam o comportamento de uma sessão já em execução.

### Pular verificações de permissão

Adiciona `--dangerously-skip-permissions` ao comando `claude`. O Claude vai rodar ferramentas e editar arquivos sem pedir aprovação a cada vez.

Essa é a mesma flag que o CLI oficial expõe — o purplemux não afrouxa nenhuma segurança em cima dela. Leia a [documentação da Anthropic](https://docs.anthropic.com/en/docs/claude-code/cli-reference) antes de ligar. Trate como opt-in apenas para workspaces confiáveis.

### Mostrar terminal junto com o Claude

Quando **ligado** (padrão): uma aba Claude mostra a visualização de sessão ao vivo *e* o painel de terminal por baixo, lado a lado, para você poder cair no shell quando quiser.

Quando **desligado**: novas abas Claude abrem com o terminal recolhido. A visualização de sessão ocupa todo o painel. Você ainda pode expandir o terminal manualmente por aba; isso só muda o padrão para abas recém-criadas.

Use desligado se você dirige o Claude principalmente pela timeline e quer um padrão mais limpo.

## Próximos passos

- **[Temas e fontes](/purplemux/pt-BR/docs/themes-fonts/)** — claro, escuro, sistema; presets de tamanho de fonte.
- **[Integração com editor](/purplemux/pt-BR/docs/editor-integration/)** — conecte VS Code, Cursor, code-server.
- **[Primeira sessão](/purplemux/pt-BR/docs/first-session/)** — relembre a estrutura do painel.
