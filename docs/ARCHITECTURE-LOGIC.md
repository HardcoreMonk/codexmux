# 아키텍처와 서비스 로직

codexmux는 Next.js Pages Router와 custom Node server를 함께 사용하는 Codex 세션 매니저입니다. 현재 구조는 legacy tmux 기반 경로와 runtime v2 worker 경로가 공존하며, 제품 목표는 Windows-only runtime/host로 전환하는 것입니다.

## 핵심 구조

```text
Browser / Electron
  | HTTP + WebSocket
  v
custom Node server
  | exact upload route ownership
  | Next.js Pages Router
  | auth proxy
  | WebSocket routing
  v
runtime v2 Supervisor
  | terminal worker
  | storage worker
  | timeline worker
  | status worker
  v
terminal runtime adapter
  | legacy tmux adapter
  | Windows node-pty/ConPTY adapter
```

custom server와 Next.js API route는 같은 process 안에서도 서로 다른 module graph를 사용할 수 있습니다. 공유 상태는 `globalThis` singleton에 두고 재초기화를 막습니다.

## 런타임 v2

Runtime v2는 Supervisor와 worker process로 terminal, storage, timeline, status 책임을 분리합니다.

| 영역 | 책임 | Rollback |
| --- | --- | --- |
| Terminal Worker | terminal create/attach/write/resize/detach/kill | terminal mode `off` 또는 legacy adapter |
| Storage Worker | workspace/layout/tab/message-history SQLite projection | storage mode `off` |
| Timeline Worker | Codex JSONL read, live watch, session list | timeline mode `off` |
| Status Worker | Codex process/status policy, notification side effect | status mode `off` |

`CODEXMUX_RUNTIME_V2=1`에서 surface mode가 unset이면 Phase 6 기준 fallback을 적용합니다. 잘못된 명시 값은 fail closed로 legacy/off에 가깝게 처리합니다.

## 서버 시작 흐름

1. config와 shell path 초기화를 함께 완료합니다.
2. strict stored auth state에서 `configured`, `init-password`, `setup-open`을 결정합니다.
3. runtime auth env와 bootstrap claim latch를 덮어쓰고 startup access filter를 초기화합니다.
4. setup 시작이면 `HOST`/저장 network access보다 우선해 loopback bind plan을 사용합니다.
5. runtime v2 mode를 해석하고 Supervisor singleton을 준비합니다.
6. process-scoped UploadServer를 만들고 Next.js request handler보다 앞에 연결합니다.
7. typed WebSocket route와 health/smoke endpoint를 연결합니다.

서버 시작 중 runtime v2 worker가 준비되지 않으면 해당 surface는 명확한 diagnostic을 반환해야 합니다. 브라우저는 stale tab을 조용히 busy/idle로 표시하지 않아야 합니다.

## HTTP와 WebSocket 라우팅

| 경로 | 용도 |
| --- | --- |
| `/api/health` | public health probe. app/version/commit/buildTime 반환 |
| `/api/terminal` | legacy terminal WebSocket |
| `/api/v2/terminal` | runtime v2 terminal WebSocket |
| `/api/timeline` | timeline WebSocket. mode에 따라 legacy 또는 worker backend |
| `/api/status` | status WebSocket. mode에 따라 legacy 또는 worker backend |
| `/api/sync` | workspace/layout invalidation |
| `/api/install` | install 전용 WebSocket. setup-local 또는 authenticated admission 뒤 legacy PTY 실행 |
| `/api/upload-image` | outer-owned raw image upload. exact 10MiB limit |
| `/api/upload-file` | outer-owned raw generic upload. exact 50MiB limit |
| `/api/uploads/cleanup` | 인증된 committed/stale upload cleanup 제어 |
| `/api/debug/perf` | 인증된 성능 snapshot |

WebSocket payload에는 terminal output, prompt, token, full path 같은 민감한 본문을 불필요하게 저장하지 않습니다.

Setup claim이 열려 있는 동안 custom server는 HTTP와 WebSocket 모두 source filter 뒤에
single loopback Host를 요구합니다. Setup POST와 install handshake는 raw Host/Origin이 각각
한 개인지 확인하고 canonical hostname+effective port가 같은 same-authority request만
허용합니다. Forwarded header를 신뢰하지 않으므로 이는 TLS scheme까지 증명하는 full
same-origin 또는 trusted proxy 계약이 아닙니다.

`/api/install`은 Next HTTP proxy에서 보호되며 WebSocket upgrade만 custom server가 먼저
소비합니다. Upgrade admission과 connection 직전 fresh admission은 같은 authorizer를
사용합니다. Setup-local PTY는 config/latch를 spawn 전후, delayed command, stdin/resize,
500ms watcher에서 재검증하며 setup 완료는 `1000`, 상태 판독 실패는 `1011`로 종료합니다.
실행 slot은 `idle -> starting -> active` owner token으로 직렬화하고 입력 frame 64KiB,
queue 256 frame/1MiB, 출력 buffered amount 1MiB를 제한합니다.

## Upload ingress

