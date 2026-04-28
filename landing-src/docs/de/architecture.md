---
title: 아키텍처
description: 브라우저, Node.js 서버, tmux, Codex CLI가 맞물리는 구조.
eyebrow: 레퍼런스
permalink: /de/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

codexmux는 브라우저, Node.js 서버, 호스트의 tmux와 Codex CLI로 구성됩니다. 터미널 입출력은 tmux에 남기고 Codex 상태는 process tree와 `~/.codex/sessions/**/*.jsonl`에서 읽습니다.

## 전체 구조

```text
브라우저
  ├─ /api/terminal -> terminal-server.ts -> node-pty -> tmux -L codexmux -> codex
  ├─ /api/timeline -> timeline-server.ts -> Codex JSONL
  ├─ /api/status   -> status-server.ts   -> status-manager.ts
  └─ /api/sync     -> sync-server.ts     -> workspace/layout store
```

WebSocket은 역할별로 분리되어 있고 upgrade 시 NextAuth JWT cookie로 인증합니다.

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
| `/api/status` | tab status sync와 notification ack |
| `/api/sync` | workspace state 동기화 |

## tmux

codexmux는 `codexmux` socket에 격리된 tmux session을 만들고 `src/config/tmux.conf`를 적용합니다. 사용자의 `~/.tmux.conf`는 읽지 않습니다. session 이름은 `pt-{workspaceId}-{paneId}-{tabId}`입니다.

## Codex 연동

- `src/lib/codex-command.ts`가 `codex`와 `codex resume <sessionId>` command를 만듭니다.
- `src/lib/codex-session-detection.ts`가 pane process tree에서 `codex` process를 찾습니다.
- `src/lib/codex-session-parser.ts`가 JSONL을 timeline entry로 변환합니다.
- stats와 daily report는 같은 JSONL을 읽어 계산합니다.

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
