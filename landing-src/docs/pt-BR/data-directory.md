---
title: Diretório de dados
description: O que vive em ~/.purplemux/, o que pode ser apagado com segurança e como fazer backup.
eyebrow: Referência
permalink: /pt-BR/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

Cada peça de estado persistente que o purplemux mantém — configurações, layouts, histórico de sessão, caches — vive em `~/.purplemux/`. Mais nada. Sem `localStorage`, sem keychain do sistema, sem serviço externo.

## Estrutura geral

```
~/.purplemux/
├── config.json              # config do app (auth, tema, locale, …)
├── workspaces.json          # lista de workspaces + estado da barra lateral
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # árvore de painéis/abas
│       ├── message-history.json  # histórico de input por workspace
│       └── claude-prompt.md      # conteúdo do --append-system-prompt-file
├── hooks.json               # hook do Claude Code + config de statusline (gerado)
├── status-hook.sh           # script de hook (gerado, 0755)
├── statusline.sh            # script de statusline (gerado, 0755)
├── rate-limits.json         # último JSON de statusline
├── session-history.json     # log de sessões Claude concluídas (cross-workspace)
├── quick-prompts.json       # quick prompts customizados + built-ins desabilitados
├── sidebar-items.json       # itens customizados da barra lateral + built-ins desabilitados
├── vapid-keys.json          # par VAPID de Web Push (gerado)
├── push-subscriptions.json  # endpoints de assinatura de Web Push
├── cli-token                # token de auth do CLI (gerado)
├── port                     # porta atual do servidor
├── pmux.lock                # lock de instância única {pid, port, startedAt}
├── logs/                    # arquivos de log com pino-roll
├── uploads/                 # imagens anexadas pela barra de input
└── stats/                   # cache de estatísticas de uso do Claude
```

Arquivos com segredos (config, tokens, layouts, chaves VAPID, lock) são gravados com modo `0600` via padrão `tmpFile → rename`.

## Arquivos de topo

| Arquivo | O que guarda | Pode apagar? |
|---|---|---|
| `config.json` | senha hash com scrypt, secret HMAC de sessão, tema, locale, tamanho de fonte, toggle de notificações, URL do editor, acesso de rede, custom CSS | Sim — refaz o onboarding |
| `workspaces.json` | índice de workspaces, largura/estado recolhido da barra lateral, ID do workspace ativo | Sim — apaga todos os workspaces e abas |
| `hooks.json` | mapeamento `--settings` do Claude Code (evento → script) + `statusLine.command` | Sim — regenerado no próximo start |
| `status-hook.sh`, `statusline.sh` | POST para `/api/status/hook` e `/api/status/statusline` com `x-pmux-token` | Sim — regenerados no próximo start |
| `rate-limits.json` | último JSON de statusline do Claude: `ts`, `model`, `five_hour`, `seven_day`, `context`, `cost` | Sim — repopula conforme o Claude roda |
| `session-history.json` | últimas 200 sessões Claude concluídas (prompts, resultados, durações, ferramentas, arquivos) | Sim — limpa o histórico |
| `quick-prompts.json`, `sidebar-items.json` | `{ custom: […], disabledBuiltinIds: […], order: […] }` sobrepostos às listas built-in | Sim — restaura os padrões |
| `vapid-keys.json` | par VAPID de Web Push, gerado na primeira execução | Não, a menos que apague também `push-subscriptions.json` (assinaturas existentes quebram) |
| `push-subscriptions.json` | endpoints push por navegador | Sim — reassine em cada dispositivo |
| `cli-token` | token hex de 32 bytes para a CLI `purplemux` e scripts de hook (header `x-pmux-token`) | Sim — regenerado no próximo start, mas qualquer script de hook já gerado mantém o token antigo até o servidor sobrescrever |
| `port` | porta atual em texto plano, lida pelos scripts de hook e pela CLI | Sim — regenerado no próximo start |
| `pmux.lock` | guarda de instância única `{ pid, port, startedAt }` | Só se nenhum processo purplemux estiver vivo |

{% call callout('warning', 'Pegadinhas do lock file') %}
Se o purplemux se recusa a iniciar com "already running" mas nenhum processo está vivo, o `pmux.lock` ficou pendurado. `rm ~/.purplemux/pmux.lock` e tente de novo. Se você já rodou o purplemux com `sudo`, o arquivo pode estar como root — `sudo rm` uma vez.
{% endcall %}

