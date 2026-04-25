---
title: Painel de navegador web
description: Uma aba de navegador embutida para testar saídas de dev, dirigível pela CLI do purplemux, com emulador de dispositivos para viewports mobile.
eyebrow: Workspaces e Terminal
permalink: /pt-BR/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

Coloque uma aba de navegador web ao lado do seu terminal e da sessão Claude. Ela roda seu servidor de dev local, o site de staging, qualquer coisa acessível — e você pode dirigi-la a partir da CLI `purplemux` sem sair do shell.

## Abrir uma aba de navegador

Adicione uma nova aba e escolha **Navegador web** como tipo de painel. Digite uma URL na barra de endereços — `localhost:3000`, um IP ou uma URL https completa. A barra de endereços normaliza a entrada: hostnames e IPs simples vão para `http://`, o resto para `https://`.

O painel roda como um webview Chromium real quando o purplemux é o app nativo do macOS (build Electron), e cai para um iframe quando acessado de um navegador comum. O caminho do iframe cobre a maioria das páginas, mas não roda sites que enviam `X-Frame-Options: deny`; o caminho do Electron não tem esse limite.

{% call callout('note', 'Melhor no app nativo') %}
Emulação de dispositivo, screenshots via CLI e captura de console / rede só funcionam no build Electron. O fallback de aba de navegador entrega barra de endereços, voltar / avançar e reload, mas as integrações mais profundas precisam de um webview.
{% endcall %}

## Navegação dirigida pela CLI

O painel expõe uma pequena API HTTP que a CLI `purplemux` empacotada utiliza. De qualquer terminal — inclusive o que está ao lado do painel de navegador — você pode:

```bash
# listar abas e descobrir o ID de uma aba do tipo web-browser
purplemux tab list -w <workspace-id>

# ler URL e título atuais
purplemux tab browser url -w <ws> <tabId>

# capturar um screenshot em arquivo (ou página inteira com --full)
purplemux tab browser screenshot -w <ws> <tabId> -o shot.png --full

# acompanhar logs recentes do console (ring buffer de 500 entradas)
purplemux tab browser console -w <ws> <tabId> --since 60000 --level error

# inspecionar atividade de rede, opcionalmente buscando o corpo de uma única resposta
purplemux tab browser network -w <ws> <tabId> --method POST --status 500
purplemux tab browser network -w <ws> <tabId> --request <id>

# avaliar JavaScript dentro da aba e obter o resultado serializado
purplemux tab browser eval -w <ws> <tabId> "document.title"
```

A CLI autentica via um token em `~/.purplemux/cli-token` e lê a porta de `~/.purplemux/port`. Sem flags necessárias quando rodando na mesma máquina. Rode `purplemux help` para ver toda a interface ou `purplemux api-guide` para os endpoints HTTP por trás.

É isso que torna o painel útil para o Claude: peça para ele tirar um screenshot, conferir o console pelo erro ou rodar um script de prova — e o Claude tem a mesma CLI que você.

## Emulador de dispositivos

Para trabalho mobile, alterne o painel para o modo mobile. Um seletor de dispositivos oferece presets para iPhone SE até 14 Pro Max, Pixel 7, Galaxy S20 Ultra, iPad Mini e iPad Pro 12.9". Cada preset inclui:

- Largura / altura
- Device pixel ratio
- Um user agent mobile correspondente

Alterne entre retrato e paisagem, e escolha um nível de zoom (`fit` para escalar ao painel, ou fixos `50% / 75% / 100% / 125% / 150%`). Quando você muda de dispositivo, o webview recarrega com o novo UA, para que a detecção de mobile no servidor enxergue o que seu celular enxergaria.

## Próximos passos

- **[Abas e painéis](/purplemux/pt-BR/docs/tabs-panes/)** — colocando o navegador em uma divisão ao lado do Claude.
- **[Painel de Git workflow](/purplemux/pt-BR/docs/git-workflow/)** — o outro tipo de painel feito sob medida.
- **[Instalação](/purplemux/pt-BR/docs/installation/)** — o app nativo do macOS, onde a integração completa do webview vive.
