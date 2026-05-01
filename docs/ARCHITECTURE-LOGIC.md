# 아키텍처와 서비스 로직

이 문서는 codexmux의 아키텍처 흐름과 서비스 로직을 구현 기준으로 정리한다. 장기 설계 결정은 `ADR.md`, tmux와 WebSocket 세부는 `TMUX.md`, 상태 전이는 `STATUS.md`, 운영 서비스는 `SYSTEMD.md`를 기준 문서로 둔다.

## 핵심 구조

codexmux는 Next.js Pages Router UI, custom Node server, tmux session, Codex CLI JSONL을 하나의 운영 흐름으로 묶는다.

```text
Browser / Electron / Android WebView
  ├─ HTTP pages + API        -> Next.js Pages Router
  ├─ /api/terminal WebSocket -> terminal-server -> node-pty -> tmux -L codexmux
  ├─ /api/timeline WebSocket -> timeline-server -> Codex JSONL tail
  ├─ /api/status WebSocket   -> status-server -> StatusManager
  └─ /api/sync WebSocket     -> sync-server -> workspace/layout/config broadcast

Windows companion
  └─ /api/remote/codex/sync  -> remote Codex JSONL chunk ingest

Runtime state
  ├─ ~/.codexmux/            -> codexmux-owned app state
  ├─ tmux -L codexmux        -> live shell/Codex processes
  └─ ~/.codex/sessions/      -> Codex-owned JSONL, read-only
```

## 모듈 경계

| 영역 | 주요 파일 | 책임 |
| --- | --- | --- |
| Server entry | `server.ts` | process lifecycle, Next.js, WebSocket upgrade, auth gate, startup/shutdown |
| Terminal | `src/lib/terminal-server.ts`, `src/lib/tmux.ts` | tmux attach, stdin/stdout/resize, terminal session lifecycle |
| Timeline | `src/lib/timeline-server.ts`, `src/lib/timeline-server-state.ts` | Codex JSONL subscribe, file watch, resume, timeline init/append |
| Status | `src/lib/status-manager.ts`, `src/lib/status-server.ts` | tab status polling, hook event merge, notification dispatch |
| Workspace | `src/lib/workspace-store.ts`, `src/lib/layout-store.ts` | workspace list, layout tree, pane/tab mutation, persisted metadata |
| Provider | `src/lib/providers/*`, `src/lib/codex-session-detection.ts` | Codex command/session/jsonl adapter |
| Remote Codex | `src/lib/remote-codex-store.ts`, `src/pages/api/remote/codex/sync.ts`, `scripts/windows-codex-sync.mjs` | Windows Codex JSONL chunk 수신, 복사본 저장, session list 노출 |
| Sync | `src/lib/sync-server.ts` | workspace/layout/config change broadcast |
| Config/Auth | `src/lib/config-store.ts`, `src/lib/auth*.ts` | config persistence, password/session token, onboarding |
| Perf | `src/lib/perf-metrics.ts`, `src/pages/api/debug/perf.ts` | runtime snapshot, duration/counter aggregation |
| Platform shell | `electron/`, `android/`, `android-web/` | client shell and server URL/connectivity UX |

## Server 시작 로직

`server.ts`의 `start()`가 프로세스 전체 lifecycle을 소유한다.

1. `PORT`와 app directory를 결정한다.
2. `~/.codexmux/cmux.lock`을 획득해 단일 인스턴스를 보장한다.
3. `config.json`과 shell `PATH`를 초기화한다.
4. auth credential을 로드하고 `AUTH_PASSWORD`, `NEXTAUTH_SECRET` 환경값을 채운다.
5. tmux session을 scan하고 `src/config/tmux.conf`를 적용한다.
6. workspace store와 layout을 초기화한다.
7. 저장된 Codex session이 있으면 startup resume을 시도한다.
8. `StatusManager` polling과 상태 복구를 시작한다.
9. network access 설정으로 bind host와 request allowlist를 결정한다.
10. development이면 Next.js dev server를 직접 붙이고, production이면 standalone Next.js server를 내부 port에 띄운 뒤 외부 server가 proxy한다.
11. WebSocket upgrade route를 연결한다.
12. hook/statusline bridge, CLI token, upload/stats cleanup을 정리한다.

