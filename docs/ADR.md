# Architecture Decision Records

이 문서는 codexmux에서 이미 선택한 오래가는 설계 결정을 한 곳에 모은다. 세부 구현 흐름은 `ARCHITECTURE-LOGIC.md`에 두고, 영역별 구현 문서는 `STATUS.md`, `TMUX.md`, `DATA-DIR.md`, `SYSTEMD.md`, `STYLE.md`, `ELECTRON.md`, `ANDROID.md`, `WINDOWS.md`에 둔다.

## ADR 작성 기준

다음 변경은 이 문서를 함께 갱신한다.

- framework, router, server boundary 변경
- tmux/session/process 감지 방식 변경
- provider model 또는 `agent*` metadata 의미 변경
- `~/.codexmux/` 저장 구조나 auth/security 동작 변경
- Electron/Android/Windows 같은 platform client 동작 변경
- notification, locale, mobile UX, terminal input, reconnect/dedupe 같은 cross-platform 정책 변경

작은 copy, 단일 컴포넌트 스타일, 버그 수정은 기존 ADR의 결정과 충돌하지 않으면 새 ADR이 필요 없다.

## Proposed: Supervisor And Worker Runtime

- Status: Proposed
- Decision: Pages Router와 custom Node server는 유지하되, public routing과
  worker lifecycle, typed IPC command routing을 소유하는 Supervisor 역할을 도입한다.
  Supervisor singleton, in-flight start promise, 준비된 runtime DB path는
  `globalThis`에 두어 custom server와 Next.js API route가 하나의 runtime을 공유한다.
- Rationale: terminal IO, storage mutation, JSONL parsing, process polling은 명시적인
  failure boundary와 ownership boundary를 가져야 한다.
- Consequences: runtime v2 API route는 direct store/tmux helper가 아니라 worker-backed
  Supervisor service를 호출한다. API route는 singleton을 가져와 `ensureStarted()`를
  기다린 뒤 필요한 Supervisor method만 호출하며 worker client를 직접 만들지 않는다.
  `ensureStarted()`는 stale pending terminal tab뿐 아니라 ready terminal tab과 실제
  runtime v2 tmux session 존재 여부도 reconciliation한 뒤에만 started 상태가 된다.
  Timeline Worker는 read-only foundation으로 먼저 들어가며 session list, older entry,
  message count command를 typed IPC로 처리한다. Production timeline WebSocket의 file
  watch/live append/resume 경로는 별도 cutover 전까지 기존 server module에 남긴다.
  Status Worker는 policy foundation으로 먼저 들어가며 hook/Codex 상태 전이와 notification
  gating을 typed IPC로 처리한다. Production status polling/WebSocket/notification write는
  별도 cutover 전까지 기존 `StatusManager`에 남긴다.

## Proposed: SQLite App State

- Status: Proposed
- Decision: workspace/layout/tab/status metadata의 runtime v2 source of truth는
  Storage Worker가 소유하는 `~/.codexmux/runtime-v2/state.db`다.
  `CODEXMUX_RUNTIME_V2_RESET=1`은 `state.db`, `state.db-wal`,
  `state.db-shm`을 독립적으로 timestamp `.bak` 파일로 이동한 뒤 새 DB를 만든다.
- Rationale: normalized entities, transactions, invariant enforcement, indexed
  queries, durable event logs는 JSON 파일과 직접 module caller 조합으로 안전하게
  유지하기 어렵다.
- Consequences: 첫 구현 slice에서 legacy JSON migration은 요구하지 않는다. 기존 JSON
  store는 유지하고 runtime v2는 parallel experimental state로 동작한다.
  Phase 2 terminal `new-tabs` 전환 중에는 legacy JSON layout을 UI source of truth로
  유지하고, plain terminal v2 tab 생성 시 legacy workspace/pane id를 Storage Worker에
  mirror한 뒤 생성된 `rtv2-` tab을 JSON layout에 `runtimeVersion: 2`로 append한다.
  이 mirror는 SQLite workspace/layout default ownership 전환이 아니다.
  `better-sqlite3`는 optional dependency이며 lazy load된다. runtime v2가 꺼진
  install/build는 native binding load에 의존하지 않고, runtime v2가 켜졌을 때 binding
  부재는 `runtime-v2-sqlite-unavailable`로 실패한다.