## Diretório por workspace (`workspaces/{wsId}/`)

Cada workspace ganha sua pasta, nomeada pelo ID gerado.

| Arquivo | Conteúdo |
|---|---|
| `layout.json` | árvore recursiva de painéis/abas: nós folha `pane` com `tabs[]`, nós `split` com `children[]` e `ratio`. Cada aba carrega seu nome de sessão tmux (`pt-{wsId}-{paneId}-{tabId}`), `cliState` em cache, `claudeSessionId`, último comando de resume. |
| `message-history.json` | histórico de input do Claude por workspace. Limitado a 500 entradas. |
| `claude-prompt.md` | o conteúdo do `--append-system-prompt-file` passado a cada aba Claude desse workspace. Regerado em criar/renomear/mudança de diretório. |

Apagar um único `workspaces/{wsId}/layout.json` reseta o layout daquele workspace para um painel padrão sem mexer nos outros.

## `logs/`

Saída do Pino-roll, um arquivo por dia UTC, com sufixo numérico quando o limite de tamanho é excedido:

```
logs/purplemux.2026-04-19.1.log
```

Nível padrão é `info`. Sobrescreva com `LOG_LEVEL` ou por módulo com `LOG_LEVELS` — veja [Portas e variáveis de ambiente](/purplemux/pt-BR/docs/ports-env-vars/).

Logs rodam semanalmente (limite de 7 arquivos). Pode apagar a qualquer momento.

## `uploads/`

Imagens anexadas pela barra de input do chat (drag, paste, clipe):

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- Permitidos: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Máximo 10 MB por arquivo, modo `0600`
- Auto-limpos no start do servidor: qualquer coisa com mais de 24 horas é removida
- Limpeza manual em **Configurações → Sistema → Imagens anexadas → Limpar agora**

## `stats/`

Cache puro. Derivado de `~/.claude/projects/**/*.jsonl` — o purplemux só lê esse diretório.

| Arquivo | Conteúdo |
|---|---|
| `cache.json` | agregados por dia: mensagens, sessões, chamadas de ferramenta, contagens horárias, uso de tokens por modelo |
| `uptime-cache.json` | rollup diário de uptime / minutos ativos |
| `daily-reports/{YYYY-MM-DD}.json` | briefing diário gerado por IA |

Apague a pasta inteira para forçar uma recomputação na próxima requisição de stats.

## Matriz de reset

| Para resetar… | Apague |
|---|---|
| Senha de login (refazer onboarding) | `config.json` |
| Todos os workspaces e abas | `workspaces.json` + `workspaces/` |
| Layout de um workspace | `workspaces/{wsId}/layout.json` |
| Estatísticas de uso | `stats/` |
| Assinaturas de push | `push-subscriptions.json` |
| "Already running" travado | `pmux.lock` (apenas se nenhum processo vivo) |
| Tudo (factory reset) | `~/.purplemux/` |

`hooks.json`, `status-hook.sh`, `statusline.sh`, `port`, `cli-token` e `vapid-keys.json` são todos regerados na próxima inicialização, então apagá-los é inofensivo.

## Backups

Todo o diretório é JSON puro mais alguns scripts de shell. Para fazer backup:

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

Para restaurar em uma máquina nova, descompacte e inicie o purplemux. Os scripts de hook serão reescritos com a porta do novo servidor; tudo o mais (workspaces, histórico, configurações) volta como está.

{% call callout('warning') %}
Não restaure `pmux.lock` — ele está atrelado a um PID específico e bloqueará a inicialização. Exclua: `--exclude pmux.lock`.
{% endcall %}

## Apagar tudo

```bash
rm -rf ~/.purplemux
```

Verifique antes que nenhum purplemux está rodando. A próxima abertura será a experiência de primeira execução de novo.

## Próximos passos

- **[Portas e variáveis de ambiente](/purplemux/pt-BR/docs/ports-env-vars/)** — cada variável que influencia este diretório.
- **[Arquitetura](/purplemux/pt-BR/docs/architecture/)** — como os arquivos se conectam ao servidor em execução.
- **[Solução de problemas](/purplemux/pt-BR/docs/troubleshooting/)** — questões comuns e correções.
