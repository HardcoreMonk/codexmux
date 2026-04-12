# purplemux

**A web-native terminal multiplexer for Claude Code.**
**Run from anywhere—your sessions never disconnect.**

<!-- TODO: 히어로 이미지 / GIF -->

## 설치

```bash
npx purplemux
```

브라우저에서 [http://localhost:8022](http://localhost:8022)으로 접속합니다. 끝.

> Node.js 18+, tmux 필요. macOS 또는 Linux.

## 왜 purplemux인가

- **멀티 세션 대시보드** — 모든 Claude Code 세션의 작업중/사용자 요청 상태를 한눈에 확인
- **Rate Limit 모니터링** — 5시간/7일 잔여량과 리셋 카운트다운 표시
- **푸시 알림** — 작업 완료나 입력이 필요하면 데스크탑/모바일 알림
- **모바일 & 멀티 디바이스** — 폰, 태블릿, 다른 데스크탑 어디서든 같은 세션에 접속
- **라이브 세션 뷰** — CLI 출력을 스크롤할 필요 없이, 진행 상황을 타임라인으로 정리해서 표시

그리고:

- **끊김 없는 세션** — tmux 기반. 브라우저를 닫아도 세션과 작업 환경이 그대로 유지. 재접속하면 탭, 패널, 디렉토리까지 마지막 상태 그대로
- **셀프 호스팅 & 오픈소스** — 코드와 세션 데이터가 내 머신에만 존재. 외부 서버 경유 없음
- **암호화된 원격 접근** — Tailscale로 어디서든 HTTPS 접속

## 공식 Remote Control과 뭐가 다른가

> 공식 Remote Control은 단일 세션 원격 제어에 초점을 둡니다. purplemux는 멀티 세션 관리, 푸시 알림, 세션 지속성이 필요할 때 사용합니다.

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

- **실시간 상태** — 작업중/사용자 요청 상태 표시, 세션 간 전환
- **라이브 세션 뷰** — 메시지, 도구 호출, 태스크, 권한 요청, thinking 블록
- **원클릭 Resume** — 중단된 세션을 브라우저에서 바로 재개
- **Resume Return 감지** — 컨텍스트 초과/유휴 시 선택지를 타임라인에서 바로 노출
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
- **다국어 지원** — 한국어, English, 日本語, 中文 등 11개 언어

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