## Proposed: Typed IPC

- Status: Proposed
- Decision: worker transport는 `child_process.fork` 기반 typed envelope IPC를 사용한다.
  첫 slice는 command registry와 event registry를 두고 command payload, successful reply
  payload, first-slice event payload를 모두 검증한다.
- Rationale: Node IPC는 별도 internal port 없이 TypeScript type/schema 재사용과
  process boundary 검증을 시작하기에 가장 단순한 경로다.
- Consequences: envelope validation만으로는 충분하지 않다. command-specific payload와
  successful reply payload validation, registered event constructor validation, correlation
  id, timeout, structured error, retryability 보존이 worker/Supervisor contract의 일부다.
  `timeline.*` read commands와 `status.*` policy commands도 같은 registry와 reply schema를
  통과해야 한다.

## Proposed: Terminal Streams Are Ephemeral

- Status: Proposed
- Decision: terminal stdin/stdout/resize stream은 realtime ephemeral data다. Terminal
  lifecycle과 status fact는 durable state가 될 수 있지만 terminal byte stream은 SQLite에
  저장하지 않는다.
- Rationale: tmux가 이미 terminal runtime source다. terminal byte를 별도 저장하면 큰
  저장 비용과 replay 복잡도가 생기지만 첫 번째 안정성 문제를 해결하지 못한다.
- Consequences: runtime v2 terminal stdout은 reconnect replay 대상이 아니다. client는
  Terminal Worker를 통해 tmux에 다시 attach해서 복구한다. runtime v2 ready terminal
  tab이 startup 시점에 tmux session을 잃은 경우 Storage Worker가 durable `failed`
  lifecycle로 전환하고 layout/attach surface에서 제외한다.

## ADR-001: Next.js Pages Router와 Custom Server 유지

- Status: Accepted
- Decision: Next.js Pages Router를 사용하고 `server.ts` custom Node server가 Next.js, WebSocket, tmux lifecycle을 함께 관리한다.
- Rationale: terminal WebSocket, tmux session lifecycle, CLI bridge, status manager가 한 프로세스 안에서 낮은 지연으로 협력해야 한다.
- Consequences: App Router와 `"use client"`를 도입하지 않는다. 인증 middleware 경로는 현재 Next.js 버전에 맞춰 `src/proxy.ts`를 사용한다.

## ADR-002: tmux를 영속 터미널 백엔드로 사용

- Status: Accepted
- Decision: terminal session은 `tmux -L codexmux`의 `pt-{workspaceId}-{paneId}-{tabId}` 세션으로 유지한다.
- Rationale: 브라우저, PWA, Android, Electron이 끊겨도 shell/Codex 작업은 유지되어야 한다.
- Consequences: terminal title, pane PID, cwd, process tree, Codex JSONL은 기존 helper를 통해 읽는다. 새 코드에서 `pgrep`, `ps`, `lsof`를 직접 흩뿌리지 않는다.

## ADR-003: Codex Provider 중심 모델

- Status: Accepted
- Decision: 현재 등록 provider는 Codex 하나이며 client/store field는 호환성을 위해 `agent*` 이름을 유지한다.
- Rationale: Codex 전환 이후에도 UI와 저장 데이터의 migration 범위를 줄이고 provider-neutral 경계를 유지한다.
- Consequences: `TCliState`, `ITabState`, `StatusManager`, provider detection, `agentSessionId`, `agentSummary` 변경 시 `docs/STATUS.md`도 함께 갱신한다. Codex JSONL 연결은 session id, 같은 cwd의 process start time, live process 확인 후 cwd fallback 순서로 제한하고, 일반 검색에서는 cwd만으로 최신 JSONL을 선택하지 않는다.

## ADR-004: Shared State는 `globalThis` Singleton에 둔다

- Status: Accepted
- Decision: custom server와 Next.js API route가 공유해야 하는 singleton state는 `globalThis`에 저장하고 재초기화를 guard한다.
- Rationale: 같은 Node process 안에서도 server bundle과 API route module graph가 분리될 수 있다.
- Consequences: 새 key는 일반적으로 `__pt` plus PascalCase를 사용한다. 기존 `__codexmux*`, `__cmux*` key는 주변 코드와 맞춰 유지한다.

## ADR-005: App State는 `~/.codexmux/`, Codex State는 Read-only

