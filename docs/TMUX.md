# tmux, 터미널, agent process 감지

codexmux는 오래 살아야 하는 터미널 backend로 tmux를 사용한다. 브라우저는 xterm.js를 렌더링하고, 서버는 node-pty로 tmux session에 붙는다.

## 구조

```text
Browser (xterm.js)
  │ WebSocket /api/terminal
  ▼
terminal-server.ts
  │ node-pty attach-session
  ▼
tmux -L codexmux
  ├─ pt-{workspaceId}-{paneId}-{tabId}
  └─ ...
```

- socket name: `codexmux`
- session name: `pt-{workspaceId}-{paneId}-{tabId}`
- config: `src/config/tmux.conf`
- 사용자 `~/.tmux.conf`: 읽지 않음

## tmux 설정

| 설정 | 값 | 목적 |
|---|---|---|
| `prefix` | disabled | key를 shell/Codex로 직접 전달 |
| `status` | off | tmux chrome 숨김 |
| `set-titles` | on | foreground process와 cwd 전달 |
| `set-titles-string` | `#{pane_current_command}\|#{pane_current_path}` | process/cwd 감지 protocol |
| `status-interval` | `2` | 2초마다 title metadata refresh |
| `mouse` | on | scroll/copy 활성화 |
| `history-limit` | `5000` | tmux scrollback |

## terminal WebSocket

Endpoint는 `/api/terminal?session={name}&clientId={id}`다.

| code | 이름 | 방향 | payload |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | client -> server | key byte |
| `0x01` | `MSG_STDOUT` | server -> client | terminal output |
| `0x02` | `MSG_RESIZE` | client -> server | `cols`, `rows` |
| `0x03` | `MSG_HEARTBEAT` | 양방향 | keepalive |
| `0x04` | `MSG_KILL_SESSION` | client -> server | tmux session 종료 |
| `0x05` | `MSG_WEB_STDIN` | client -> server | web input bar text |

WebSocket backpressure가 커지면 pty output을 잠시 멈추고 client가 따라잡으면 재개한다.

## title metadata

tmux title은 다음 형식이다.

```text
{pane_current_command}|{pane_current_path}
```

`src/lib/tab-title.ts`는 이 값을 파싱해 foreground process, cwd, tab title, shell readiness를 갱신한다.

## Codex 감지

`src/lib/codex-session-detection.ts`는 다음 순서로 Codex session을 감지한다.

1. `codex --version` 또는 `~/.codex/` 존재 확인.
2. pane shell PID 아래 child process 탐색.
3. Linux는 `/proc/{pid}/task/{pid}/children`을 우선 사용하고, 다른 플랫폼은 process utility fallback을 사용한다.
4. process command에서 `codex`를 확인하고 cwd를 읽는다.
5. `~/.codex/sessions/` 아래 JSONL을 session id 또는 cwd로 매칭.

새 코드에서 process/title/session 정보를 다룰 때는 직접 process command를 흩뿌리지 않고 기존 helper를 우선 사용한다.

| helper | 파일 | 용도 |
|---|---|---|
| `getPaneCurrentCommand(session)` | `src/lib/tmux.ts` | foreground process name |
| `getSessionCwd(session)` | `src/lib/tmux.ts` | pane cwd |
| `getSessionPanePid(session)` | `src/lib/tmux.ts` | pane shell PID |
| `checkTerminalProcess(session)` | `src/lib/tmux.ts` | resume 전 shell 확인 |
| `isCodexRunning(panePid)` | `src/lib/codex-session-detection.ts` | Codex process 감지 |
| `detectActiveCodexSession(panePid)` | `src/lib/codex-session-detection.ts` | active Codex session metadata |

## 서버 시작 순서

1. `~/.codexmux/cmux.lock` 획득.
2. config와 shell `PATH` 로드.
3. auth credential 초기화.
4. tmux session scan과 cleanup.
5. `src/config/tmux.conf` 적용.
6. workspace와 layout 로드.
7. 설정된 경우 agent session 자동 resume.
8. `StatusManager` polling 시작.
9. Next.js와 WebSocket route 준비.
10. `~/.codexmux/port`, CLI token, bridge file 갱신.

## 관련 파일

| 파일 | 역할 |
|---|---|
| `src/lib/tmux.ts` | tmux command wrapper |
| `src/lib/terminal-server.ts` | terminal WebSocket과 node-pty bridge |
| `src/lib/terminal-protocol.ts` | binary protocol constant |
| `src/lib/codex-session-detection.ts` | Codex process/session detection |
| `src/lib/status-manager.ts` | process/status polling |
| `src/lib/tab-title.ts` | client title parser |
