# tmux 기반 터미널 관리 및 프로세스 감지

PT는 tmux를 터미널 백엔드로 사용합니다. 사용자 `~/.tmux.conf`와 격리된 전용 소켓(`purple`)과 설정(`src/config/tmux.conf`)으로 운영됩니다.

---

## 아키텍처

```
브라우저 (xterm.js)
  │
  │  WebSocket (/api/terminal)
  ▼
terminal-server.ts
  │
  │  node-pty (tmux attach-session)
  ▼
tmux 소켓 (purple)
  │
  ├─ pt-{wsId}-{paneId}-{tabId}   세션 1
  ├─ pt-{wsId}-{paneId}-{tabId}   세션 2
  └─ ...
```

- **소켓 이름**: `purple` (`-L purple`). 시스템 tmux와 완전 격리.
- **세션 네이밍**: `pt-{워크스페이스ID}-{paneID}-{tabID}` 형식
- **설정 파일**: `src/config/tmux.conf` (prefix 비활성, status bar off, 마우스 on)

---

## tmux 설정 (`src/config/tmux.conf`)

| 설정 | 값 | 목적 |
| --- | --- | --- |
| `prefix` | None | 모든 키가 셸에 직접 전달 |
| `status` | off | tmux UI 숨김 (xterm.js가 렌더링) |
| `set-titles` | on | 타이틀을 외부 터미널로 전달 |
| `set-titles-string` | `#{pane_current_command}\|#{pane_current_path}` | 포그라운드 프로세스와 CWD를 파이프로 구분하여 전송 |
| `status-interval` | 2 | 2초마다 타이틀 갱신 |
| `allow-passthrough` | on | OSC 시퀀스 패스스루 허용 |
| `mouse` | on | 마우스 스크롤 → copy-mode 진입 |
| `history-limit` | 5000 | 스크롤백 버퍼 크기 |

---

## tmux 명령어 래퍼 (`src/lib/tmux.ts`)

모든 tmux 호출은 `tmux.ts`를 통해 수행합니다. 직접 `child_process`로 tmux를 호출하지 않습니다.

### 세션 관리

| 함수 | tmux 명령 | 용도 |
| --- | --- | --- |
| `listSessions()` | `tmux -L purple ls -F '#{session_name}'` | `pt-` 접두사 세션 목록 |
| `createSession(name, cols, rows, cwd)` | `tmux -L purple new-session -d -s {name} -x {cols} -y {rows}` | 백그라운드 세션 생성 |
| `killSession(name)` | SIGTERM → `kill-session` → 재확인 → SIGKILL 폴백 | 세션 종료 (프로세스 그룹 단위) |
| `hasSession(name)` | `tmux -L purple has-session -t {name}` | 세션 존재 확인 |
| `cleanDeadSessions()` | `listSessions` + `hasSession` 루프 | 죽은 세션 정리 |
| `scanSessions()` | 서버 시작 시 호출 | 기존 세션 스캔 및 정리 |

### 정보 조회

| 함수 | tmux 명령 | 반환 |
| --- | --- | --- |
| `getSessionCwd(session)` | `display-message -p '#{pane_current_path}'` | 현재 작업 디렉토리 |
| `getSessionPanePid(session)` | `display-message -p '#{pane_pid}'` | pane의 셸 PID |
| `getPaneCurrentCommand(session)` | `list-panes -F '#{pane_current_command}'` | 포그라운드 프로세스명 |
| `getAllPanesInfo()` | `list-panes -a -F '#{session_name}\t#{pane_current_command}\t#{pane_pid}'` | 전체 세션의 프로세스/PID 일괄 조회 |
| `checkTerminalProcess(session)` | `getPaneCurrentCommand` + SAFE_SHELLS 체크 | 셸 여부 판별 (resume 전 안전 검사) |

### 입력 전송

| 함수 | tmux 명령 | 용도 |
| --- | --- | --- |
| `sendKeys(session, command)` | `copy-mode -q` → `send-keys {command} Enter` | 세션에 명령어 전송 (resume 등) |
| `exitCopyMode(session)` | `copy-mode -q` | copy-mode 해제 |

---

## 터미널 연결 (`src/lib/terminal-server.ts`)