- Status: Accepted
- Decision: codexmux 영속 상태는 `~/.codexmux/`에 저장하고, Codex CLI session JSONL은 `~/.codex/sessions/`에서 읽기 전용으로 참조한다.
- Rationale: codexmux 설정과 Codex CLI 소유 데이터를 분리해야 안전한 초기화와 migration이 가능하다.
- Consequences: `config.json` 삭제는 locale/theme/network/Codex option까지 초기화한다. 비밀번호만 초기화하려면 `authPassword`, `authSecret`만 제거한다.

## ADR-006: 한국어 기본, 영어 병행 지원

- Status: Accepted
- Decision: 지원 locale은 `ko`, `en`만 유지하고 기본 locale은 `ko`다.
- Rationale: 제품의 현재 운영 언어를 한국어 중심으로 고정하면서 영어 문서는 병행 제공한다.
- Consequences: SSR page는 저장된 locale로 message bundle과 `html lang`을 맞춘다. 새 copy는 Korean/English message file을 함께 갱신한다.

## ADR-007: Electron과 Android는 Client Shell이다

- Status: Accepted
- Decision: Electron과 Android 앱은 Codex/tmux를 직접 재구현하지 않고 실행 중인 codexmux 서버에 연결하는 shell로 유지한다.
- Rationale: Codex와 tmux execution은 서버 환경에 두고, desktop/mobile 앱은 연결성과 UX를 담당하는 편이 안정적이다.
- Consequences: Electron remote/local server mode는 `~/.codexmux/config.json`을 공유한다. Android 런처는 서버 URL 저장, 최근 서버, 자동 연결, 연결 실패 복구, 앱 정보/재시작을 담당한다. Android WebView 안에서는 `CodexmuxAndroid` native bridge로 versionName/versionCode, package, device, Android version을 읽고 WebView/Activity를 재시작한다. Android WebView smoke는 ADB와 WebView DevTools로 foreground reconnect, failure recovery, fresh app data clear first-run을 반복 검증한다.

## ADR-008: Notification Sound는 공통 설정으로 제어

- Status: Accepted
- Decision: 작업 완료 사운드는 `soundOnCompleteEnabled` 하나로 toast, native notification, background Web Push를 함께 제어한다.
- Rationale: 사용자는 foreground/background나 shell 종류와 관계없이 동일한 알림 정책을 기대한다.
- Consequences: `soundOnCompleteEnabled=false`이면 completion sound를 재생하지 않고 system notification도 silent로 요청한다. permission/input 요청 상태는 `needs-input` flow를 유지한다.

## ADR-009: 모바일 UX는 터미널 안정성을 우선한다

- Status: Accepted
- Decision: 모바일 UI 개선은 Android 런처, navigation sheet, header, bottom tab bar, 상태 surface를 중심으로 적용하고 terminal input/reconnect 구조는 보수적으로 유지한다. WebView foreground 복귀 시 terminal/status/timeline/sync WebSocket은 stale `OPEN` 상태를 신뢰하지 않고 필요하면 강제 재연결한다.
- Rationale: 모바일에서 입력 draft 보존과 재접속 안정성이 시각 변화보다 중요하다.
- Consequences: touch target, `active`, `focus-visible`, safe-area, Korean-first typography를 적용하되 xterm, input, textarea, code/path 영역은 줄바꿈 예외로 둔다. Android native shell은 원격 page에 Capacitor bridge가 없어도 `triggerEvent` fallback을 설치하고 page load 후 다시 보강한다. Foreground forced reconnect 중 expected stale WebSocket connection error는 짧은 grace window에서 console noise로 남기지 않고, 실제 복구 판단은 새 socket attach와 workspace/layout/status/timeline 재조회로 한다. `/login` 같은 인증 전 public route는 status/native notification/Web Push/service worker runtime service를 마운트하지 않아 fresh install과 app data clear 이후 auth WebSocket/service worker registration console noise를 만들지 않는다. `/sw.js`는 PWA/Web Push 설치용 static service worker script라 auth redirect 없이 public asset으로 제공한다. iOS startup image는 `scripts/generate-splash.js`에서 `codexmux` branding으로 생성한 `public/splash/*.png`만 사용한다. 모바일 CODEX `check` 화면은 timeline이 아직 붙지 않아도 하단 terminal preview를 보여 실제 tmux 출력을 확인할 수 있게 한다. 모바일 내비게이션의 앱 정보 화면은 Android 앱 버전/기기 정보와 서버 버전을 표시하고 앱 재시작 진입점을 제공한다.

