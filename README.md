# purplemux

**A web-native terminal multiplexer for Claude Code**

Run, monitor, and manage multiple Claude Code sessions from any browser.

---

브라우저 하나로 여러 Claude Code 세션을 실행하고 모니터링하는 웹 기반 터미널 멀티플렉서입니다. 미리 구성한 터미널 워크스페이스에 어디서든 접속해서, 이전 환경 그대로 이어서 작업할 수 있습니다.

## 왜 purplemux인가

- **Claude Code 다중 세션 관리** — 여러 세션의 busy/idle/attention 상태를 한눈에 보고, 타임라인으로 진행 상황을 확인하고, 원클릭으로 세션을 재개합니다
- **어디서든 같은 환경** — 브라우저만 있으면 어떤 기기에서든 동일한 작업 환경에 접속. Tailscale과 조합하면 모바일에서도 Claude 작업 상태를 확인하고 응답할 수 있습니다
- **리소스 분리** — 원격 서버에서 Claude를 실행하면 로컬 머신의 발열과 쓰로틀링 없이 여러 세션을 병렬로 돌릴 수 있습니다

## 특징

### 터미널

- **패널 분할** — 가로/세로 자유 분할, 드래그로 크기 조절
- **탭 관리** — 다중 탭 생성, 드래그로 순서 변경, 프로세스명 기반 자동 타이틀
- **키보드 단축키** — 분할, 탭 전환, 포커스 이동 등 주요 조작을 키보드로 수행
- **터미널 테마** — 다크/라이트 모드와 다양한 컬러 테마
- **세션 유지** — tmux 기반으로 브라우저를 닫아도 세션이 계속 실행. 다시 접속하면 그대로 이어서 작업
- **워크스페이스** — 패널 레이아웃, 탭, 작업 디렉토리를 워크스페이스 단위로 저장/복원
- **웹 브라우저 패널** — 터미널 옆에 내장 브라우저를 열어 개발 결과를 바로 확인 (Electron)

### Claude Code 연동

- **실시간 상태 모니터링** — 여러 Claude CLI 세션의 busy/idle/attention 상태를 한눈에 표시
- **타임라인 시각화** — 메시지, 도구 호출, 태스크, 권한 요청 등 Claude의 활동을 실시간으로 확인
- **세션 메타 정보** — Git 브랜치, 변경 파일 수, tmux 세션 정보를 타임라인 상단에 표시
- **원클릭 Resume** — 중단된 Claude 세션을 브라우저에서 바로 재개
- **자동 Resume** — 서버 시작 시 이전에 실행 중이던 Claude 세션을 자동으로 재개
- **권한 프롬프트 응답** — Claude의 bypass/permission 프롬프트에 타임라인에서 직접 응답
- **빠른 프롬프트** — 자주 사용하는 프롬프트를 등록해 원클릭으로 전송
- **메시지 히스토리** — 이전에 보낸 메시지를 다시 불러와서 재사용
- **알림** — 세션 상태 변경(attention 등)을 알림으로 받아 놓친 요청 없이 대응
- **사용량 통계** — 토큰 사용량, 비용, 프로젝트별 분석, 일별 추이를 대시보드에서 확인
- **데일리 노트** — 일별 작업 내역을 AI가 자동 요약하여 리포트 생성

### 접근성

- **웹 기반** — 브라우저만 있으면 어디서든 터미널 사용. Tailscale과 조합하면 외부에서도 HTTPS로 안전하게 접근
- **모바일/태블릿 지원** — 반응형 UI로 모바일 기기에서도 터미널 조작 가능
- **멀티 디바이스 동기화** — 여러 기기에서 동시 접속, 워크스페이스 변경사항 실시간 반영
- **인증** — 비밀번호 기반 접근 제어로 외부 노출 시에도 안전하게 사용
- **Electron 앱** — 데스크톱 앱으로도 사용 가능

### AI 에이전트 (Beta)

독립적인 AI 에이전트를 생성하여 역할과 성격(soul)을 부여하고, 멀티 탭으로 태스크를 실행할 수 있습니다. 에이전트별 채팅, 메모리, 워크스페이스를 제공합니다.

## 지원 플랫폼

| 플랫폼 | 상태 |
| --- | --- |
| macOS (Apple Silicon / Intel) | ✅ 지원 |
| Linux | ❌ 미지원 |
| Windows | ❌ 미지원 |

현재 macOS 전용입니다. `node-pty` 네이티브 바이너리가 macOS용으로만 포함되어 있으며, tmux 연동과 프로세스 감지 로직이 macOS 환경을 기준으로 동작합니다.

## 설치 및 실행

### 필수 요구사항

