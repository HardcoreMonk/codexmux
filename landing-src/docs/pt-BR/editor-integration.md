---
title: Integração com editor
description: Abra a pasta atual no seu editor — VS Code, Cursor, Zed, code-server ou uma URL personalizada — direto pelo cabeçalho.
eyebrow: Personalização
permalink: /pt-BR/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

Todo workspace tem um botão **EDITOR** no cabeçalho. Clicar abre a pasta da sessão ativa no editor da sua escolha. Escolha um preset, aponte para uma URL ou conte com o handler do sistema, e pronto.

## Abrindo o seletor

Configurações (<kbd>⌘,</kbd>) → aba **Editor**. Você verá uma lista de presets e, dependendo da escolha, um campo de URL.

## Presets disponíveis

| Preset | O que faz |
|---|---|
| **Code Server (Web)** | Abre uma instância hospedada do [code-server](https://github.com/coder/code-server) com `?folder=<caminho>`. Exige uma URL. |
| **VS Code** | Dispara `vscode://file/<caminho>?windowId=_blank`. |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<caminho>` |
| **URL personalizada** | Um template de URL controlado por você, com placeholders `{folder}` / `{folderEncoded}`. |
| **Desabilitado** | Esconde o botão EDITOR por completo. |

Os quatro presets de IDE de desktop (VS Code, Cursor, Windsurf, Zed) dependem de o SO ter um handler de URI registrado. Se a IDE estiver instalada localmente, o link funciona como esperado.

## Web vs. local

Há uma distinção significativa em como cada preset abre uma pasta:

- **code-server** roda dentro do navegador. A URL aponta para o servidor que você está hospedando (seu, na sua rede ou por trás de Tailscale). Clique no botão EDITOR e uma nova aba carrega a pasta.
- **IDEs locais** (VS Code, Cursor, Windsurf, Zed) exigem que a IDE esteja instalada na *máquina que está rodando o navegador*. O link é entregue ao SO, que abre o handler registrado.

Se você está usando o purplemux pelo celular, só o preset code-server funciona — celulares não conseguem abrir URLs `vscode://` em um app de desktop.

## Configurando o code-server

Um setup local típico, exposto no produto:

```bash
# Instalar no macOS
brew install code-server

# Rodar
code-server --port 8080

# Acesso externo via Tailscale (opcional)
tailscale serve --bg --https=8443 http://localhost:8080
```

Depois, na aba Editor, configure a URL para o endereço onde o code-server está acessível — `http://localhost:8080` para local, ou `https://<máquina>.<tailnet>.ts.net:8443` se você o colocou atrás do Tailscale Serve. O purplemux valida que a URL começa com `http://` ou `https://` e adiciona `?folder=<caminho absoluto>` automaticamente.

{% call callout('note', 'Escolha uma porta que não seja 8022') %}
O purplemux já vive em `8022`. Rode o code-server em uma porta diferente (o exemplo usa `8080`) para que não briguem.
{% endcall %}

## Template de URL personalizada

O preset Personalizado deixa você apontar para qualquer coisa que aceite uma pasta na URL — workspaces do Coder, Gitpod, Theia, uma ferramenta interna. O template **precisa** conter pelo menos um dos placeholders:

- `{folder}` — caminho absoluto, sem encoding.
- `{folderEncoded}` — URL-encoded.

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

O purplemux valida o template no momento de salvar e recusa qualquer um sem placeholder.

## Desabilitando o botão

Escolha **Desabilitado**. O botão some do cabeçalho do workspace.

## Próximos passos

- **[Barra lateral e opções do Claude](/purplemux/pt-BR/docs/sidebar-options/)** — reordene itens da barra lateral, alterne flags do Claude.
- **[CSS personalizado](/purplemux/pt-BR/docs/custom-css/)** — ajustes visuais adicionais.
- **[Tailscale](/purplemux/pt-BR/docs/tailscale/)** — acesso externo seguro também para o code-server.
