# Architecture Decision Records

이 문서는 codexmux에서 이미 선택한 오래가는 설계 결정을 한 곳에 모은다. 세부 구현 문서는 `STATUS.md`, `TMUX.md`, `DATA-DIR.md`, `STYLE.md`, `ELECTRON.md`, `ANDROID.md`에 둔다.

## ADR 작성 기준

다음 변경은 이 문서를 함께 갱신한다.

- framework, router, server boundary 변경
- tmux/session/process 감지 방식 변경
- provider model 또는 `agent*` metadata 의미 변경
- `~/.codexmux/` 저장 구조나 auth/security 동작 변경
- Electron/Android 같은 platform shell 동작 변경
- notification, locale, mobile UX 같은 cross-platform 정책 변경

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
- Consequences: `TCliState`, `ITabState`, `StatusManager`, provider detection, `agentSessionId`, `agentSummary` 변경 시 `docs/STATUS.md`도 함께 갱신한다.

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
- Decision: 모바일 UI 개선은 Android 런처, navigation sheet, header, bottom tab bar, 상태 surface를 중심으로 적용하고 terminal input/reconnect 구조 변경은 최소화한다.
- Rationale: 모바일에서 입력 draft 보존과 재접속 안정성이 시각 변화보다 중요하다.
- Consequences: touch target, `active`, `focus-visible`, safe-area, Korean-first typography를 적용하되 xterm, input, textarea, code/path 영역은 줄바꿈 예외로 둔다.
