---
title: Configuração de PWA
description: Adicione o purplemux à tela de início no iOS Safari e Android Chrome para uma experiência em tela cheia, igualzinha a um app.
eyebrow: Mobile e Remoto
permalink: /pt-BR/docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

Instalar o purplemux como Progressive Web App transforma a aba do navegador em um ícone autônomo na tela de início, com layout em tela cheia e splash screens decentes. No iOS, é também o pré-requisito para o Web Push.

## O que você ganha

- **Layout em tela cheia** — sem chrome do navegador, mais espaço vertical para terminal e timeline.
- **Ícone do app** — o purplemux é aberto a partir da tela de início, como qualquer app nativo.
- **Splash screens** — o purplemux entrega imagens de splash por dispositivo para iPhones, então a transição de abertura parece nativa.
- **Web Push** (apenas iOS) — notificações push só disparam após a instalação como PWA.

O manifest é servido em `/api/manifest` e registra `display: standalone` com a marca purplemux e a cor do tema.

## Antes de instalar

A página precisa estar acessível por **HTTPS** para o PWA funcionar. De `localhost` funciona no Chrome (exceção do loopback), mas o iOS Safari recusa instalar via HTTP plano. O caminho limpo é o Tailscale Serve — veja [Acesso via Tailscale](/purplemux/pt-BR/docs/tailscale/).

{% call callout('warning', 'iOS exige Safari 16.4 ou mais novo') %}
Versões anteriores do iOS conseguem instalar o PWA, mas não entregam Web Push. Se push importa para você, atualize o iOS primeiro. Detalhes navegador a navegador estão em [Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/).
{% endcall %}

## iOS Safari

1. Abra a URL do purplemux no **Safari** (outros navegadores iOS não expõem o Adicionar à Tela de Início para PWAs).
2. Toque no ícone **Compartilhar** na barra de ferramentas inferior.
3. Role o action sheet e escolha **Adicionar à Tela de Início**.
4. Edite o nome se quiser e toque em **Adicionar** no canto superior direito.
5. Abra o purplemux pelo novo ícone na tela de início — ele abre em tela cheia.

A primeira abertura pelo ícone é o momento em que o iOS trata aquilo como um PWA real. Qualquer prompt de permissão para push deve ser disparado dentro dessa janela standalone, não de uma aba comum do Safari.

## Android Chrome

O Chrome detecta automaticamente um manifest instalável e oferece um banner. Se ele não aparecer:

1. Abra a URL do purplemux no **Chrome**.
2. Toque no menu **⋮** no canto superior direito.
3. Escolha **Instalar app** (às vezes rotulado **Adicionar à Tela de início**).
4. Confirme. O ícone aparece na tela de início e na gaveta de apps.

O Samsung Internet se comporta da mesma forma — o prompt de instalação geralmente aparece automaticamente.

## Verificando a instalação

Abra o purplemux pelo ícone da tela de início. A barra de endereços do navegador deve ter sumido. Se você ainda vê UI do navegador, o manifest não foi aplicado — geralmente porque a página está sendo carregada por HTTP plano ou via algum proxy incomum.

Você também pode confirmar em **Configurações → Notificações** — quando o PWA está instalado e o Web Push é suportado, o toggle fica habilitado.

## Atualizando o PWA

Não há nada a fazer. O PWA carrega o mesmo `index.html` servido pela sua instância purplemux, então atualizar o purplemux atualiza o app instalado na próxima abertura.

Para remover, segure o ícone e use a ação de desinstalar nativa do SO.

## Próximos passos

- **[Notificações Web Push](/purplemux/pt-BR/docs/web-push/)** — ative os alertas em background agora que o PWA está instalado.
- **[Acesso via Tailscale](/purplemux/pt-BR/docs/tailscale/)** — obtenha a URL HTTPS que o iOS exige.
- **[Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/)** — matriz de compatibilidade completa.
