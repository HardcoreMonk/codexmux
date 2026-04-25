---
title: Status da sessão
description: Como o purplemux transforma a atividade do Claude Code em um badge de quatro estados — e por que ele atualiza quase instantaneamente.
eyebrow: Claude Code
permalink: /pt-BR/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

Toda sessão na barra lateral carrega um ponto colorido que diz, num relance, o que o Claude está fazendo. Esta página explica de onde esses quatro estados vêm e como eles se mantêm em sincronia sem você precisar abrir o terminal.

## Os quatro estados

| Estado | Indicador | Significado |
|---|---|---|
| **Idle** | nenhum / cinza | O Claude está esperando o seu próximo prompt. |
| **Busy** | spinner roxo | O Claude está processando — lendo, editando, executando ferramentas. |
| **Needs input** | pulso âmbar | Um prompt de permissão ou pergunta está aguardando você. |
| **Review** | pulso roxo | O Claude terminou e tem algo para você conferir. |

Um quinto valor, **unknown**, aparece brevemente para abas que estavam `busy` quando o servidor reiniciou. Ele se resolve sozinho assim que o purplemux consegue verificar a sessão de novo.

## Hooks são a fonte da verdade

O purplemux instala uma configuração de hook do Claude Code em `~/.purplemux/hooks.json` e um pequeno script de shell em `~/.purplemux/status-hook.sh`. O script é registrado para cinco eventos de hook do Claude Code e dá POST de cada um no servidor local com um token CLI:

| Hook do Claude Code | Estado resultante |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | busy |
| `Notification` (apenas permissão) | needs-input |
| `Stop` / `StopFailure` | review |
| `PreCompact` / `PostCompact` | mostra o indicador de compacting (estado inalterado) |

Como os hooks disparam no momento em que o Claude Code transita de estado, a barra lateral atualiza antes de você notar no terminal.

{% call callout('note', 'Apenas notificações de permissão') %}
O hook `Notification` do Claude dispara por vários motivos. O purplemux só vira para **needs-input** quando a notificação é `permission_prompt` ou `worker_permission_prompt`. Lembretes de inatividade e outros tipos de notificação não acionam o badge.
{% endcall %}

## Detecção de processo roda em paralelo

Saber se o Claude CLI está realmente rodando é rastreado separadamente do estado de trabalho. Dois caminhos cooperam:

- **Mudanças de título do tmux** — todo painel reporta `pane_current_command|pane_current_path` como título. O xterm.js entrega a mudança via `onTitleChange`, e o purplemux dispara um ping para `/api/check-claude` para confirmar.
- **Walk na árvore de processos** — no servidor, `detectActiveSession` olha o PID do shell do painel, percorre os filhos e bate com os arquivos de PID que o Claude escreve em `~/.claude/sessions/`.

Se o diretório não existir, a UI mostra a tela "Claude not installed" no lugar do ponto de status.

## O watcher do JSONL preenche as lacunas

O Claude Code escreve um JSONL de transcrição para cada sessão em `~/.claude/projects/`. Enquanto uma aba está `busy`, `needs-input`, `unknown` ou `ready-for-review`, o purplemux observa esse arquivo com `fs.watch` por dois motivos:

- **Metadata** — ferramenta atual, último trecho do assistente, contagem de tokens. Esses dados fluem para a timeline e a barra lateral sem alterar o estado.
- **Interrupt sintético** — quando você pressiona Esc no meio do stream, o Claude grava `[Request interrupted by user]` no JSONL mas não dispara hook. O watcher detecta essa linha e sintetiza um evento `interrupt`, para que a aba volte ao idle em vez de ficar travada em busy.

## Polling é rede de segurança, não o motor

Um polling de metadata roda a cada 30–60 segundos, dependendo da quantidade de abas. Ele **não** decide o estado — isso é estritamente do caminho de hook. O polling existe para:

- Descobrir novos painéis tmux
- Recuperar qualquer sessão que tenha ficado busy por mais de 10 minutos com um processo Claude morto
- Atualizar informações de processo, portas e títulos

Esse é o "fallback polling de 5–15s" mencionado na landing page, devagarzão e reduzido depois que os hooks provaram ser confiáveis.

## Sobrevivendo a um restart do servidor

Hooks não disparam enquanto o purplemux está fora, então qualquer estado em trânsito pode ficar desatualizado. A regra de recuperação é conservadora:

- `busy` persistido vira `unknown` e é reverificado: se o Claude não está mais rodando, a aba vira idle silenciosamente; se o JSONL termina limpo, vira review.
- Todos os outros estados — `idle`, `needs-input`, `ready-for-review` — têm a bola do seu lado, então persistem intactos.

Nenhuma mudança automática de estado durante a recuperação envia notificação push. Você só é notificado quando trabalho *novo* atravessa para needs-input ou review.

## Onde o estado aparece

- Ponto na linha da sessão da barra lateral
- Ponto na barra de abas em cada painel
- Ponto do workspace (estado de maior prioridade no workspace)
- Contagens do ícone de sino e a folha de notificações
- Título da aba do navegador (conta itens que pedem atenção)
- Notificações Web Push e de desktop para `needs-input` e `ready-for-review`

## Próximos passos

- **[Prompts de permissão](/purplemux/pt-BR/docs/permission-prompts/)** — o fluxo por trás do estado **needs-input**.
- **[Visualização de sessão ao vivo](/purplemux/pt-BR/docs/live-session-view/)** — o que a timeline mostra quando uma aba está `busy`.
- **[Primeira sessão](/purplemux/pt-BR/docs/first-session/)** — o tour pelo painel, em contexto.