`/api/upload-image`와 `/api/upload-file`의 external request는 development Next handler와
production standalone proxy보다 먼저 outer server가 소비합니다. Removed Pages API route와
internal standalone port는 upload fallback surface가 아닙니다.

Pre-body gate 순서는 raw target/source guard, strict single Host, CLI 우선 session 인증,
credential별 Origin, method, supported Expect, canonical framing/policy, session refresh,
admission입니다. Session은 same-authority Origin이 필수이고 CLI token은 Origin을 생략할 수
있지만 제공하면 same-authority여야 합니다. Transfer-Encoding, Content-Length 중복/비정규
표현, non-identity Content-Encoding은 body를 읽기 전에 거절합니다. 모든 upload response는
`Connection: close`이며 인증과 admission 전에는 `100 Continue`를 보내지 않습니다.

Admission은 process-scoped UploadServer 한 개가 소유합니다.

- 최대 active upload: 8
- 최대 declared reserved bytes: 200MiB
- queue 없음: 초과 request는 즉시 `429`
- progress idle timeout: 60초
- absolute transaction timeout: 270초
- image/file policy: 10MiB/50MiB

Storage는 `~/.codexmux/uploads/<workspace>/<tab>/` 아래에
`.<32 lowercase hex>.upload.part`를 `wx`, `0o600`으로 생성합니다. Application-observed
byte가 Content-Length와 같고 request가 complete인 경우에만 writer를 닫습니다. Final
filename도 128-bit random token을 포함하며, `fs.link(stage, final)` 성공을 no-replace
commit point로 사용한 뒤 staged link를 제거합니다. Destination collision은 새 이름으로
재시도하므로 기존 artifact를 overwrite하지 않습니다. Commit 뒤 response가 끊겨도 final
artifact는 보존하고 TTL cleanup이 소유합니다.

Active/recent stage는 committed cleanup에서 제외합니다. Reserved staged namespace만 최소
30분 age 뒤 startup/30분 maintenance/manual stale cleanup 대상이 됩니다. 정상 committed
`.part` 파일은 stage로 오인하지 않습니다. `CODEXMUX_UPLOADS_DISABLED=1`은 두 exact route만
`503`으로 닫고 Next fallback, health, 인증된 non-upload API는 유지합니다.

Production embedded Next server에는 `NEXT_MANUAL_SIG_HANDLE=true`를 require 전에 설정합니다.
SIGINT/SIGTERM drain은 outer lifecycle이 listener, WebSocket, upload transaction과 staged
cleanup을 먼저 닫은 뒤 완료되며, 반복 signal도 같은 idempotent shutdown promise를 사용합니다.

## 상태 저장 로직

Legacy store는 JSON 파일을 사용합니다. Runtime v2 store는 SQLite를 사용합니다.

| Store | 위치 | 용도 |
| --- | --- | --- |
| Legacy JSON | `~/.codexmux/workspaces.json`, `workspaces/*/layout.json` | rollback, migration fallback |
| Runtime v2 SQLite | `~/.codexmux/runtime-v2/state.db` | workspace/layout/tab/message-history projection |
| Codex JSONL | `~/.codex/sessions/**/*.jsonl` | Codex 원본 timeline/status source. read-only |

Runtime v2 default read가 켜져도 rollback용 JSON write는 유지합니다.

## 워크스페이스 로직

Workspace는 id, name, directory, layout, active pane/tab을 묶는 app-level aggregate입니다.

- workspace 생성은 directory와 기본 terminal tab을 함께 준비합니다.
- runtime v2 tab은 `runtimeVersion: 2` metadata를 가집니다.
- runtime DB snapshot이 authoritative한 상태에서는 빈 snapshot도 정상 상태로 취급합니다.
- workspace 삭제는 관련 tab/session cleanup intent를 함께 남겨야 합니다.

## 터미널 로직

Terminal API가 기대하는 동작은 adapter와 무관하게 같습니다.

- create: shell 또는 Codex tab을 생성합니다.
- attach: stdout stream을 구독합니다.
- write: stdin을 전달합니다.
- resize: terminal size를 적용합니다.
- detach: 구독만 해제하고 session은 유지합니다.
- kill/delete: runtime session을 종료하고 app state를 정리합니다.

Terminal byte stream은 durable state가 아닙니다. Reconnect는 저장된 stdout replay가 아니라 adapter 재attach로 복구합니다.

Codex web input은 raw terminal key 입력과 분리해서 처리합니다. Client는 `MSG_WEB_STDIN` frame으로 app-originated input을 보내고, legacy terminal path는 tmux copy mode를 먼저 빠져나온 뒤 pty에 씁니다. Prompt 본문은 bracketed paste로 감싸고 Enter를 같은 frame에 포함하며, Codex CLI 확인 흐름을 위해 후속 Enter를 한 번 더 보냅니다.

## Codex 세션 감지

Codex session mapping은 다음 source를 조합합니다.

1. 실행 중인 process tree
2. terminal runtime metadata
3. Codex JSONL `session_meta`, `turn_context`
4. cwd와 process start time fallback
5. tab-scoped prompt claim