## ADR-010: 상태와 타임라인 정책은 순수 모듈로 분리한다

- Status: Accepted
- Decision: 완료 판정, 알림 판정, session id mapping, 타임라인 entry merge/dedupe, stable id 생성은 `StatusManager`나 React hook 내부가 아니라 순수 helper 모듈에서 처리한다.
- Rationale: 모바일 재연결, JSONL watcher, polling, stop-hook 재확인이 같은 Codex turn을 여러 경로로 관측하고, Codex CLI가 같은 assistant text를 paired `event_msg`/`response_item` record로 남길 수 있다. 부수효과가 있는 서버 클래스 안에서 정책을 직접 유지하면 중복 알림과 중복 timeline 출력이 쉽게 생긴다.
- Consequences: `status-state-machine`, `status-session-mapping`, `status-notification-policy`, `status-metadata`, `timeline-entry-id`, `timeline-entry-dedupe`, `timeline-entry-merge`는 단위 테스트를 동반한다. timeline dedupe는 stable id뿐 아니라 normalized role/text 기반 near-duplicate도 다룬다. `StatusManager`, `timeline-server`, `use-timeline`은 신호 수집, 상태 적용, WebSocket 송신 같은 부수효과를 담당한다.

## ADR-011: DIFF 패널은 제한된 Git snapshot으로 렌더링한다

- Status: Accepted
- Decision: DIFF 패널은 현재 tmux session cwd의 Git snapshot을 보여주되 tracked diff, untracked 파일 수, untracked 파일 크기, 전체 untracked diff 크기, client fetch 시간을 제한한다.
- Rationale: Codex 작업 디렉터리에는 screenshot, build output, generated file 같은 untracked 파일이 대량으로 생길 수 있다. 모든 파일을 diff로 만들고 한 번에 펼치면 API 응답과 browser render가 함께 hang처럼 보일 수 있다.
- Consequences: `/api/layout/diff`는 제한을 초과한 untracked 파일을 생략하고 생략 수를 응답한다. binary와 대용량 파일은 placeholder로 표시한다. 같은 `cwd + diff hash`의 full diff는 짧은 서버 메모리 cache로 재사용하고, browser hidden 상태에서는 hash polling을 건너뛴다. client는 대량 파일이나 큰 hunk를 기본 접힘으로 렌더링하고 timeout/error 상태를 사용자에게 표시한다.

## ADR-012: 터미널 제어 입력은 앱 단축키보다 우선한다

- Status: Accepted
- Decision: 포커스된 xterm, Codex web input, 모바일 surface에서 `Ctrl+D`는 앱 단축키로 처리하지 않고 EOF/EOT(`0x04`)로 pty에 전달한다.
- Rationale: codexmux는 Codex CLI를 웹에서 감싸는 제품이므로 shell/Codex CLI의 기본 제어 키가 유지되어야 한다. 특히 Codex CLI는 `Ctrl+D`로 프로세스 종료 흐름을 제공한다.
- Consequences: Linux/Windows의 오른쪽 pane 분할 기본 단축키는 `Ctrl+D` 대신 `Ctrl+Alt+D`를 사용한다. macOS는 앱 분할을 `⌘D`로 유지한다. `keybindings.json`은 앱 단축키 override만 저장하며, terminal/Codex 입력 포커스의 `Ctrl+D` EOF 처리는 override보다 우선한다. 새 terminal key handling은 desktop xterm, web input bar, mobile surface를 함께 검증한다.

## ADR-013: 성능 계측은 인증된 Snapshot API로 노출한다

