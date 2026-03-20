# Phase 2 — tmux 백엔드 PRD

## 목표

서버 재시작 시 터미널 세션이 유지되는 것.

Phase 1에서 구현한 `node-pty` 직접 호출 방식을 tmux 세션 기반으로 교체한다. tmux가 PTY 프로세스의 생명주기를 관리하므로, 서버가 재시작되어도 tmux 세션이 살아있어 작업 상태가 보존된다.

## 완료 조건

서버를 재시작해도 터미널 상태(실행 중인 프로세스, 출력 히스토리)가 유지된다.

---

## 현재 상태 (Phase 1 완료)

```
Browser ←→ WebSocket ←→ Server (node-pty) ←→ Shell
```

- `server.ts` 커스텀 서버에서 WebSocket 처리
- `node-pty`로 쉘 직접 실행
- 서버 종료 시 PTY 프로세스 소멸 → 작업 손실

## 목표 상태 (Phase 2)

```
Browser ←→ WebSocket ←→ Server ←→ tmux session ←→ Shell
```

- tmux가 세션 생명주기 관리
- 서버는 tmux 세션에 연결/해제만 담당
- 서버 재시작 시 기존 tmux 세션 탐색 → 재연결

---

## 요구사항

### REQ-1: tmux 세션 생성

새 터미널 연결 시 tmux 세션을 생성하여 쉘을 실행한다.

- `node-pty` 직접 쉘 실행 대신 tmux 세션을 생성한다
- tmux 네이밍 규칙: `purple-{id}` (id는 고유 식별자)
- 세션 생성 시 사용자의 기본 쉘(`$SHELL` 또는 `/bin/zsh`)을 실행한다
- 세션의 초기 크기는 클라이언트로부터 받은 cols/rows를 적용한다
- TERM 환경변수는 `xterm-256color`를 유지한다

### REQ-2: tmux 세션 연결

서버는 tmux 세션에 연결하여 데이터를 중계한다.

- 생성된 tmux 세션에 attach하여 입출력을 WebSocket과 중계한다
- 클라이언트 입력(stdin)을 tmux 세션에 전달한다
- tmux 세션 출력(stdout)을 WebSocket으로 클라이언트에 전송한다
- 기존 바이너리 메시지 프로토콜(0x00~0x03)을 그대로 유지한다

### REQ-3: tmux 세션 탐색 및 재연결

서버 시작 시 기존 tmux 세션을 탐색하여 재연결한다.

- 서버 시작 시 `purple-` 접두사를 가진 tmux 세션 목록을 조회한다
- 기존 세션이 있으면 새로 생성하지 않고 해당 세션에 재연결한다
- 재연결 시 tmux 세션의 현재 출력 상태를 클라이언트에 전달한다
- 세션이 없는 경우에만 새 tmux 세션을 생성한다

### REQ-4: 터미널 리사이즈

tmux 세션의 크기 변경을 지원한다.

- 클라이언트 리사이즈 메시지(0x02)를 받으면 tmux 세션 크기를 변경한다
- tmux의 `resize-window` 또는 동등한 방식으로 크기를 조정한다

### REQ-5: 연결 해제 시 세션 유지

WebSocket 연결이 끊어져도 tmux 세션은 유지한다.

- 클라이언트 연결 종료 시 tmux 세션을 종료하지 않는다 (detach만 수행)
- 서버 종료(SIGTERM/SIGINT) 시에도 tmux 세션을 종료하지 않는다
- tmux 세션 내 쉘이 직접 종료(exit)된 경우에만 세션이 사라진다

### REQ-6: tmux 세션 정리

더 이상 필요 없는 tmux 세션을 정리한다.

- tmux 세션 내 쉘이 종료되면 해당 세션은 자동으로 소멸한다
- 서버 시작 시 dead 상태의 `purple-` 세션이 있으면 정리한다

---

## 비기능 요구사항

### NFR-1: 지연 시간

tmux를 경유하더라도 키 입력에서 화면 출력까지 체감 지연이 없어야 한다. (로컬 환경 기준)

### NFR-2: 호환성

Phase 1에서 동작하던 모든 CLI 도구(vim, htop, git 등)가 tmux 환경에서도 정상 동작해야 한다.

### NFR-3: 투명성

사용자는 tmux의 존재를 인지하지 못해야 한다. tmux의 status bar나 prefix key가 노출되지 않는다.

### NFR-4: 기존 프로토콜 호환

클라이언트(프론트엔드) 변경을 최소화한다. 기존 WebSocket 바이너리 프로토콜(STDIN/STDOUT/RESIZE/HEARTBEAT)을 그대로 유지한다.

---

## 범위 제외 (Phase 2에서 하지 않는 것)

| 항목 | 담당 Phase |
|---|---|
| 탭(Surface) 관리 | Phase 3 |
| 화면 분할(Pane) | Phase 4 |
| 프로젝트(Workspace) 관리 | Phase 5 |
| 레이아웃 영속성 (JSON 저장) | Phase 6 |
| 단축키 체계 | Phase 7 |
| Claude Code 연동 | Phase 8 |
| 다중 터미널 세션 UI | Phase 3+ |
| 인증/보안 | 추후 |