- macOS 13 (Ventura) 이상
- [Node.js](https://nodejs.org/) 18+
- [tmux](https://github.com/tmux/tmux)

### npx로 바로 실행

```bash
npx purplemux
```

### 직접 설치

```bash
npm install -g purplemux
purplemux
```

### 소스에서 실행

```bash
git clone https://github.com/subicura/purplemux.git
cd purplemux
pnpm install
pnpm start
```

브라우저에서 [http://localhost:8022](http://localhost:8022)으로 접속합니다.

개발 모드:

```bash
pnpm dev
```

## 외부 접속 (Tailscale Serve)

[Tailscale](https://tailscale.com/)을 사용하면 로컬 서버를 HTTPS로 안전하게 외부에서 접근할 수 있습니다.

```bash
tailscale serve --bg 8022
```

`https://<machine-name>.<tailnet>.ts.net`으로 접속합니다.

해제:

```bash
tailscale serve --bg off 8022
```

## 보안

### 초기 비밀번호 설정

최초 접속 시 온보딩 화면에서 비밀번호를 설정합니다. 설정된 비밀번호는 scrypt로 해싱되어 `~/.purplemux/config.json`에 저장됩니다.

환경변수로 직접 지정할 수도 있습니다:

```bash
AUTH_PASSWORD=<비밀번호> NEXTAUTH_SECRET=<시크릿> purplemux
```

환경변수가 설정되면 config.json보다 우선 적용됩니다.

### HTTPS 역프록시

purplemux는 기본적으로 HTTP로 동작합니다. 외부 네트워크에 노출할 경우 반드시 HTTPS를 적용하세요.

- **Tailscale Serve** — 위 [외부 접속](#외부-접속-tailscale-serve) 섹션 참고. 별도 인증서 관리 없이 HTTPS가 자동 적용됩니다
- **Nginx / Caddy 등** — 역프록시 설정 시 WebSocket 업그레이드 헤더(`Upgrade`, `Connection`)를 반드시 전달해야 합니다

### 데이터 디렉토리 (`~/.purplemux/`)

앱 설정과 데이터는 `~/.purplemux/` 디렉토리에 저장됩니다:

| 파일 | 설명 |
| --- | --- |
| `config.json` | 인증 정보(해싱된 비밀번호, 시크릿), 앱 설정 |
| `workspaces.json` | 워크스페이스 레이아웃, 탭, 디렉토리 |
| `hooks/` | 사용자 정의 훅 스크립트 |

이 디렉토리에 민감한 인증 정보가 포함되므로, 다른 사용자에게 읽기 권한을 부여하지 않도록 주의하세요.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  xterm.js │ │ Timeline  │ │ Status   │ │ Multi-device│  │
│  │  터미널   │ │ 타임라인  │ │ 상태표시 │ │ 동기화      │  │
│  └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘  │
└────────┼─────────────┼────────────┼───────────────┼─────────┘
         │ws           │ws          │ws             │ws
         │/terminal    │/timeline   │/status        │/sync
         ▼             ▼            ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Server (:8022)                                     │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ node-pty │  │ JSONL Watcher│  │ Status Manager     │    │
│  │          │  │              │  │                    │    │
│  │ PTY↔WS   │  │ 파일 감시 → │  │ 프로세스 트리 탐색 │    │
│  │ 바이너리 │  │ 파싱 → 전송 │  │ + JSONL tail 분석  │    │
│  └────┬─────┘  └──────┬───────┘  └─────────┬──────────┘    │
│       │               │                    │               │
└───────┼───────────────┼────────────────────┼───────────────┘
        │               │                    │
        ▼               ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│  System                                                     │
│                                                             │
│  tmux (purple 소켓)          Claude Code                    │
│  ┌────────┐ ┌────────┐       ┌─────────────────────────┐   │
│  │Session1│ │Session2│  ...  │ ~/.claude/sessions/*.json│   │
│  │ (shell)│ │ (shell)│       │ ~/.claude/projects/      │   │
│  └────────┘ └────────┘       │   └─ {project}/{sid}.jsonl│  │
│                              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 핵심 구조

**터미널 I/O** — 브라우저의 xterm.js가 WebSocket을 통해 서버의 node-pty에 연결되고, node-pty는 tmux 세션에 attach합니다. 바이너리 프로토콜로 stdin/stdout/resize를 처리하며, 백프레셔 제어로 대량 출력 시에도 안정적으로 동작합니다.

**상태 감지** — 두 가지 경로로 Claude의 상태를 파악합니다:
- **Hook**: Claude Code의 이벤트 훅(`SessionStart`, `Stop`, `Notification` 등)이 HTTP POST로 상태 변경을 즉시 전달
- **Polling**: 5~15초 간격으로 tmux pane의 프로세스 트리를 탐색하고, JSONL 파일의 마지막 8KB를 분석하여 busy/idle을 판별

**타임라인** — Claude Code가 `~/.claude/projects/` 하위에 기록하는 JSONL 세션 로그를 실시간으로 감시합니다. 파일 변경 시 새로운 라인을 파싱하여 메시지, 도구 호출, 태스크 진행 상황을 브라우저에 스트리밍합니다.

**tmux 격리** — `purple`이라는 전용 소켓을 사용하여 사용자의 기존 tmux 환경과 완전히 분리됩니다. prefix 키 없음, 상태 바 없음, 모든 키 입력이 셸로 직접 전달됩니다.

**자동 복구** — 서버 시작 시 이전 워크스페이스의 Claude 세션을 자동으로 재개합니다. tmux 세션이 없으면 생성하고, `claude --resume {sessionId}`를 전송합니다.

## License

[MIT](LICENSE)
