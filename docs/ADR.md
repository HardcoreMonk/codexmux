# Architecture Decision Records

이 문서는 codexmux에서 이미 선택한 오래가는 설계 결정을 한 곳에 모은다. 세부 구현 흐름은 `ARCHITECTURE-LOGIC.md`에 두고, 영역별 구현 문서는 `STATUS.md`, `TMUX.md`, `DATA-DIR.md`, `SYSTEMD.md`, `STYLE.md`, `ELECTRON.md`, `ANDROID.md`에 둔다.

## ADR 작성 기준

다음 변경은 이 문서를 함께 갱신한다.

- framework, router, server boundary 변경
- tmux/session/process 감지 방식 변경
- provider model 또는 `agent*` metadata 의미 변경
- `~/.codexmux/` 저장 구조나 auth/security 동작 변경
- Electron/Android 같은 platform shell 동작 변경
- notification, locale, mobile UX, terminal input, reconnect/dedupe 같은 cross-platform 정책 변경

작은 copy, 단일 컴포넌트 스타일, 버그 수정은 기존 ADR의 결정과 충돌하지 않으면 새 ADR이 필요 없다.

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
- Consequences: Electron remote/local server mode는 `~/.codexmux/config.json`을 공유한다. Android 런처는 서버 URL 저장, 최근 서버, 자동 연결, 연결 실패 복구를 담당한다.

## ADR-008: Notification Sound는 공통 설정으로 제어

- Status: Accepted
- Decision: 작업 완료 사운드는 `soundOnCompleteEnabled` 하나로 toast, native notification, background Web Push를 함께 제어한다.
- Rationale: 사용자는 foreground/background나 shell 종류와 관계없이 동일한 알림 정책을 기대한다.
- Consequences: `soundOnCompleteEnabled=false`이면 completion sound를 재생하지 않고 system notification도 silent로 요청한다. permission/input 요청 상태는 `needs-input` flow를 유지한다.

## ADR-009: 모바일 UX는 터미널 안정성을 우선한다

- Status: Accepted
- Decision: 모바일 UI 개선은 Android 런처, navigation sheet, header, bottom tab bar, 상태 surface를 중심으로 적용하고 terminal input/reconnect 구조는 보수적으로 유지한다. WebView foreground 복귀 시 terminal/status/timeline/sync WebSocket은 stale `OPEN` 상태를 신뢰하지 않고 필요하면 강제 재연결한다.
- Rationale: 모바일에서 입력 draft 보존과 재접속 안정성이 시각 변화보다 중요하다.
- Consequences: touch target, `active`, `focus-visible`, safe-area, Korean-first typography를 적용하되 xterm, input, textarea, code/path 영역은 줄바꿈 예외로 둔다. 모바일 CODEX `check` 화면은 timeline이 아직 붙지 않아도 하단 terminal preview를 보여 실제 tmux 출력을 확인할 수 있게 한다.

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
- Consequences: perf snapshot은 숫자와 duration/counter만 반환한다. session id, cwd, JSONL path, prompt, assistant text, terminal output 본문은 노출하지 않는다. endpoint는 middleware auth를 통과해야 하며 public health check로 쓰지 않는다. 성능 개선은 timeline append batching/row memo, JSONL tail snapshot cache, DIFF short cache, stats in-flight dedupe처럼 source of truth를 바꾸지 않는 좁은 변경을 우선한다.
