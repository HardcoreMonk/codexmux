---
title: Segurança e autenticação
description: Como o purplemux protege o seu painel — senha hash com scrypt, dados apenas locais e HTTPS para acesso externo.
eyebrow: Mobile e Remoto
permalink: /pt-BR/docs/security-auth/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux é self-hosted e fica na sua máquina. Não há servidores externos, telemetria nem conta na nuvem. Tudo abaixo descreve as poucas peças que de fato guardam o seu painel.

## Configurando a senha

Na primeira vez que você abre o purplemux, a tela de onboarding pede para você escolher uma senha. Depois que envia:

- A senha é hashada com **scrypt** (salt aleatório de 16 bytes, chave derivada de 64 bytes).
- O hash é gravado em `~/.purplemux/config.json` como `scrypt:{salt}:{hash}` — o texto plano nunca é armazenado.
- Um `authSecret` separado (hex aleatório) é gerado e guardado junto. O purplemux o usa para assinar o cookie de sessão emitido após o login.

Visitas seguintes mostram uma tela de login que verifica sua senha com `crypto.timingSafeEqual` contra o hash armazenado.

{% call callout('note', 'Tamanho da senha') %}
O mínimo é curto (4 caracteres) para que setups apenas-localhost não fiquem chatos. Se você expõe o purplemux a um tailnet — ou a qualquer outro lugar — escolha algo mais forte. Logins falhos são limitados a 16 tentativas por 15 minutos por processo.
{% endcall %}

## Resetando a senha

Esqueceu? Você só precisa de acesso de shell ao host:

```bash
rm ~/.purplemux/config.json
```

Reinicie o purplemux (`pnpm start`, `npx purplemux`, ou como você o iniciou) e a tela de onboarding reaparece para você escolher uma nova senha.

Isso apaga outras configurações guardadas no mesmo arquivo (tema, locale, tamanho de fonte, toggle de notificações etc.). Seus workspaces e abas vivem em `workspaces.json` e no diretório `workspaces/`, então os layouts ficam intactos.

## HTTPS para acesso externo

O bind padrão é `localhost`, servido em HTTP plano. Tudo bem para a mesma máquina — mas no momento em que você acessa o purplemux de outro dispositivo, deveria estar em HTTPS.

- **Tailscale Serve** é o caminho recomendado: criptografia WireGuard mais cert Let's Encrypt automático. Veja [Acesso via Tailscale](/purplemux/pt-BR/docs/tailscale/).
- **Reverse proxy** (Nginx, Caddy etc.) também funciona, contanto que você encaminhe os headers `Upgrade` e `Connection` do WebSocket.

O iOS Safari também exige HTTPS para instalação de PWA e registro de Web Push. Veja [Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/) e [Web Push](/purplemux/pt-BR/docs/web-push/).

## O que vive em `~/.purplemux/`

Tudo é local. Permissões em arquivos sensíveis são `0600`.

| Arquivo | O que guarda |
|---|---|
| `config.json` | hash scrypt da senha, secret de sessão, preferências do app |
| `workspaces.json` + `workspaces/` | lista de workspaces e layouts de painel/aba por workspace |
| `vapid-keys.json` | par VAPID de Web Push (gerado automaticamente) |
| `push-subscriptions.json` | assinaturas de push por dispositivo |
| `cli-token` | token compartilhado para hooks/CLI conversarem com o servidor local |
| `pmux.lock` | lock de instância única (`pid`, `port`, `startedAt`) |
| `logs/` | arquivos de log pino com rotação |

Para o inventário completo e a tabela de reset, veja a referência fonte da verdade em [docs/DATA-DIR.md](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md).

## Sem telemetria

O purplemux não faz nenhuma chamada para fora por conta própria. As únicas chamadas de rede que ele inicia são:

- Notificações Web Push que você assinou, enviadas pelos serviços de push do SO.
- Tudo que o CLI do Claude faz por si — isso é entre você e a Anthropic, não o purplemux.

Código e dados de sessão nunca saem da sua máquina.

## Próximos passos

- **[Acesso via Tailscale](/purplemux/pt-BR/docs/tailscale/)** — o caminho seguro para HTTPS externo.
- **[Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/)** — depois que a auth estiver resolvida, instale na tela de início.
- **[Notificações Web Push](/purplemux/pt-BR/docs/web-push/)** — alertas em background.