---

## 기술 구성

```
Browser                          Server (Custom)                  tmux
┌──────────────┐    WebSocket    ┌──────────────────────┐         ┌────────────┐
│  xterm.js    │ ◄────────────► │  server.ts           │ ◄─────► │  session   │
│  (터미널 UI)  │                │  (tmux 연결 관리)     │  pty    │  purple-{id}│
│              │    HTTP         │                      │         │  └── shell │
│  Next.js     │ ◄────────────► │  Pages Router        │         └────────────┘
│  (페이지)     │                │  (SSR/정적 서빙)      │
└──────────────┘                └──────────────────────┘
```

### 주요 변경점 (Phase 1 대비)

| 항목 | Phase 1 | Phase 2 |
|---|---|---|
| 쉘 실행 | `node-pty`가 직접 쉘 spawn | tmux가 세션 내에서 쉘 실행 |
| 데이터 중계 | `node-pty` onData/write | tmux 세션 attach를 통한 I/O |
| 서버 종료 시 | PTY 프로세스 소멸 | tmux 세션 유지 (detach) |
| 서버 시작 시 | 새 PTY 생성 | 기존 tmux 세션 탐색 → 재연결 |
| 리사이즈 | `pty.resize()` | tmux resize-window |

### 주요 라이브러리

| 용도 | 라이브러리 |
|---|---|
| 프레임워크 | Next.js (Pages Router) + Custom Server |
| 터미널 렌더링 | xterm.js |
| tmux 제어 | tmux CLI (child_process) 또는 node-pty를 통한 tmux attach |
| WebSocket | ws |
| 프론트엔드 | React |

---

## 검증 시나리오

1. **기본 세션 생성**: 브라우저 접속 시 터미널이 정상 동작한다 (Phase 1과 동일한 UX)
2. **서버 재시작 복원**: 서버 종료 후 재시작하면 이전 터미널 상태(실행 중인 프로세스, 출력 히스토리)가 그대로 유지된다
3. **인터랙티브 프로그램 복원**: vim으로 파일 편집 중 서버를 재시작해도 vim이 그대로 살아있다
4. **다중 브라우저 탭**: 동일 세션에 여러 브라우저 탭이 연결되어도 정상 동작한다
5. **세션 종료**: 터미널에서 `exit`를 실행하면 tmux 세션이 정리되고 세션 종료 UI가 표시된다
6. **tmux 투명성**: 사용자가 tmux의 존재를 인지할 수 없다 (status bar 없음, prefix key 비활성)
7. **호환성**: vim, htop, 컬러 출력, 한글 입력이 Phase 1과 동일하게 동작한다
8. **연결 끊김 복원**: 네트워크가 끊겼다 재연결되면 터미널 상태가 유지된다

---

## 제약 조건 / 참고 사항

- **tmux 필수**: 서버 실행 환경에 tmux가 설치되어 있어야 한다. 미설치 시 에러 메시지와 함께 종료
- **tmux 설정 격리**: Purple Terminal 전용 tmux 설정을 사용하여 사용자의 `~/.tmux.conf`와 충돌하지 않아야 한다. tmux 실행 시 `-f` 옵션으로 전용 설정 파일 지정, 또는 `-L` 옵션으로 별도 소켓 사용
- **tmux status bar 비활성**: `set -g status off`로 status bar를 숨겨 xterm.js UI와 충돌하지 않도록 한다
- **tmux prefix key 비활성**: prefix key를 비활성화하여 모든 키 입력이 쉘에 전달되도록 한다
- **tmux 세션 네이밍**: `purple-{id}` 형식. 향후 Phase 3+ 에서 `purple-{workspaceId}-{surfaceId}`로 확장 가능
- **node-pty 유지 여부**: tmux attach에 node-pty를 사용할 수 있으나, `child_process.spawn`으로 tmux를 실행하는 방식도 검토 필요. 핵심은 tmux 세션과의 I/O 중계
- **graceful shutdown 변경**: 서버 종료 시 tmux 세션을 kill하지 않고 WebSocket만 정리한다. 기존 `gracefulShutdown`의 PTY kill 로직을 제거

## 미확인 사항

- [ ] tmux 세션과 서버 간 I/O 중계 방식 — node-pty로 `tmux attach`를 spawn하여 I/O를 중계할지, tmux의 pipe/capture 명령을 활용할지
- [ ] tmux 세션 크기 관리 — 여러 클라이언트가 다른 크기로 연결할 때 tmux의 `aggressive-resize` 옵션 활용 방안
- [ ] tmux 소켓 관리 — 기본 소켓을 사용할지, Purple Terminal 전용 소켓(`-L purple`)을 사용할지
- [ ] 서버 시작 시 세션 매칭 — 현재 단일 터미널이므로 단순하지만, Phase 3(탭) 도입 시 어떤 세션을 어떤 Surface에 매핑할지의 전략
- [ ] tmux 스크롤백 버퍼 — tmux의 `history-limit` 값과 xterm.js의 `scrollback` 값의 조율
- [ ] tmux 버전 호환성 — 최소 요구 tmux 버전 확정
