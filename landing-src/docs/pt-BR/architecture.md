---
title: Arquitetura
description: Como o navegador, o servidor Node.js, o tmux e o CLI Claude se encaixam.
eyebrow: Referência
permalink: /pt-BR/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux são três camadas costuradas: um front-end no navegador, um servidor Node.js em `:8022` e tmux + CLI Claude no host. Tudo entre elas é WebSocket binário ou um pequeno POST HTTP.

## As três camadas

```
Browser                         Node.js server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

Cada WebSocket tem um propósito único; não multiplexam. A autenticação é um cookie JWT do NextAuth verificado no upgrade do WS.

## Navegador

O front-end é um app Next.js (Pages Router). As peças que falam com o servidor:

| Componente | Biblioteca | Propósito |
|---|---|---|
| Painel de terminal | `xterm.js` | Renderiza bytes de `/api/terminal`. Emite teclas, eventos de resize, mudanças de título (`onTitleChange`). |
| Timeline da sessão | React + `useTimeline` | Renderiza turnos do Claude vindos de `/api/timeline`. Sem derivação de `cliState` — isso é tudo no servidor. |
| Indicadores de status | Zustand `useTabStore` | Badges de aba, pontos da barra lateral, contagens de notificação dirigidos por mensagens de `/api/status`. |
| Sync multi-dispositivo | `useSyncClient` | Observa edições de workspace/layout feitas em outro dispositivo via `/api/sync`. |

Títulos de aba e o processo em primeiro plano vêm do evento `onTitleChange` do xterm.js — o tmux é configurado (`src/config/tmux.conf`) para emitir `#{pane_current_command}|#{pane_current_path}` a cada dois segundos, e `lib/tab-title.ts` faz o parsing.

## Servidor Node.js

`server.ts` é um servidor HTTP customizado que hospeda o Next.js mais quatro instâncias `WebSocketServer` do `ws` na mesma porta.

### Endpoints WebSocket

| Caminho | Handler | Direção | Uso |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | bidirecional, binário | I/O de terminal via `node-pty` conectado a uma sessão tmux |
| `/api/timeline` | `timeline-server.ts` | servidor → cliente | Stream de entradas de sessão Claude parseadas do JSONL |
| `/api/status` | `status-server.ts` | bidirecional, JSON | `status:sync` / `status:update` / `status:hook-event` do servidor, `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` do cliente |
| `/api/sync` | `sync-server.ts` | bidirecional, JSON | Estado de workspace cross-device |

Mais `/api/install` para o instalador de primeira execução (sem auth).

### Protocolo binário do terminal

`/api/terminal` usa um protocolo binário pequeno definido em `src/lib/terminal-protocol.ts`:

| Código | Nome | Direção | Payload |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | cliente → servidor | bytes de tecla |
| `0x01` | `MSG_STDOUT` | servidor → cliente | output do terminal |
| `0x02` | `MSG_RESIZE` | cliente → servidor | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | ambos | intervalo 30s, timeout 90s |
| `0x04` | `MSG_KILL_SESSION` | cliente → servidor | encerra a sessão tmux subjacente |
| `0x05` | `MSG_WEB_STDIN` | cliente → servidor | texto da barra de input web (entregue após sair do copy-mode) |

Backpressure: `pty.pause` quando WS `bufferedAmount > 1 MB`, retoma abaixo de `256 KB`. No máximo 32 conexões concorrentes por servidor; as mais antigas são cortadas além disso.

### Status manager

`src/lib/status-manager.ts` é a fonte única da verdade para `cliState`. Eventos de hook fluem por `/api/status/hook` (POST autenticado por token), são sequenciados (`eventSeq` por aba) e reduzidos para `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` pela `deriveStateFromEvent`. O watcher do JSONL atualiza só metadata, exceto por um único evento sintético `interrupt`.