WebSocket `/api/terminal?session={name}&clientId={id}` 엔드포인트.

### 바이너리 프로토콜

| 메시지 타입 | 코드 | 방향 | 설명 |
| --- | --- | --- | --- |
| `MSG_STDIN` | `0x00` | 클라이언트 → 서버 | 키 입력 |
| `MSG_STDOUT` | `0x01` | 서버 → 클라이언트 | 터미널 출력 |
| `MSG_RESIZE` | `0x02` | 클라이언트 → 서버 | 터미널 크기 변경 (cols: u16, rows: u16) |
| `MSG_HEARTBEAT` | `0x03` | 양방향 | 연결 생존 확인 (30초 간격, 90초 타임아웃) |
| `MSG_KILL_SESSION` | `0x04` | 클라이언트 → 서버 | 세션 종료 요청 |
| `MSG_WEB_STDIN` | `0x05` | 클라이언트 → 서버 | 웹 입력 (copy-mode 해제 후 전달) |

### 연결 흐름

```
1. WebSocket 연결 수신
2. clientId 중복 시 기존 연결 교체
3. 최대 32개 연결 관리 (초과 시 가장 오래된 연결 정리)
4. tmux attach-session (node-pty 경유)
5. pty.onData → WebSocket MSG_STDOUT
6. WebSocket MSG_STDIN → pty.write
7. backpressure: bufferedAmount > 1MB → pty.pause, < 256KB → pty.resume
8. pty.onExit → cleanup (detach와 session exit 구분)
```

---

## 타이틀 기반 프로세스 감지 (클라이언트)

tmux가 `"#{pane_current_command}|#{pane_current_path}"` 형식으로 타이틀을 전송하고, xterm.js `onTitleChange` 이벤트로 브라우저에 전달됩니다.

### `src/lib/tab-title.ts`

| 함수 | 입력 예시 | 출력 | 용도 |
| --- | --- | --- | --- |
| `parseCurrentCommand(raw)` | `"claude\|/home/user"` | `"claude"` | 파이프 앞부분 (프로세스명) 추출 |
| `isClaudeProcess(raw)` | `"claude\|/home/user"` | `true` | Claude 실행 여부 (`claude` 또는 버전 패턴) |
| `isShellProcess(raw)` | `"zsh\|/home/user"` | `true` | 셸 여부 (zsh/bash/fish/sh) |
| `formatTabTitle(raw)` | `"zsh\|/home/user/project"` | `"project"` | 탭 표시용 이름 (셸이면 디렉토리, 아니면 프로세스명) |

### 사용처

```
xterm.js onTitleChange
  → pane-container.tsx / mobile-surface-view.tsx
    ├─ formatTabTitle(title)      → 탭 메타데이터 업데이트
    ├─ isClaudeProcess(title)     → Claude 실행 여부 상태 저장
    └─ fetchAndUpdateCwd()        → CWD 동기화
```

---

## 프로세스 감지 (서버 — `src/lib/session-detection.ts`)

서버에서 Claude CLI의 세션 상태를 감지하는 로직.

### 프로세스 트리 탐색

```
tmux pane (셸 PID)
  └─ 자식 프로세스 (pgrep -P {panePid})
      └─ claude 프로세스 (ps -p {pid} -o args= 로 확인)
```

### `detectActiveSession(panePid)` 판별 흐름

```
~/.claude 디렉토리 존재?
├─ NO → { status: 'not-installed' }
└─ YES
    └─ pgrep -P {panePid} → 자식 PID 목록
        ├─ 자식 없음 → { status: 'none' }
        └─ 자식 있음
            ├─ [1순위] ~/.claude/sessions/*.json에서 PID 매칭
            │   └─ ps -p {pid} -o args= → 'claude' 포함 확인
            │       ├─ 매칭 → { status: 'active', sessionId, jsonlPath, ... }
            │       └─ 불일치 → PID 파일 삭제 (stale cleanup)
            │
            └─ [2순위] ps args에서 'claude --resume {uuid}' 패턴 매칭
                └─ lsof -a -p {pid} -d cwd -Fn → CWD 조회
                    └─ { status: 'active', sessionId, jsonlPath, ... }
```

