---
title: 아키텍처
description: custom Node server, Next.js Pages Router, runtime v2와 Codex CLI가 맞물리는 구조.
eyebrow: 레퍼런스
permalink: /ko/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

codexmux는 browser/Electron, outer custom Node server, Next.js Pages Router, runtime v2 worker와 terminal runtime adapter로 구성됩니다. 현재 legacy tmux adapter와 Windows node-pty/ConPTY adapter가 공존합니다. Codex 상태와 timeline은 process tree와 `~/.codex/sessions/**/*.jsonl`을 읽어 구성합니다.

## 전체 구조

```text
Browser / Electron
  │ HTTP + WebSocket
  ▼
outer custom Node server
  ├─ exact upload route ownership
  ├─ Next.js Pages Router + auth proxy
  └─ WebSocket routing
       ▼
runtime v2 Supervisor
  ├─ terminal worker -> legacy tmux | Windows node-pty/ConPTY adapter
  ├─ storage worker  -> runtime-v2/state.db
  ├─ timeline worker -> Codex JSONL
  └─ status worker   -> process/status/notification
```

외부 client는 하나의 port를 사용합니다. production에서는 outer server가 internal Next standalone server를 proxy하며, internal port는 upload fallback surface가 아닙니다. WebSocket은 역할별로 분리되고 upgrade 시 session cookie로 인증합니다. `/api/debug/perf`는 public health check가 아니라 session cookie 또는 `x-cmux-token`을 요구하는 진단 endpoint입니다.

## 브라우저

| 구성 | 역할 |
|---|---|
| xterm.js terminal | terminal adapter output 렌더링, key/resize/title event 전송 |
| live timeline | Codex JSONL에서 파싱한 message, tool call, reasoning 표시 |
| status badge | `/api/status`를 통해 idle, busy, needs-input, review 표시 |
| sync client | 다른 기기에서 변경한 workspace와 layout 반영 |

## 서버

`server.ts`는 public HTTP/WebSocket lifecycle을 소유하고 Next.js를 같은 외부 port 뒤에 둡니다. 최초 설정 POST는 `/api/auth/setup`이 처리합니다. `/api/install`은 setup-local 또는 authenticated admission을 통과한 install PTY WebSocket이며, `/api/cli/*`는 `x-cmux-token`을 요구합니다.

| 경로 | 용도 |
|---|---|
| `/api/health` | public build/version health probe |
| `/api/terminal` | terminal I/O stream |
| `/api/v2/terminal` | runtime v2 terminal I/O stream |
| `/api/timeline` | Codex session timeline stream |
| `/api/timeline/sessions` | local Codex session list page |
| `/api/status` | tab status sync와 notification ack |
| `/api/sync` | workspace state 동기화 |
| `/api/install` | admission과 lease로 보호된 install PTY WebSocket |
| `/api/upload-image` | outer-owned raw image upload, 최대 10MiB |
| `/api/upload-file` | outer-owned raw file upload, 최대 50MiB |
| `/api/uploads/cleanup` | 인증된 committed/stale upload cleanup |
| `/api/debug/perf` | 인증된 runtime 성능 snapshot |

## Upload ingress

`/api/upload-image`와 `/api/upload-file`은 development Next handler나 production standalone proxy보다 먼저 outer server가 소비합니다. Browser request는 유효한 session cookie와 same-authority Origin이 필요하고, CLI token request는 Origin을 생략할 수 있습니다. `Content-Length`가 없는 chunked request, 중복/비정규 framing과 non-identity content encoding은 body를 읽기 전에 거절합니다.

Upload는 최대 8개/예약 200MiB를 동시에 admission하고 queue 없이 초과 request를 `429`로 닫습니다. 성공한 body는 `~/.codexmux/uploads/<workspace>/<tab>/`의 stage에 stream한 뒤 same-directory hard link로 no-replace publish합니다.

## Terminal runtime

Windows 제품 경로는 runtime v2 terminal worker 뒤의 Windows node-pty/ConPTY adapter를 사용합니다. Legacy 경로는 `codexmux` socket에 격리된 tmux session과 `src/config/tmux.conf`를 사용하며 사용자의 `~/.tmux.conf`는 읽지 않습니다. tmux는 새 domain boundary가 아니라 migration/rollback adapter입니다.

## Codex 연동

- `src/lib/codex-command.ts`가 `codex`와 `codex resume <sessionId>` command를 만듭니다.
- Codex hook event는 inline `hooks.SessionStart`, `hooks.UserPromptSubmit`, `hooks.Stop` override로 `status-hook.sh`에 연결합니다.
- `src/lib/codex-session-detection.ts`가 pane process tree에서 `codex` process를 찾고, session id/process start time/live process cwd fallback 순서로 JSONL을 연결합니다.
- `src/lib/codex-session-parser.ts`가 JSONL을 timeline entry로 변환합니다.
- `src/lib/session-index.ts`가 로컬 JSONL을 session list snapshot으로 정규화합니다. session list 요청은 필요한 page만 public shape로 변환하며, cold refresh 중에는 현재 snapshot과 `refreshing` 상태를 먼저 반환합니다.
- stats와 daily report는 같은 JSONL을 읽어 계산합니다. stats cache build는 동시 요청이 하나의 in-flight 작업을 공유합니다.
- timeline tail snapshot, diff short cache, session index, hidden-state polling guard는 source of truth를 바꾸지 않고 반복 계산과 렌더 비용을 줄입니다.

## 시작 순서

1. lock을 획득하고 config, shell path, strict auth state를 초기화합니다.
2. setup process라면 저장 network/`HOST`보다 우선해 loopback bind plan을 고정합니다.
3. legacy session을 scan하고 workspace/layout과 저장된 Codex session을 복구합니다.
4. runtime v2 Supervisor와 status/timeline/terminal worker를 준비합니다.
5. process-scoped UploadServer를 만들고 Next handler보다 앞에 연결합니다.
6. HTTP/WebSocket listener를 열고 실제 port와 CLI token을 갱신합니다.
7. expired committed upload와 stale reserved stage cleanup을 시작합니다.

{% call callout('warning', 'module graph 주의') %}
custom server와 Next.js route는 같은 process 안에 있지만 module graph가 다릅니다. 공유 singleton은 `globalThis` convention을 사용해야 합니다.
{% endcall %}

## 다음 단계

- **[데이터 디렉터리](/codexmux/ko/docs/data-directory/)**
- **[CLI 레퍼런스](/codexmux/ko/docs/cli-reference/)**
- **[문제 해결](/codexmux/ko/docs/troubleshooting/)**