- Status: Accepted
- Decision: 성능 최적화는 먼저 `globalThis.__ptPerfStore` 기반 런타임 계측과 인증된 `/api/debug/perf` snapshot으로 관측한 뒤 좁게 진행한다.
- Rationale: 현재 병목 후보는 Node server, WebSocket, tmux, JSONL parsing, React render 경로에 분산되어 있다. rewrite나 큰 구조 변경 전에 process memory, event loop, watcher, poll, WebSocket, parse 비용을 같은 기준으로 확인해야 한다.
- Consequences: perf snapshot은 숫자와 duration/counter만 반환한다. session id, cwd, JSONL path, prompt, assistant text, terminal output 본문은 노출하지 않는다. endpoint는 middleware auth를 통과해야 하며 public health check로 쓰지 않는다. Runtime v2 Worker diagnostics는 worker name별 lifecycle/command counter와 sanitized last error만 `services.runtimeWorkers`에 노출한다. 성능 개선은 timeline append batching/row memo, JSONL tail snapshot cache, DIFF short cache, stats in-flight dedupe처럼 source of truth를 바꾸지 않는 좁은 변경을 우선한다.

## ADR-014: Windows Codex 연동은 JSONL 동기화 Client로 시작한다

- Status: Accepted
- Decision: Windows 11 `pwsh`에서 실행하는 Codex CLI 연동은 companion script가 `%USERPROFILE%\.codex\sessions` JSONL을 읽어 `/api/remote/codex/sync`로 보내는 timeline sync와, 별도 terminal bridge가 서버의 `/api/remote/terminal/*` HTTP queue 및 `/api/remote/terminal` browser WebSocket을 통해 Windows `pwsh`를 제어하는 방식으로 제공한다.
- Rationale: Windows shell process는 Linux 서버의 tmux/node-pty process tree 아래에 없어서 기존 terminal attach, process detection, resume path를 그대로 공유할 수 없다. JSONL 동기화는 Codex transcript source of truth를 보존하면서 모바일/웹 timeline 확인 문제를 먼저 해결한다.
- Consequences: remote Codex 복사본은 `~/.codexmux/remote/codex/`에 저장하고 원본 Windows Codex 상태는 수정하지 않는다. Windows companion은 시작 시 `/api/health`로 서버 version/commit을 확인하고 전체 session history를 스캔하되 이후 polling은 hot scan으로 좁히며, 주기적 full scan과 local offset state로 누락과 반복 전송을 함께 피한다. `--dry-run`은 전송 없이 pending upload와 scan summary를 확인하는 운영 진단 경로다. Windows 자동 실행은 현재 사용자 Scheduled Task wrapper로 제공하고, task 설정/token/state/log는 기본적으로 `%USERPROFILE%\.codexmux\` 아래에 둔다. session list는 sidecar metadata로 구성하고 source/sourceId filter와 remote source summary를 제공하며, JSONL 본문은 timeline subscribe 때 읽는다. remote session 선택은 저장된 JSONL path timeline subscribe를 유지한다. Windows terminal bridge는 Windows에서 outbound polling으로 stdin/resize/kill command를 가져가고 stdout을 서버에 post한다. 서버는 이 bridge state를 `globalThis.__ptRemoteTerminalStore`에 두고 browser client에는 기존 terminal protocol frame으로 relay한다. 이 경로는 별도 Windows `pwsh` session 제어이며, 기존 Windows Terminal 창이나 이미 실행 중인 외부 Codex process에 attach하지 않는다.

## ADR-015: Session list는 백그라운드 인덱스를 사용한다

- Status: Accepted
- Decision: `/api/timeline/sessions`는 요청마다 Codex JSONL을 재귀 스캔하지 않고 `SessionIndexService`의 `globalThis.__ptSessionIndex` snapshot을 읽는다. 인덱스는 `~/.codexmux/session-index.json`에 persist하고 백그라운드 refresh로 갱신한다.
- Rationale: Linux local 세션과 Windows remote 세션이 늘어나면 session list 요청 경로에서 전체 JSONL 파싱, 정렬, slice가 반복되어 메모리와 CPU가 급증한다. session 목록은 실시간 terminal byte stream보다 지연 허용치가 크므로 request path에서 source scan을 제거하는 편이 안정적이다.
- Consequences: Linux Codex JSONL은 mtime/size가 바뀐 파일만 다시 파싱하고, Windows remote session은 sidecar metadata를 사용한다. session list API는 index snapshot을 페이지네이션만 해서 반환한다. Codex provider의 JSONL lookup은 index를 먼저 사용하고 miss 때만 filesystem scan으로 fallback한다. Windows sync 수신은 index refresh를 debounce로 요청한다. `/api/debug/perf`는 session index의 파일 수, cache hit/miss, build duration을 노출한다.
