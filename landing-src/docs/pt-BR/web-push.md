---
title: Notificações Web Push
description: Alertas push em background para os estados de needs-input e conclusão de tarefa, mesmo com a aba do navegador fechada.
eyebrow: Mobile e Remoto
permalink: /pt-BR/docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

O Web Push permite que o purplemux te cutuque quando uma sessão Claude precisa da sua atenção — um prompt de permissão, uma tarefa concluída — mesmo depois de você fechar a aba. Toque na notificação e cai direto naquela sessão.

## O que dispara uma notificação

O purplemux dispara um push para as mesmas transições que você vê como badges coloridos na barra lateral.

- **Needs input** — Claude bateu em um prompt de permissão ou fez uma pergunta.
- **Conclusão de tarefa** — Claude terminou uma rodada (estado **review**).

Transições idle e busy são intencionalmente não enviadas. São ruído.

## Habilitando

O toggle está em **Configurações → Notificações**. Passos:

1. Abra **Configurações → Notificações** e ligue o toggle.
2. O navegador pede permissão de notificações — conceda.
3. O purplemux registra uma assinatura de Web Push contra as chaves VAPID do servidor.

A assinatura é gravada em `~/.purplemux/push-subscriptions.json` e identifica o seu navegador/dispositivo específico. Repita os passos em cada dispositivo onde quer ser notificado.

{% call callout('warning', 'iOS exige Safari 16.4 + um PWA') %}
Em iPhone e iPad, o Web Push só funciona depois que você adicionou o purplemux à tela de início e abriu pelo ícone. Abra a página de Configurações de dentro da janela standalone do PWA — o prompt de permissão de notificações é no-op em uma aba comum do Safari. Configure o PWA primeiro: [Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/).
{% endcall %}

## Chaves VAPID

O purplemux gera um par VAPID de application server na primeira execução e o salva em `~/.purplemux/vapid-keys.json` (modo `0600`). Você não precisa fazer nada — a chave pública é entregue automaticamente ao navegador quando você assina.

Se quiser resetar todas as assinaturas (por exemplo, depois de rotacionar chaves), apague `vapid-keys.json` e `push-subscriptions.json` e reinicie o purplemux. Cada dispositivo precisará re-assinar.

## Entrega em background

Uma vez assinado, o seu celular recebe a notificação pelo serviço de push do SO:

- **iOS** — APNs, via a ponte de Web Push do Safari. A entrega é best-effort e pode ser coalescida se o seu celular estiver muito limitado.
- **Android** — FCM via Chrome. Geralmente instantâneo.

A notificação chega independente de o purplemux estar em primeiro plano. Se o painel está visível em _qualquer_ um dos seus dispositivos, o purplemux pula o push para evitar buzz duplo.

## Toque para entrar

Tocar em uma notificação abre o purplemux direto na sessão que disparou. Se o PWA já está rodando, o foco vai para a aba certa; senão, o app inicia e navega direto para lá.

## Solucionando problemas

- **Toggle desabilitado** — Service Workers ou a Notifications API não são suportados. Rode **Configurações → Verificação de navegador**, ou veja [Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/).
- **Permissão foi negada** — limpe a permissão de notificação do site nas configurações do navegador, depois ligue o toggle de novo no purplemux.
- **Sem push no iOS** — confirme que está abrindo pelo ícone da tela de início, não pelo Safari. Confirme que o iOS é **16.4 ou mais novo**.
- **Certificado autoassinado** — o Web Push se recusa a registrar. Use Tailscale Serve ou um reverse proxy com certificado real. Veja [Acesso via Tailscale](/purplemux/pt-BR/docs/tailscale/).

## Próximos passos

- **[Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/)** — obrigatório para push no iOS.
- **[Acesso via Tailscale](/purplemux/pt-BR/docs/tailscale/)** — HTTPS para entrega externa.
- **[Segurança e autenticação](/purplemux/pt-BR/docs/security-auth/)** — o que mais vive em `~/.purplemux/`.