## HTTP와 WebSocket 라우팅

HTTP 요청은 Next.js Pages Router가 처리한다. custom server는 access filter를 먼저 적용하고, production에서는 내부 standalone server로 proxy한다.

WebSocket은 path별 전용 server로 분기한다.

| Path | Auth | Handler | 역할 |
| --- | --- | --- | --- |
| `/api/install` | 없음 | `handleInstallConnection` | onboarding/preflight 설치 흐름 |
| `/api/terminal` | session cookie | `handleConnection` | terminal byte stream |
| `/api/timeline` | session cookie | `handleTimelineConnection` | Codex timeline stream |
| `/api/status` | session cookie | `handleStatusConnection` | tab status broadcast |
| `/api/sync` | session cookie | `handleSyncConnection` | workspace/layout/config invalidation |

인증은 HTTP page/API는 Next.js middleware와 API helper가 맡고, WebSocket upgrade는 custom server가 `session-token` cookie를 검증한다. `/api/install`은 초기 설정 전에도 연결되어야 하므로 예외다.

`/api/debug/perf`는 HTTP debug endpoint지만 middleware 예외가 아니다. session cookie 또는 `x-cmux-token` CLI token 인증을 통과한 요청에만 process memory, event loop, WebSocket count, watcher count, poll duration 같은 숫자 지표를 반환한다.

`/api/remote/codex/sync`는 Windows companion 전용 HTTP endpoint다. session cookie가 아니라 `x-cmux-token` CLI token을 요구하고, base64 encoded JSONL chunk와 source metadata를 받아 서버의 remote Codex store에 append한다.

## 상태 저장 로직

codexmux가 쓰는 영속 상태는 `~/.codexmux/` 아래에 둔다.

| 데이터 | Source of truth | 변경 방송 |
| --- | --- | --- |
| config/auth/theme/network | `config.json` | sync/config |
| workspace 목록과 그룹 | `workspaces.json` | sync/workspace |
| pane/tab layout | `workspaces/{wsId}/layout.json` | sync/layout |
| message history | `workspaces/{wsId}/message-history.json` | 없음 또는 API 응답 |
| keybindings/sidebar/quick prompts | 각 JSON 파일 | 필요 시 sync/config 또는 client refresh |
| status/session history/stats | `session-history.json`, `stats/` | status/timeline |
| live terminal process | tmux | terminal/status/timeline |
| Codex transcript | `~/.codex/sessions/**/*.jsonl`, `~/.codexmux/remote/codex/**/*.jsonl` | timeline/status |

custom server와 Next.js API route는 같은 Node process 안에서도 module graph가 분리될 수 있다. 공유 singleton은 `globalThis`에 저장하고 재초기화를 guard한다.

## Workspace 서비스 로직

Workspace는 사용자가 보는 작업 단위이며 layout과 tmux session 이름의 상위 key다.

1. workspace 생성 시 기본 directory를 검증한다.
2. `ws-{id}`를 발급하고 `workspaces.json`에 저장한다.
3. `workspaces/{wsId}/layout.json`에 기본 pane/tab tree를 만든다.
4. tab은 `pt-{workspaceId}-{paneId}-{tabId}` tmux session에 대응한다.
5. pane/tab 추가, 삭제, 이동, 분할, rename은 layout file mutation 후 sync event를 broadcast한다.
6. workspace rename/group 변경은 `workspaces.json`을 갱신하고 모든 client가 sync로 재조회한다.
7. layout에는 UI state와 tab metadata만 저장하고, terminal process 자체는 tmux가 유지한다.

중요한 규칙:

- layout mutation은 lock으로 직렬화한다.
- tab을 닫으면 해당 tmux session도 종료한다.
- browser reload나 mobile reconnect는 layout을 다시 읽어 UI를 재구성한다.
- 저장된 cwd가 사라지면 존재하는 상위 directory 또는 workspace directory로 보정한다.

## Terminal 서비스 로직

Terminal WebSocket은 binary protocol로 xterm.js와 tmux attach process를 연결한다.