### 참조하는 Claude CLI 디렉토리

| 경로 | 내용 |
| --- | --- |
| `~/.claude/` | Claude CLI 루트 |
| `~/.claude/sessions/` | 활성 세션 PID 파일 (`{uuid}.json`) |
| `~/.claude/projects/{projectName}/` | 세션 JSONL 파일 (`{sessionId}.jsonl`) |

PID 파일 형식:
```json
{
  "pid": 12345,
  "sessionId": "abc-def-...",
  "cwd": "/Users/user/project",
  "startedAt": 1711100000
}
```

### 프로세스 감시 (`watchSessionsDir`)

폴링과 fs.watch를 조합하여 세션 변화를 실시간 감지:

| 감시 대상 | 방식 | 간격/조건 |
| --- | --- | --- |
| `~/.claude/sessions/` 디렉토리 변경 | `fs.watch` | 200ms 디바운스 |
| 활성 Claude PID 생존 여부 | `ps -p {pid}` 폴링 | 10초 간격 |
| `~/.claude` 디렉토리 존재 (미설치 시) | 주기적 접근 확인 | 60초 간격 |

변경 감지 시 `detectActiveSession`을 재실행하여 콜백에 전달.

---

## 사용되는 시스템 명령어 요약

| 명령어 | 호출 위치 | 용도 |
| --- | --- | --- |
| `tmux -L purple ...` | `tmux.ts` | 세션 관리, 정보 조회, 키 전송 |
| `pgrep -P {pid}` | `session-detection.ts` | 자식 프로세스 PID 목록 |
| `ps -p {pid}` | `session-detection.ts` | 프로세스 존재/args 확인 |
| `ps -p {pid} -o args=` | `session-detection.ts` | 프로세스 인자 확인 (claude 여부) |
| `lsof -a -p {pid} -d cwd -Fn` | `session-detection.ts` | 프로세스 CWD 조회 (폴백) |

---

## WebSocket 엔드포인트 정리

| 경로 | 핸들러 | 용도 |
| --- | --- | --- |
| `/api/terminal` | `terminal-server.ts` | 터미널 I/O (바이너리 프로토콜) |
| `/api/timeline` | `timeline-server.ts` | Claude 세션 타임라인 (JSONL 감시) |
| `/api/status` | `status-server.ts` | 전체 탭 상태 인디케이터 |
| `/api/sync` | `sync-server.ts` | 클라이언트 간 동기화 |

모든 WebSocket 연결은 `server.ts`에서 NextAuth JWT 인증 후 핸드셰이크.

---

## 서버 시작 순서 (`server.ts`)

```
1. initAuthCredentials()        인증 자격증명 초기화
2. scanSessions()               기존 tmux 세션 스캔/정리
3. applyConfig()                tmux.conf 적용
4. initWorkspaceStore()         워크스페이스 저장소 로드
5. autoResumeOnStartup()        자동 resume 처리
6. getStatusManager().init()    상태 폴링 시작
7. app.prepare()                Next.js 준비
8. server.listen()              HTTP + WebSocket 서버 시작
```

---

## 관련 파일

| 파일 | 설명 |
| --- | --- |
| `src/config/tmux.conf` | tmux 설정 (purple 소켓 전용) |
| `src/lib/tmux.ts` | tmux 명령어 래퍼 |
| `src/lib/terminal-server.ts` | 터미널 WebSocket 핸들러 (node-pty) |
| `src/lib/session-detection.ts` | Claude 세션 감지 (`detectActiveSession`, `watchSessionsDir`) |
| `src/lib/tab-title.ts` | 클라이언트 타이틀 파싱 (`parseCurrentCommand`, `isClaudeProcess`) |
| `src/lib/timeline-server.ts` | 타임라인 WebSocket 핸들러 (JSONL 감시) |
| `src/lib/status-manager.ts` | 상태 폴링 엔진 |
| `src/lib/status-server.ts` | 상태 WebSocket 핸들러 |
| `src/hooks/use-terminal.ts` | xterm.js 훅 (`onTitleChange` 이벤트) |
| `server.ts` | 서버 초기화 및 WebSocket 라우팅 |
