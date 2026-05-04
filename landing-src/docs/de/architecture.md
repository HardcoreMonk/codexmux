---
title: 아키텍처
description: 브라우저, Node.js 서버, tmux, Codex CLI가 맞물리는 구조.
eyebrow: 레퍼런스
permalink: /de/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

codexmux는 브라우저, Node.js 서버, 호스트의 tmux와 Codex CLI로 구성됩니다. 터미널 입출력은 tmux에 남기고 Codex 상태는 process tree와 `~/.codex/sessions/**/*.jsonl`에서 읽습니다. Windows에서 실행한 Codex CLI는 tmux에 attach하지 않고 companion client가 JSONL chunk를 서버로 동기화해 읽기 전용 timeline으로 보여줍니다. 별도 terminal bridge는 bridge가 시작한 Windows `pwsh`를 `/windows-terminal`에서 입력, 출력, resize, reconnect까지 제어합니다.

## 전체 구조

```text
브라우저 / PWA / Android WebView
  ├─ /api/terminal -> terminal-server.ts -> node-pty -> tmux -L codexmux -> codex
  ├─ /api/timeline -> timeline-server.ts -> Codex JSONL
  ├─ /api/status   -> status-server.ts   -> status-manager.ts
  ├─ /api/sync     -> sync-server.ts     -> workspace/layout store
  └─ /api/timeline/sessions -> session-index.ts -> local + remote Codex 목록

Windows companion
  └─ /api/remote/codex/sync -> remote-codex-store.ts -> ~/.codexmux/remote/codex/
```

WebSocket은 역할별로 분리되어 있고 upgrade 시 `session-token` cookie로 인증합니다. `/api/debug/perf`는 public health check가 아니라 session cookie 또는 `x-cmux-token`을 요구하는 진단 endpoint입니다.

## 브라우저

| 구성 | 역할 |
|---|---|
| xterm.js terminal | tmux output 렌더링, key/resize/title event 전송 |
| live timeline | Codex JSONL에서 파싱한 message, tool call, reasoning 표시 |
| status badge | `/api/status`를 통해 idle, busy, needs-input, review 표시 |
| sync client | 다른 기기에서 변경한 workspace와 layout 반영 |

## 서버

`server.ts`는 Next.js와 WebSocket server를 같은 port에서 제공합니다. `/api/install`은 첫 실행 설정을 처리하고, `/api/cli/*`는 `x-cmux-token`을 요구합니다.

| 경로 | 용도 |
|---|---|
| `/api/terminal` | terminal I/O stream |
| `/api/timeline` | Codex session timeline stream |
| `/api/timeline/sessions` | local/remote Codex session list page |
| `/api/status` | tab status sync와 notification ack |
| `/api/sync` | workspace state 동기화 |
| `/api/remote/codex/sync` | Windows companion JSONL chunk ingest |
| `/api/remote/codex/sources` | Windows source별 session/sync 요약 |
| `/api/debug/perf` | 인증된 runtime 성능 snapshot |

## tmux

codexmux는 `codexmux` socket에 격리된 tmux session을 만들고 `src/config/tmux.conf`를 적용합니다. 사용자의 `~/.tmux.conf`는 읽지 않습니다. session 이름은 `pt-{workspaceId}-{paneId}-{tabId}`입니다.

## Codex 연동

- `src/lib/codex-command.ts`가 `codex`와 `codex resume <sessionId>` command를 만듭니다.
- `src/lib/codex-session-detection.ts`가 pane process tree에서 `codex` process를 찾고, session id/process start time/live process cwd fallback 순서로 JSONL을 연결합니다.
- `src/lib/codex-session-parser.ts`가 JSONL을 timeline entry로 변환합니다.
- `src/lib/session-index.ts`가 Linux local JSONL과 Windows remote sidecar를 하나의 session list snapshot으로 정규화합니다. session list 요청은 필요한 page만 public shape로 변환합니다.
- `src/lib/remote-codex-store.ts`는 Windows companion이 보낸 JSONL chunk와 source metadata를 `~/.codexmux/remote/codex/`에 저장합니다. source filter와 source summary는 이 sidecar를 사용합니다.
- stats와 daily report는 같은 JSONL을 읽어 계산합니다. stats cache build는 동시 요청이 하나의 in-flight 작업을 공유합니다.
- timeline tail snapshot, diff short cache, session index, hidden-state polling guard는 source of truth를 바꾸지 않고 반복 계산과 렌더 비용을 줄입니다.

## 시작 순서

1. lock 획득.
2. config, shell path, auth 초기화.
3. tmux session scan과 config 적용.
4. workspace와 layout 로드.
5. 저장된 shell과 Codex session 자동 복구.
6. StatusManager와 WebSocket route 준비.
7. port, CLI token, bridge script 갱신.

{% call callout('warning', 'module graph 주의') %}
custom server와 Next.js route는 같은 process 안에 있지만 module graph가 다릅니다. 공유 singleton은 `globalThis` convention을 사용해야 합니다.
{% endcall %}

## 다음 단계

- **[데이터 디렉터리](/codexmux/de/docs/data-directory/)**
- **[CLI 레퍼런스](/codexmux/de/docs/cli-reference/)**
- **[문제 해결](/codexmux/de/docs/troubleshooting/)**