```text
client xterm
  -> /api/terminal?session=pt-...
  -> terminal-server
  -> node-pty
  -> tmux -u -L codexmux attach-session -t pt-...
```

| Message | 방향 | 처리 |
| --- | --- | --- |
| `MSG_STDIN` | client -> server | pty stdin write |
| `MSG_STDOUT` | server -> client | xterm output write |
| `MSG_RESIZE` | client -> server | pty/tmux resize |
| `MSG_HEARTBEAT` | 양방향 | stale connection 감지 |
| `MSG_KILL_SESSION` | client -> server | tmux session 종료 |
| `MSG_WEB_STDIN` | client -> server | Codex web input bar text 전달 |

`Ctrl+D`는 terminal/Codex 입력에 포커스가 있으면 앱 단축키가 아니라 EOF(`0x04`)로 전달한다. Linux/Windows의 오른쪽 pane 분할 기본 단축키는 이 충돌을 피하기 위해 `Ctrl+Alt+D`다.

## Codex 세션 감지 로직

Codex provider는 현재 유일한 agent provider다. UI와 저장 field는 호환성을 위해 `agent*` 이름을 유지한다.

감지 순서:

1. pane shell PID를 가져온다.
2. pane 아래 child process tree에서 `codex` process를 찾는다.
3. process cwd, command args, process start time을 읽는다.
4. command args나 저장 metadata에서 session id를 추출한다.
5. `~/.codex/sessions/**/*.jsonl`을 session id로 찾는다.
6. session id가 없으면 같은 cwd에서 process start time과 가까운 JSONL을 찾는다.
7. live Codex process가 확인된 경우에 한해 cwd 최신 JSONL fallback을 마지막으로 허용한다.

Codex CLI가 process 시작 후 JSONL을 늦게 생성할 수 있으므로 process start time 매칭은 120초 허용치를 둔다. 일반 JSONL 검색은 cwd만으로 최신 파일을 고르지 않는다. 같은 workspace에서 여러 Codex tab이 동시에 실행될 수 있기 때문이다. 단, timeline attach에서 active process가 없거나 active JSONL이 interrupted 상태이고 저장된 JSONL보다 같은 cwd의 최신 JSONL이 더 새 파일이면 최신 파일로 전환한다. 이 fallback은 API/외부 Codex 세션처럼 tmux pane의 child process로 잡히지 않는 세션을 모바일 CODEX 탭에 동기화하기 위한 경로다.

## Timeline 서비스 로직

Timeline은 terminal scrollback을 그대로 보여주는 기능이 아니라 Codex JSONL을 구조화해 보여주는 기능이다.

1. client가 `/api/timeline?session=...&panelType=codex`에 연결한다.
2. server가 pane PID로 active Codex session을 감지한다.
3. JSONL path가 확인되면 file watcher를 공유 singleton에 등록한다.
4. 초기 응답은 tail snapshot을 `timeline:init`으로 보낸다. 같은 file size/mtime/maxEntries면 watcher의 tail snapshot cache를 재사용한다.
5. 파일 append가 생기면 추가 byte range만 읽어 `timeline:append`로 보낸다.
6. session id가 바뀌면 `timeline:session-changed`를 보낸다.
7. 오래된 항목은 HTTP `/api/timeline/entries`로 페이지 단위 load-more 한다.

같은 tmux session에서 `agentSessionId`만 바뀐 경우에도 client는 timeline WebSocket을 새로 연다. Android WebView처럼 기존 connection이 살아 보이지만 stale JSONL을 보고 있는 상태를 피하기 위함이다.

중복 방지 정책:

- entry id는 JSONL offset과 record identity를 기반으로 만든다.
- 같은 assistant text가 `event_msg.agent_message`와 `response_item.message` pair로 들어오면 near-duplicate로 합친다.
- foreground reconnect 중 init/append 범위가 겹쳐도 client merge에서 중복을 제거한다.
- client render는 append burst를 frame 단위로 합치고, 기존 timeline row는 entry object reference가 유지되면 memo로 재렌더를 건너뛴다.

## Windows Codex 동기화 로직

