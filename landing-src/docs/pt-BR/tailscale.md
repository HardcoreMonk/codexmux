---
title: Acesso via Tailscale
description: Acesse o purplemux pelo celular via HTTPS através do Tailscale Serve — sem port forwarding, sem malabarismo de certificado.
eyebrow: Mobile e Remoto
permalink: /pt-BR/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

Por padrão, o purplemux só escuta localmente. O Tailscale Serve é o jeito mais limpo de expô-lo aos seus outros dispositivos: criptografado por WireGuard, certificados Let's Encrypt automáticos e zero mudança de firewall.

## Por que Tailscale

- **WireGuard** — toda conexão é criptografada de dispositivo a dispositivo.
- **HTTPS automático** — o Tailscale provisiona certificado real para `*.<tailnet>.ts.net`.
- **Sem port forwarding** — sua máquina nunca abre uma porta para a internet pública.
- **HTTPS é obrigatório no iOS** — instalação de PWA e Web Push se recusam a funcionar sem ele. Veja [Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/) e [Web Push](/purplemux/pt-BR/docs/web-push/).

## Pré-requisitos

- Uma conta Tailscale, com o daemon `tailscale` instalado e logado na máquina que roda o purplemux.
- HTTPS habilitado no tailnet (Admin console → DNS → habilitar HTTPS Certificates, se ainda não estiver).
- purplemux rodando na porta padrão `8022` (ou onde você setou `PORT`).

## Execute

Uma linha:

```bash
tailscale serve --bg 8022
```

O Tailscale embrulha seu `http://localhost:8022` em HTTPS e o expõe dentro do tailnet em:

```
https://<máquina>.<tailnet>.ts.net
```

`<máquina>` é o hostname do servidor; `<tailnet>` é o sufixo MagicDNS do seu tailnet. Abra essa URL em qualquer outro dispositivo logado no mesmo tailnet e está dentro.

Para parar de servir:

```bash
tailscale serve --bg off 8022
```

## O que dá pra fazer com isso

- Abra a URL no celular, toque em **Compartilhar → Adicionar à Tela de Início** e siga [Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/).
- Ligue o push de dentro do PWA standalone: [Web Push](/purplemux/pt-BR/docs/web-push/).
- Acesse o mesmo painel de um tablet, laptop ou outro desktop — o estado do workspace sincroniza em tempo real.

{% call callout('tip', 'Funnel vs Serve') %}
`tailscale serve` mantém o purplemux privado para o seu tailnet — quase sempre é o que você quer. `tailscale funnel` o expõe para a internet pública, o que é exagerado (e arriscado) para um multiplexador pessoal.
{% endcall %}

## Fallback com reverse proxy

Se Tailscale não é uma opção, qualquer reverse proxy com certificado TLS de verdade serve. A única coisa que você precisa acertar é **upgrades de WebSocket** — o purplemux os usa para I/O de terminal, sync de status e a timeline ao vivo.

Nginx (esboço):

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy é mais simples — `reverse_proxy 127.0.0.1:8022` lida automaticamente com os headers de upgrade.

Sem o forwarding de `Upgrade` / `Connection`, o painel renderiza, mas os terminais nunca conectam e o status fica travado. Se algo parece meio funcionando, suspeite desses headers primeiro.

## Solucionando problemas

- **HTTPS ainda não provisionado** — o primeiro cert pode demorar um minuto. Re-rodar `tailscale serve --bg 8022` depois de uma breve espera geralmente resolve.
- **Navegador alerta sobre o cert** — confira se você está acessando exatamente a URL `<máquina>.<tailnet>.ts.net`, não o IP da LAN.
- **Mobile diz "não acessível"** — confirme que o celular está logado no mesmo tailnet e que o Tailscale está ativo nas configurações do SO.
- **Certificados autoassinados** — o Web Push não registra. Use Tailscale Serve ou um cert ACME real via reverse proxy.

## Próximos passos

- **[Configuração de PWA](/purplemux/pt-BR/docs/pwa-setup/)** — instale na tela de início agora que você tem HTTPS.
- **[Notificações Web Push](/purplemux/pt-BR/docs/web-push/)** — ligue alertas em background.
- **[Segurança e autenticação](/purplemux/pt-BR/docs/security-auth/)** — senha, hashing e o que a exposição via tailnet implica.