Process start time으로 현재 JSONL을 특정할 수 없는 long-lived Codex process는 tab의 prompt claim으로만 최신 same-cwd JSONL을 채택합니다. Prompt text, claim timestamp, JSONL user message timestamp, cwd가 맞고 같은 window 안의 중복 후보가 없을 때만 `agentSessionId`/`agentJsonlPath`를 갱신합니다. Claim 저장은 timeline refresh signal을 발행하고, 열린 legacy/runtime timeline socket은 짧은 재시도 창 안에서 같은 소유권 검증을 다시 실행합니다. 이 신호가 없으면 같은 cwd의 다른 tab session과 섞일 수 있으므로 최신 JSONL로 자동 전환하지 않습니다.

Windows에서는 `/proc`, `pgrep`, `ps`, `lsof` 같은 POSIX primitive를 직접 호출하지 않고 process inspector adapter를 사용합니다.

## 타임라인 로직

Timeline은 Codex JSONL record와 live pane prompt를 병합해 UI entry로 투영합니다.

- entry id는 JSONL byte offset과 record identity를 기준으로 안정화합니다.
- 같은 assistant text가 여러 record type으로 남는 경우 near-duplicate rule로 중복 표시를 줄입니다.
- permission/input prompt는 JSONL marker가 늦거나 없을 수 있으므로 live pane capture로 보정합니다.
- older entry와 message count는 worker read command로 분리합니다.
- session list는 `SessionIndexService` snapshot을 page 단위로 읽습니다. Cold refresh가 진행 중이면
  request path가 전체 JSONL scan을 기다리지 않고 현재 snapshot과 `refreshing` 상태를 반환합니다.

## 상태 로직

상태 로직은 프로세스 상태, 작업 상태, 알림 상태를 분리해서 판단합니다.

| 범주 | 예 |
| --- | --- |
| 프로세스 상태 | Codex running, shell idle, process missing |
| 작업 상태 | busy, idle, needs-input, review-needed, interrupted |
| notification | completion toast, Web Push, native notification |

상태 전이는 pure helper에서 계산하고, `StatusManager`와 worker는 polling, watch, broadcast 같은 부수효과를 담당합니다. Provider adapter는 `statusBehavior`로 JSONL watch 유지와 stop hook 지연 여부를 명시하며, legacy manager와 runtime v2 worker IPC는 같은 shape를 소비합니다.

Codex hook event는 command line의 inline `hooks.SessionStart`, `hooks.UserPromptSubmit`, `hooks.Stop` TOML override가 `~/.codexmux/status-hook.sh`를 호출해 들어옵니다. `~/.codexmux/hooks.json`은 생성 파일로 남지만 launch/resume command의 config source는 아닙니다.

## 성능과 진단

`/api/debug/perf`는 인증된 session에서만 process memory, event loop delay, WebSocket 수, watcher, polling, cache, worker counter를 반환합니다. 본문 데이터는 반환하지 않습니다.

성능 개선은 source of truth를 바꾸는 큰 rewrite보다 다음처럼 좁게 진행합니다.

- timeline append batching
- row memoization
- JSONL tail snapshot cache
- session index cache
- cold session index refresh 비차단 응답
- diff short cache
- stats in-flight dedupe

## 운영 로직

Linux `systemd --user`, Android shell, macOS packaging은 현재 기록으로 남아 있지만 Windows-only 제품 전환의 primary path가 아닙니다. Windows 운영 기준은 다음 순서로 승격합니다.

1. Windows terminal runtime smoke
2. Windows process/session detection smoke
3. Windows host diagnostics smoke
4. Windows packaged launch smoke
5. Windows installer install smoke
6. Windows updater local/published channel smoke
7. 내부 사용자 장시간 workspace 사용

## 장애 대응 기준

- Runtime worker가 죽으면 worker counter와 sanitized last error를 남깁니다.
- Terminal session이 사라지면 stale ready tab으로 숨기지 않고 failed/diagnostic 상태를 표시합니다.
- Storage migration 실패는 DB handle을 닫고 rollback 가능한 오류로 반환합니다.
- Status/timeline worker rollback은 같은 public URL에서 legacy implementation으로 되돌릴 수 있어야 합니다.
- Windows package smoke 실패는 release blocker입니다.
- Upload 장애는 취약한 Pages route나 dependency로 되돌리지 않습니다. 먼저
  `CODEXMUX_UPLOADS_DISABLED=1`로 ingress만 중지하고, patched dependency와 outer route
  ownership을 유지한 forward fix를 배포합니다.
- malformed/hash-only config는 원본 bytes를 보존한 채 startup을 중단합니다. 비밀번호 reset은 server를 멈춘 뒤 `authPassword`와 `authSecret`을 함께 제거하고 restart해야 하며, 실행 중 config 제거로 claim을 다시 열지 않습니다.

## 문서 갱신 기준

- runtime boundary 변경: `ADR.md`, `RUNTIME-V2-CUTOVER.md`, `RUNTIME-V2-PARITY.md`
- Windows host/package 변경: `WINDOWS-ONLY-GAP-AUDIT.md`, `ELECTRON.md`, `TESTING.md`
- status 변경: `STATUS.md`
- terminal protocol 변경: `TMUX.md`
- data layout 변경: `DATA-DIR.md`