Windows 11에서 `pwsh`로 실행한 Codex CLI는 Linux tmux tree 아래에 없으므로 codexmux가 process를 직접 attach하지 않는다. 1차 지원 범위는 Windows companion script가 Codex CLI JSONL을 읽어 서버에 chunk로 보내고, codexmux가 이를 읽기 전용 timeline session으로 노출하는 방식이다.

```text
Windows Codex CLI
  -> %USERPROFILE%\.codex\sessions\**\*.jsonl
  -> scripts/windows-codex-sync.mjs
  -> POST /api/remote/codex/sync (x-cmux-token)
  -> ~/.codexmux/remote/codex/{sourceId}/{sessionId}.jsonl
  -> session list -> timeline subscribe by jsonlPath
```

운영 규칙:

- companion은 원본 Windows JSONL을 수정하지 않고 byte offset 기반으로 append chunk만 전송한다.
- 서버는 source id와 session id를 파일명으로 sanitize하고, offset mismatch가 나면 기대 offset을 반환한다.
- remote session은 Linux workspace cwd 필터를 적용하지 않는다. Windows cwd는 session list의 source metadata로만 표시한다.
- remote session 선택은 Codex resume이 아니라 저장된 JSONL path에 대한 timeline subscribe다. Windows `pwsh` 입력/제어는 이 범위에 포함하지 않는다.

## Status 서비스 로직

StatusManager는 tab마다 다음 신호를 합쳐 `cliState`를 정한다.

| 신호 | 출처 | 역할 |
| --- | --- | --- |
| terminal connection | terminal WebSocket | client 연결 여부 |
| agent process | process tree poll | Codex 실행 여부 |
| JSONL event | timeline/parser | task start/complete, current action |
| hook/statusline event | `/api/status/*` | Codex hook 보조 신호 |
| layout metadata | `layout.json` | tab/workspace/session id 보존 |

상태 전이는 `status-state-machine`의 순수 reducer가 담당한다.

```text
inactive
  -> idle
  -> busy
  -> needs-input
  -> ready-for-review
  -> idle
```

운영 규칙:

- `task_complete`가 확인되어야 작업 완료로 본다.
- `ready-for-review`는 사용자가 focus/dismiss하기 전까지 유지한다.
- 서버 재시작 전 `busy`였던 tab은 `unknown`으로 복구를 시작한다.
- notification dedupe key는 session id와 turn id를 우선 사용한다.
- foreground toast, native notification, Web Push는 같은 notification policy를 따른다.
- poll duration, tab/pane count, broadcast count는 perf snapshot에 남겨 polling 비용을 확인한다.

## Sync 서비스 로직

Sync WebSocket은 데이터 자체를 계속 스트리밍하지 않고 invalidation event를 broadcast한다.

```text
store mutation
  -> broadcastSync({ type })
  -> connected clients
  -> client refetch workspace/layout/config
```

사용처:

- workspace create/rename/delete/reorder/group 변경
- layout pane/tab mutation
- config 변경
- foreground 복귀 후 workspace/layout 재동기화

이 방식은 여러 browser/mobile client가 동시에 열려 있어도 파일 저장을 server source of truth로 유지한다.

## 성능 Cache와 Lazy Guard

성능 최적화는 source of truth를 바꾸지 않는 짧은 cache와 hidden-state guard부터 적용한다.

- `/api/debug/perf`는 process와 service별 숫자 지표만 반환한다.
- stats page의 여러 endpoint가 동시에 cache build를 요청하면 `getStatsCache()`의 in-flight promise를 공유한다.
- stats cache가 이미 있으면 `/api/stats/cache-status`는 JSONL 파일 수 scan을 생략한다.
- diff full response는 `cwd + diff hash` 기준의 짧은 server memory cache를 사용한다.
- diff panel은 browser hidden 상태의 hash polling을 건너뛰고 visible 복귀 때 다시 확인한다.

## 모바일 foreground reconnect 로직

Android WebView와 모바일 브라우저는 background에서 WebSocket 객체가 `OPEN`이어도 실제 TCP 연결이 끊길 수 있다. client hook들은 다음 신호를 감지한다.

