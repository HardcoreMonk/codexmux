# purplemux

**A web-native terminal multiplexer for AI coding agents.**
**Run from anywhere—your sessions never disconnect.**

<!-- TODO: 히어로 이미지 / GIF -->

## 설치

```bash
npx purplemux
```

브라우저에서 [http://localhost:8022](http://localhost:8022)으로 접속합니다. 끝.

> Node.js 18+, tmux 필요. macOS 또는 Linux.

## 왜 purplemux인가

- **푸시 알림** — Claude가 질문하거나 작업을 끝내면 폰으로 알림. 탭하면 해당 세션으로 바로 이동
- **모바일 & 멀티 디바이스** — 데스크탑에서 시작한 세션을 폰에서 확인하고, 폰에서 한 작업이 데스크탑에 즉시 반영. PWA로 앱 설치 없이 사용
- **멀티 세션 대시보드** — 모든 Claude Code 세션의 busy/idle/attention 상태를 한눈에 확인. Rate limit 잔여량과 리셋 카운트다운을 항상 표시
- **라이브 세션 뷰** — 터미널 스크롤 대신 메시지, 도구 호출, 태스크, 권한 요청을 실시간으로 확인. 권한 승인도 세션 뷰에서 직접 처리
- **끊김 없는 세션** — tmux 기반. 브라우저를 닫아도, 폰이 꺼져도, 노트북 뚜껑을 덮어도 세션은 계속 실행. 재접속하면 그대로 이어서 작업
- **셀프 호스팅 & 오픈소스** — 코드와 세션 데이터가 내 머신에만 존재. 외부 서버 경유 없음. MIT 라이선스
- **암호화된 원격 접근** — Tailscale 연동으로 WireGuard 기반 암호화 터널을 통해 어디서든 HTTPS로 안전하게 접속. 별도 인증서 관리 불필요

## 어떻게 동작하나

서버 머신(또는 개발 맥)에서 `npx purplemux`를 실행하면, 브라우저에서 접속할 수 있는 웹 터미널이 열립니다. 터미널은 tmux 위에서 동작하므로 브라우저를 닫아도 세션이 유지됩니다.

Claude Code가 실행되면 JSONL 세션 로그를 실시간으로 파싱하여 타임라인에 표시하고, 프로세스 트리를 감시하여 상태를 추적합니다. 권한 요청이나 질문이 발생하면 푸시 알림을 보내, 자리를 비워도 놓치지 않습니다.

Tailscale과 조합하면 외부에서도 HTTPS로 안전하게 접속할 수 있습니다.

## 공식 Remote Control과 뭐가 다른가

|  | 공식 Remote Control | purplemux |
|---|---|---|
| 인터페이스 | 모바일 앱 | 웹 브라우저 (앱 설치 불필요) |
| 푸시 알림 | ✗ | ✓ Web Push |
| 세션 지속성 | 연결 끊기면 유실 | tmux 기반 영구 세션 |
| 멀티 세션 | 1개만 | 무제한 |
| 라이브 세션 뷰 | ✗ | ✓ |
| 토큰/비용 통계 | ✗ | ✓ |
| Rate limit 모니터링 | ✗ | ✓ |
| 콜드 스타트 (폰에서 새 세션) | ✗ | ✓ |
| 원격 접근 | 데스크탑 켜져 있어야 | Tailscale 암호화 터널 |

## 특징

### 터미널

- **패널 분할** — 가로/세로 자유 분할, 드래그로 크기 조절
- **탭 관리** — 다중 탭, 드래그 순서 변경, 프로세스명 기반 자동 타이틀
- **키보드 단축키** — 분할, 탭 전환, 포커스 이동
- **터미널 테마** — 다크/라이트 모드, 다양한 컬러 테마
- **워크스페이스** — 패널 레이아웃, 탭, 작업 디렉토리를 워크스페이스 단위로 저장/복원
- **Git Diff 뷰어** — 터미널 패널에서 바로 git diff 확인. Side-by-side / Line-by-line 뷰 전환, Syntax highlighting
- **웹 브라우저 패널** — 터미널 옆에 내장 브라우저로 개발 결과 확인 (Electron)

### Claude Code 연동

- **실시간 상태** — 여러 세션의 busy/idle/attention 상태 표시
- **라이브 세션 뷰** — 메시지, 도구 호출, 태스크, 권한 요청, thinking 블록
- **원클릭 Resume** — 중단된 세션을 브라우저에서 바로 재개
- **Resume Return 감지** — 컨텍스트 윈도우 초과 / 장시간 유휴 시 나타나는 Resume Return 다이얼로그를 타임라인에서 감지하고 선택지를 바로 노출
- **자동 Resume** — 서버 시작 시 이전 Claude 세션 자동 복구
- **빠른 프롬프트** — 자주 쓰는 프롬프트 등록, 원클릭 전송
- **메시지 히스토리** — 이전 메시지 재사용
- **사용량 통계** — 토큰(input/output/cache read/cache write), 비용, 프로젝트별 분석, 일별 AI 리포트
- **Rate Limit** — 5시간/7일 잔여량, 리셋 카운트다운

### 모바일 & 접근성

- **반응형 UI** — 폰/태블릿에서 터미널과 타임라인 사용
- **PWA** — 홈 화면 추가, 네이티브 앱 느낌
- **Web Push** — 탭을 닫아도 알림 수신
- **멀티 디바이스 동기화** — 워크스페이스 변경사항 실시간 반영
- **Tailscale** — WireGuard 암호화 터널로 외부에서 HTTPS 접속
- **비밀번호 인증** — scrypt 해싱, 외부 노출 시에도 안전

### AI 에이전트 (Beta)

독립적인 AI 에이전트를 생성하여 역할과 성격(soul)을 부여하고, 멀티 탭으로 태스크를 병렬 실행합니다. 에이전트별 채팅, 메모리, 워크스페이스를 제공합니다.

## 지원 플랫폼

| 플랫폼 | 상태 | 비고 |
|---|---|---|
| macOS (Apple Silicon / Intel) | ✅ | Electron 앱 포함 |
| Linux | ✅ | Electron 제외 |
| Windows | ❌ | 미지원 |

## 설치 상세

### 필수 요구사항

- macOS 13+ 또는 Linux
- [Node.js](https://nodejs.org/) 18+
- [tmux](https://github.com/tmux/tmux)

### npx (가장 빠름)

```bash
npx purplemux
```

### 글로벌 설치

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

개발 모드:

```bash
pnpm dev
```

## 외부 접속 (Tailscale Serve)

```bash
tailscale serve --bg 8022
```

`https://<machine>.<tailnet>.ts.net`으로 접속. 해제:

```bash
tailscale serve --bg off 8022
```

## 보안

### 비밀번호

최초 접속 시 비밀번호를 설정합니다. scrypt로 해싱되어 `~/.purplemux/config.json`에 저장됩니다.

환경변수로 직접 지정:

```bash
AUTH_PASSWORD=<비밀번호> NEXTAUTH_SECRET=<시크릿> purplemux
```

### HTTPS

기본은 HTTP입니다. 외부 노출 시 반드시 HTTPS를 적용하세요:

- **Tailscale Serve** — WireGuard 암호화 + 인증서 자동 적용
- **Nginx / Caddy** — WebSocket 업그레이드 헤더(`Upgrade`, `Connection`) 전달 필수

### 데이터 디렉토리 (`~/.purplemux/`)

| 파일 | 설명 |
|---|---|
| `config.json` | 인증 정보(해싱), 앱 설정 |
| `workspaces.json` | 워크스페이스 레이아웃, 탭, 디렉토리 |
| `vapid-keys.json` | Web Push VAPID 키 (자동 생성) |
| `push-subscriptions.json` | 푸시 구독 정보 |
| `hooks/` | 사용자 정의 훅 |

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  xterm.js │ │ Timeline  │ │ Status   │ │ Multi-device│  │
│  │  Terminal  │ │           │ │          │ │ Sync        │  │
│  └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘  │
└────────┼─────────────┼────────────┼───────────────┼─────────┘
         │ws           │ws          │ws             │ws
         │/terminal    │/timeline   │/status        │/sync
         ▼             ▼            ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Server (:8022)                                     │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ node-pty │  │ JSONL Watcher│  │ Status Manager     │    │
│  │ PTY↔WS   │  │ File watch → │  │ Process tree +     │    │
│  │ Binary   │  │ Parse → Send │  │ JSONL tail analysis │    │
│  └────┬─────┘  └──────┬───────┘  └─────────┬──────────┘    │
└───────┼───────────────┼────────────────────┼───────────────┘
        ▼               ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│  System                                                     │
│  tmux (purple socket)         Claude Code                   │
│  ┌────────┐ ┌────────┐       ┌─────────────────────────┐   │
│  │Session1│ │Session2│  ...  │ ~/.claude/sessions/      │   │
│  │ (shell)│ │ (shell)│       │ ~/.claude/projects/      │   │
│  └────────┘ └────────┘       │   └─ {project}/{sid}.jsonl│  │
│                              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Terminal I/O** — xterm.js connects to node-pty via WebSocket; node-pty attaches to tmux sessions. Binary protocol handles stdin/stdout/resize with backpressure control.

**Status detection** — Claude Code event hooks (`SessionStart`, `Stop`, `Notification`) deliver instant updates via HTTP POST. Polling every 5–15s inspects process trees and analyzes the last 8KB of JSONL files.

**Timeline** — Watches JSONL session logs under `~/.claude/projects/`, parses new lines on change, and streams structured entries to the browser.

**tmux isolation** — Uses a dedicated `purple` socket, completely separate from your existing tmux. No prefix key, no status bar.

**Auto recovery** — On server start, restores previous Claude sessions via `claude --resume {sessionId}`.

## 기여

[Contributing Guide](CONTRIBUTING.md)를 참고하세요.

## License

[MIT](LICENSE)
