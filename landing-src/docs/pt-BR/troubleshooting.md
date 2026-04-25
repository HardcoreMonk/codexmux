---
title: Solução de problemas e FAQ
description: Problemas comuns, respostas rápidas e as perguntas que aparecem com mais frequência.
eyebrow: Referência
permalink: /pt-BR/docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

Se algo aqui não bate com o que você está vendo, por favor [abra uma issue](https://github.com/subicura/purplemux/issues) com sua plataforma, navegador e o arquivo de log relevante de `~/.purplemux/logs/`.

## Instalação e inicialização

### `tmux: command not found`

O purplemux precisa de tmux 3.0+ no host. Instale:

```bash
# macOS (Homebrew)
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

Verifique com `tmux -V`. tmux 2.9+ tecnicamente passa no preflight, mas testamos contra 3.0+.

### `node: command not found` ou "Node.js 20 or newer"

Instale Node 20 LTS ou mais novo. Cheque com `node -v`. O app nativo de macOS empacota seu próprio Node, então isso só vale para os caminhos `npx` / `npm install -g`.

### "purplemux is already running (pid=…, port=…)"

Outra instância do purplemux está viva e respondendo em `/api/health`. Use ela (abra a URL impressa) ou pare antes:

```bash
# encontre
ps aux | grep purplemux

# ou simplesmente mate via lock file
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### Lock pendurado — recusa iniciar, mas nenhum processo está rodando

`~/.purplemux/pmux.lock` ficou para trás. Remova:

```bash
rm ~/.purplemux/pmux.lock
```

Se você já rodou o purplemux com `sudo`, o arquivo pode estar como root — `sudo rm` uma vez.

### `Port 8022 is in use, finding an available port...`

Outro processo é dono de `8022`. O servidor cai para uma porta livre aleatória e imprime a nova URL. Para escolher você mesmo:

```bash
PORT=9000 purplemux
```

Descubra o que está segurando `8022` com `lsof -iTCP:8022 -sTCP:LISTEN -n -P`.

### Funciona no Windows?

**Não oficialmente.** O purplemux depende de `node-pty` e tmux, que não rodam nativamente no Windows. O WSL2 normalmente funciona (você está efetivamente em Linux então), mas está fora do nosso escopo de testes.

## Sessões e restore

### Fechar o navegador matou tudo

Não deveria — o tmux mantém todo shell aberto no servidor. Se atualizar a página não traz as abas de volta:

1. Confira que o servidor ainda está rodando (`http://localhost:8022/api/health`).
2. Confira que as sessões tmux existem: `tmux -L purple ls`.
3. Olhe `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log` por erros durante `autoResumeOnStartup`.

Se o tmux disser "no server running", o host reiniciou ou algo matou o tmux. As sessões se foram, mas o layout (workspaces, abas, diretórios de trabalho) está preservado em `~/.purplemux/workspaces/{wsId}/layout.json` e é relançado no próximo start do purplemux.

### Uma sessão Claude não dá resume

`autoResumeOnStartup` re-executa o `claude --resume <uuid>` salvo para cada aba, mas se o `~/.claude/projects/.../sessionId.jsonl` correspondente não existe mais (deletado, arquivado ou o projeto foi movido) o resume falha. Abra a aba e inicie uma nova conversa.

### Minhas abas estão todas em "unknown"

`unknown` significa que uma aba estava `busy` antes de um restart do servidor e a recuperação ainda está em andamento. `resolveUnknown` roda em background e confirma `idle` (Claude saiu) ou `ready-for-review` (mensagem final do assistente presente). Se uma aba fica travada em `unknown` por mais de dez minutos, a **rede de segurança de busy travado** vira silenciosamente para `idle`. Veja [STATUS.md](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) para a máquina de estados completa.

## Navegador e UI

### Notificações Web Push não disparam

Percorra o checklist:

1. **Apenas iOS Safari ≥ 16.4.** iOS anterior não tem Web Push.
2. **Tem que ser PWA no iOS.** Toque em **Compartilhar → Adicionar à Tela de Início** primeiro; o push não dispara em uma aba comum do Safari.
3. **HTTPS é obrigatório.** Certificados autoassinados não funcionam — o Web Push se recusa a registrar silenciosamente. Use Tailscale Serve (Let's Encrypt grátis) ou um domínio real atrás de Nginx / Caddy.
4. **Permissão de notificação concedida.** **Configurações → Notificações → On** no purplemux *e* a permissão em nível de navegador, ambas precisam estar permitidas.
5. **Assinaturas existem.** `~/.purplemux/push-subscriptions.json` deve ter uma entrada para o dispositivo. Se vazio, conceda a permissão de novo.

Veja [Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/) para a matriz completa de compatibilidade.

### iOS Safari 16.4+ mas ainda sem notificações

Algumas versões de iOS perdem a assinatura depois de muito tempo com o PWA fechado. Abra o PWA, negue e conceda de novo a permissão de notificações, e cheque o `push-subscriptions.json` outra vez.

### Janela privada do Safari não persiste nada

IndexedDB é desabilitado em janelas privadas do Safari 17+, então o cache de workspace não sobrevive a um restart. Use uma janela normal.

### Terminal mobile some depois de mandar para background

O iOS Safari desmonta o WebSocket depois de cerca de 30s em background. O tmux mantém a sessão real viva — quando você volta para a aba, o purplemux reconecta e re-renderiza. Isso é iOS, não nós.

### Firefox + Tailscale serve = aviso de certificado

Se seu tailnet usa um domínio customizado que não é `*.ts.net`, o Firefox é mais exigente do que o Chrome com a confiança de HTTPS. Aceite o certificado uma vez e ele fica.

### "Browser too old" ou recursos faltando

Rode **Configurações → Verificação de navegador** para um relatório por API. Qualquer coisa abaixo dos mínimos em [Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/) perde recursos com gracioso, mas não é suportado.

## Rede e acesso remoto

### Posso expor o purplemux na internet?

Pode, mas sempre por HTTPS. Recomendado:

1. **Tailscale Serve** — `tailscale serve --bg 8022` te dá criptografia WireGuard + certificados automáticos. Sem port forwarding.
2. **Reverse proxy** — Nginx / Caddy / Traefik. Lembre-se de encaminhar os headers `Upgrade` e `Connection`, senão WebSockets quebram.

HTTP plano na internet aberta é uma má ideia — o cookie de auth é HMAC-assinado, mas os payloads de WebSocket (bytes do terminal!) não são criptografados.

### Outros dispositivos da minha LAN não acessam o purplemux

Por padrão, o purplemux só permite localhost. Abra acesso via env ou pelas configurações no app:

```bash
HOST=lan,localhost purplemux       # amigável para LAN
HOST=tailscale,localhost purplemux # amigável para tailnet
HOST=all purplemux                 # tudo
```

Ou **Configurações → Acesso de rede** no app, que grava em `~/.purplemux/config.json`. (Quando `HOST` está definido por env, esse campo fica travado.) Veja [Portas e variáveis de ambiente](/purplemux/pt-BR/docs/ports-env-vars/) para a sintaxe de keyword e CIDR.

### Problemas de WebSocket no reverse proxy

Se `/api/terminal` conecta e cai imediatamente, o proxy está retirando os headers `Upgrade` / `Connection`. Nginx mínimo:

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy: encaminhamento de WebSocket é o padrão; basta `reverse_proxy 127.0.0.1:8022`.

## Dados e armazenamento

### Onde estão meus dados?

Tudo é local em `~/.purplemux/`. Nada sai da sua máquina. A senha de login é um hash scrypt em `config.json`. Veja [Diretório de dados](/purplemux/pt-BR/docs/data-directory/) para a estrutura completa.

### Esqueci minha senha

Apague `~/.purplemux/config.json` e reinicie. O onboarding recomeça. Workspaces, layouts e histórico ficam preservados (são arquivos separados).

### Indicador da aba travado em "busy" para sempre

A `rede de segurança de busy travado` vira a aba silenciosamente para `idle` depois de dez minutos se o processo Claude morreu. Se você não quer esperar, feche e reabra a aba — isso reseta o estado local e o próximo evento de hook continua de uma base limpa. Para investigação de causa raiz, rode com `LOG_LEVELS=hooks=debug,status=debug`.

### Conflita com a minha config tmux existente?

Não. O purplemux roda um tmux isolado em um socket dedicado (`-L purple`) com sua própria config (`src/config/tmux.conf`). Seu `~/.tmux.conf` e qualquer sessão tmux existente ficam intactos.

## Custo e uso

### O purplemux economiza dinheiro?

Não diretamente. O que ele faz é **tornar o uso transparente**: custo de hoje / mês / por projeto, quebra de tokens por modelo e contagens regressivas de rate-limit 5h / 7d em uma tela só, para você se ritmar antes de bater na parede.

### O purplemux em si é pago?

Não. O purplemux é open-source com licença MIT. O uso do Claude Code é cobrado pela Anthropic separadamente.

### Meus dados são enviados para algum lugar?

Não. O purplemux é totalmente self-hosted. As únicas chamadas de rede que ele faz são para o CLI Claude local (que conversa com a Anthropic por conta) e a checagem de versão via `update-notifier` na inicialização. Desligue a checagem com `NO_UPDATE_NOTIFIER=1`.

## Próximos passos

- **[Suporte a navegadores](/purplemux/pt-BR/docs/browser-support/)** — matriz detalhada de compatibilidade e peculiaridades conhecidas.
- **[Diretório de dados](/purplemux/pt-BR/docs/data-directory/)** — o que cada arquivo faz e o que pode ser apagado.
- **[Arquitetura](/purplemux/pt-BR/docs/architecture/)** — como as peças se encaixam quando algo precisa de uma análise mais profunda.