- `visibilitychange`
- `pagehide`
- `pageshow`
- `focus`
- `online`
- Android native `codexmux:native-app-state`

일정 시간 이상 hidden 상태였거나 bfcache restore/native foreground 복귀가 감지되면 terminal/status/timeline/sync WebSocket을 readyState와 관계없이 새로 연결한다. sync hook은 foreground 복귀 시 workspace/layout도 다시 가져온다.

모바일 CODEX `check` 화면은 timeline attach 전에도 terminal preview를 보여준다. 이 preview는 tmux의 실제 Codex 출력을 그대로 보여주므로 JSONL attach 지연이나 permission prompt 대기 상태를 확인할 수 있다.

Android WebView에는 `CodexmuxAndroid` JavaScript interface가 주입된다. 런처와 서버 접속 후 모바일 내비게이션은 이 bridge를 통해 앱 versionName/versionCode, package, device, Android version을 읽고, 사용자가 요청하면 현재 Activity를 새 task로 다시 열어 WebView를 재시작한다. 서버 버전은 React bundle의 `package.json` version과 `NEXT_PUBLIC_COMMIT_HASH`를 표시한다.

## Notification 서비스 로직

알림은 status state와 notification policy의 결과로만 발생한다.

| 상황 | 상태 | 알림 |
| --- | --- | --- |
| Codex가 permission/input을 기다림 | `needs-input` | toast/native/Web Push 가능 |
| Codex turn 완료 | `ready-for-review` | 작업 완료 알림 가능 |
| reconnect나 polling으로 같은 완료를 다시 관측 | 기존 상태 유지 | dedupe로 차단 |
| 사용자가 tab focus/dismiss | `idle`로 정리 | 추가 알림 없음 |

`soundOnCompleteEnabled=false`이면 toast sound뿐 아니라 native/background notification도 silent로 요청한다.

## 운영 서비스 로직

Linux 상시 실행은 `systemd --user`를 기준으로 한다.

```text
systemd --user codexmux.service
  -> node bin/codexmux.js
  -> dist/server.js
  -> .next/standalone/server.js
```

운영 원칙:

- root/system-wide service로 실행하지 않는다.
- `~/.codexmux/`, `~/.codex/`, tmux socket, NVM Node path가 모두 동일 user 기준이어야 한다.
- source 변경 후 production 반영은 `corepack pnpm build` 후 service restart가 필요하다.
- native Android 파일을 바꾸지 않은 React/server 변경은 APK 재배포 없이 server build/restart로 반영된다.
- `android/` native bridge나 `android-web/` launcher asset을 바꾸면 `corepack pnpm android:install` 또는 release APK/AAB 재배포가 필요하다.

## 장애 대응 기준

| 증상 | 우선 확인 | 기준 문서 |
| --- | --- | --- |
| terminal 출력 없음 | tmux capture, `/api/terminal`, xterm ready state | `TMUX.md` |
| CODEX timeline이 비어 있음 | `detectActiveCodexSession`, JSONL path, session id | `STATUS.md` |
| 모바일 복귀 후 끊김 | foreground reconnect, sync refetch, server health | `ANDROID.md` |
| workspace가 엇갈림 | `workspaces.json`, `layout.json`, sync broadcast | `DATA-DIR.md` |
| 서비스가 안 뜸 | user service, port, lock, journal | `SYSTEMD.md` |
| 중복 메시지/알림 | timeline entry id, dedupe, completion key | `STATUS.md` |

## 변경 시 문서 갱신 기준

- server startup, WebSocket routing, shared singleton을 바꾸면 이 문서와 `ADR.md`를 갱신한다.
- tmux/session/process 감지나 terminal protocol을 바꾸면 `TMUX.md`를 갱신한다.
- `TCliState`, `ITabState`, `StatusManager`, provider metadata를 바꾸면 `STATUS.md`를 갱신한다.
- Android/Electron shell 또는 mobile reconnect 정책을 바꾸면 `ANDROID.md`/`ELECTRON.md`를 갱신한다.
- 저장 파일 구조를 바꾸면 `DATA-DIR.md`를 갱신한다.