Para a máquina de estados completa, veja [Status da sessão (STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md).

## Camada tmux

O purplemux roda um tmux isolado em um socket dedicado — `-L purple` — usando sua própria config em `src/config/tmux.conf`. Seu `~/.tmux.conf` nunca é lido.

Sessões são nomeadas `pt-{workspaceId}-{paneId}-{tabId}`. Um painel de terminal no navegador mapeia para uma sessão tmux, conectada via `node-pty`.

```
tmux socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← aba 1 do navegador
├── pt-ws-MMKl07-pa-1-tb-2   ← aba 2 do navegador
└── pt-ws-MMKl07-pa-2-tb-1   ← split pane, aba 1
```

`prefix` está desabilitado, a status bar está off (o xterm.js desenha o chrome), `set-titles` está on e `mouse on` coloca a roda em copy-mode. O tmux é o motivo de as sessões sobreviverem a um navegador fechado, queda de Wi-Fi ou restart do servidor.

Para o setup completo do tmux, wrapper de comando e detalhes de detecção de processo, veja [tmux & detecção de processo (TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md).

## Integração com o CLI Claude

O purplemux não dá fork nem embrulha o Claude — o binário `claude` é simplesmente o que você tem instalado. Duas coisas são adicionadas:

1. **Configurações de hook** — Na inicialização, `ensureHookSettings()` escreve `~/.purplemux/hooks.json`, `status-hook.sh` e `statusline.sh`. Cada aba Claude inicia com `--settings ~/.purplemux/hooks.json`, então `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `PreCompact`, `PostCompact` todos POSTam de volta ao servidor.
2. **Leituras de JSONL** — `~/.claude/projects/**/*.jsonl` é parseado por `timeline-server.ts` para a visualização de conversa ao vivo, e observado por `session-detection.ts` para detectar um processo Claude em execução, via os arquivos PID em `~/.claude/sessions/`.

Os scripts de hook leem `~/.purplemux/port` e `~/.purplemux/cli-token` e POSTam com `x-pmux-token`. Eles falham silenciosamente se o servidor está fora, então fechar o purplemux enquanto o Claude está rodando não quebra nada.

## Sequência de inicialização

`server.ts:start()` percorre estes passos em ordem:

1. `acquireLock(port)` — guarda de instância única via `~/.purplemux/pmux.lock`
2. `initConfigStore()` + `initShellPath()` (resolve o `PATH` do shell de login do usuário)
3. `initAuthCredentials()` — carrega senha hashada com scrypt e secret HMAC no env
4. `scanSessions()` + `applyConfig()` — limpa sessões tmux mortas, aplica `tmux.conf`
5. `initWorkspaceStore()` — carrega `workspaces.json` e `layout.json` por workspace
6. `autoResumeOnStartup()` — relança shells nos diretórios salvos, tenta resume do Claude
7. `getStatusManager().init()` — inicia o polling de metadata
8. `app.prepare()` (Next.js dev) ou `require('.next/standalone/server.js')` (prod)
9. `listenWithFallback()` em `bindPlan.host:port` (`0.0.0.0` ou `127.0.0.1` conforme política de acesso)
10. `ensureHookSettings(result.port)` — escreve ou atualiza scripts de hook com a porta real
11. `getCliToken()` — lê ou gera `~/.purplemux/cli-token`
12. `writeAllClaudePromptFiles()` — atualiza o `claude-prompt.md` de cada workspace

A janela entre a resolução da porta e o passo 10 é o motivo de os scripts de hook serem regerados a cada inicialização: precisam da porta real embutida.

## Servidor customizado vs. grafo de módulos do Next.js

{% call callout('warning', 'Dois grafos de módulos em um processo') %}
O servidor customizado externo (`server.ts`) e o Next.js (pages + API routes) compartilham um processo Node, mas **não** seus grafos de módulos. Qualquer coisa em `src/lib/*` importada pelos dois lados é instanciada duas vezes. Singletons que precisam ser compartilhados (StatusManager, sets de clientes WebSocket, o token CLI, locks de escrita em arquivo) penduram em chaves `globalThis.__pt*`. Veja `CLAUDE.md §18` para o racional completo.
{% endcall %}

## Onde ler mais

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — config tmux, wrapper de comando, tree walking, protocolo binário do terminal.
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — máquina de estados do CLI Claude, fluxo de hook, evento sintético de interrupt, watcher JSONL.
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — todos os arquivos que o purplemux escreve.

## Próximos passos

- **[Diretório de dados](/purplemux/pt-BR/docs/data-directory/)** — todos os arquivos que esta arquitetura toca.
- **[Referência da CLI](/purplemux/pt-BR/docs/cli-reference/)** — falando com o servidor por fora do navegador.
- **[Solução de problemas](/purplemux/pt-BR/docs/troubleshooting/)** — diagnosticando quando algo aqui se comporta mal.
