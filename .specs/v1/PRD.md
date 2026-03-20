# v1 요구사항 정리

## 출처

- `.specs/v1/requirements/overview.md` — 프로젝트 개요, 계층 구조, 기술 스택, 로드맵
- `.specs/v1/requirements/phase1-web-terminal.md` — Phase 1 웹 터미널 상세 요구사항

## 프로젝트 비전

웹 기반 영속적 작업 환경. 로컬 PC에 서버를 띄우고, 브라우저에서 터미널 + Claude Code를 통합 관리하는 도구.

**핵심 가치**: 한번 열어둔 작업이 서버 재시작 후에도 그 자리에 그대로 있는 것.

## 계층 구조

```
Server (= Window)
└── Workspace (사이드바 항목 = 프로젝트)
    └── Pane (분할 영역)
        └── Surface (탭)
            └── Panel (콘텐츠)
```

| 계층      | 역할                                          |
| --------- | --------------------------------------------- |
| Server    | 로컬 서버 프로세스 하나 = 하나의 Window       |
| Workspace | 프로젝트와 1:1 매핑. 독립적인 Pane 레이아웃 보유 |
| Pane      | 수평/수직 분할 영역. 하나 이상의 Surface(탭) 포함 |
| Surface   | Pane 내의 탭. 하나의 Panel을 렌더링           |
| Panel     | 실제 콘텐츠 단위. Terminal, Claude Code 등     |

## 페이지 목록 (도출)

| 페이지           | 설명                                            | 우선순위 |
| ---------------- | ----------------------------------------------- | -------- |
| `/` (메인)       | 전체 화면 웹 터미널. xterm.js 기반 터미널 렌더링 | P0       |
| `/api/terminal`  | WebSocket 엔드포인트. PTY 프로세스 관리          | P0       |

> Phase 1은 단일 페이지 + 단일 API 엔드포인트로 구성된다. Workspace, Surface, Pane 등 복잡한 UI는 Phase 2 이후에 도입.

## 주요 요구사항

### 메인 페이지 (`/`)

#### 터미널 렌더링

- xterm.js를 사용하여 터미널을 렌더링한다
- 터미널이 브라우저 화면 전체를 차지한다 (전체 화면 터미널)
- 키 입력을 WebSocket으로 서버에 전송한다
- 서버로부터 받은 출력을 터미널에 렌더링한다

#### WebSocket 연결

- 페이지 로드 시 자동으로 `/api/terminal` WebSocket 연결을 수립한다
- 바이너리 데이터를 처리할 수 있어야 한다 (컬러 출력, 특수 문자 등)
- 연결이 끊어진 경우 사용자에게 알린다

#### 터미널 리사이즈

- 브라우저 리사이즈 이벤트를 감지하여 터미널 크기를 재계산한다
- 변경된 크기(cols, rows)를 서버에 전달한다

### API 엔드포인트 (`/api/terminal`)

#### PTY 프로세스 관리

- `node-pty`를 사용하여 사용자의 기본 쉘을 실행한다
- PTY의 stdout을 WebSocket으로 클라이언트에 전송한다
- 클라이언트의 입력을 WebSocket으로 받아 PTY의 stdin에 전달한다
- 연결 종료 시 PTY 프로세스를 정리한다

#### WebSocket 통신

- API Route에서 HTTP 연결을 업그레이드하여 WebSocket을 처리한다
- 리사이즈 메시지를 받아 PTY 크기를 업데이트한다

## 비기능 요구사항

| 항목       | 요구사항                                                              |
| ---------- | --------------------------------------------------------------------- |
| 지연 시간  | 키 입력에서 화면 출력까지 체감 지연 없음 (로컬 환경 기준)             |
| 호환성     | vim, htop, git 등 TUI 프로그램이 정상 동작                           |
| 한글 입력  | 한글 IME 입력이 정상적으로 처리                                      |

## 기술 구성

```
Browser                          Server (Next.js)
┌──────────────┐    WebSocket    ┌──────────────────────┐
│  xterm.js    │ ◄────────────► │  /api/terminal       │
│  (터미널 UI)  │                │  (node-pty + ws)     │
│              │    HTTP         │                      │
│  Next.js     │ ◄────────────► │  Pages Router        │
│  (페이지)     │                │  (SSR/정적 서빙)      │
└──────────────┘                └──────────────────────┘
```

| 용도          | 라이브러리              |
| ------------- | ----------------------- |
| 프레임워크    | Next.js (Pages Router)  |
| 터미널 렌더링 | xterm.js                |
| 가상 터미널   | node-pty                |
| WebSocket     | ws                      |
| 프론트엔드    | React                   |

## 검증 시나리오

1. **기본 명령어 실행**: `ls`, `echo`, `pwd` 등 기본 명령어가 정상 동작한다
2. **인터랙티브 프로그램**: `vim`, `htop` 등 TUI 프로그램이 정상 동작한다
3. **컬러 출력**: `ls --color`, git diff 등 ANSI 컬러가 올바르게 렌더링된다
4. **한글 입력/출력**: 한글 파일명 생성, 한글 텍스트 echo가 정상 동작한다
5. **리사이즈**: 브라우저 창 크기를 변경하면 터미널이 자연스럽게 재조정된다
6. **장시간 출력**: `find /` 같은 대량 출력이 멈추지 않고 처리된다

## 범위 제외 (Phase 1에서 하지 않는 것)

| 항목                  | 담당 Phase |
| --------------------- | ---------- |
| tmux 세션 연동        | Phase 2    |
| 탭(Surface) 관리      | Phase 3    |
| 화면 분할(Pane)       | Phase 4    |
| 프로젝트(Workspace)   | Phase 5    |
| 레이아웃 영속성       | Phase 6    |
| 단축키 체계           | Phase 7    |
| Claude Code 연동      | Phase 8    |
| 다중 터미널 세션      | Phase 2+   |
| 인증/보안             | 추후       |

## 제약 조건 / 참고 사항

- **Custom Server 금지**: Next.js 기본 서버만 사용. API Route를 통해 WebSocket을 처리해야 하므로, Next.js API Route에서 HTTP → WebSocket 업그레이드가 가능한 구조인지 사전 검증 필요
- **node-pty 네이티브 모듈**: node-pty는 C++ 네이티브 모듈이므로 빌드 환경(node-gyp, Python 등)이 갖춰져야 한다. 설치 실패 시 대안(예: `child_process.spawn` + pseudo-tty)을 검토
- **xterm.js 애드온 전략**: xterm.js는 코어만으로는 부족하고, `@xterm/addon-fit`(리사이즈), `@xterm/addon-web-links`(URL 클릭), `@xterm/addon-webgl`(GPU 렌더링) 등 애드온을 선택적으로 적용해야 한다. 특히 `addon-fit`은 리사이즈 요구사항에 필수
- **WebSocket 메시지 프로토콜 설계**: 단순 stdin/stdout 중계와 리사이즈 명령을 구분하기 위한 메시지 프로토콜이 필요. JSON 래핑 vs 바이너리 프레임 방식 중 선택 필요 — 대량 출력 성능을 고려하면 바이너리 기반이 유리
- **성능 고려**: 대량 출력(예: `find /`) 시 WebSocket 버퍼링 전략 필요. xterm.js의 `write()` 호출이 과도하면 브라우저가 멈출 수 있으므로 청크 단위 처리 검토
- **UX 완성도**: 연결 끊김 시 단순 알림에 그치지 않고, 자동 재연결 시도 + 재연결 상태 표시(연결 중/재시도 중/실패) UI가 필요. 토스급 UX를 위해 연결 상태 인디케이터를 터미널 상단이나 하단에 표시

## 미확인 사항

- [ ] Next.js API Route에서 WebSocket 업그레이드 처리 방식 — `pages/api/terminal.ts`에서 `res.socket.server`를 통한 업그레이드가 안정적으로 동작하는지 검증 필요
- [ ] xterm.js 테마/폰트 설정 — 기본 테마를 사용할지, 프로젝트 디자인 시스템(Muted 팔레트)에 맞춘 커스텀 테마를 Phase 1에서 적용할지
- [ ] WebSocket 재연결 정책 — 연결 끊김 시 자동 재연결 횟수, 간격, 백오프 전략
- [ ] 터미널 폰트 — 시스템 모노스페이스 폰트 vs 웹폰트(예: JetBrains Mono, Fira Code) 선택
- [ ] 터미널 스크롤백 버퍼 크기 — xterm.js의 `scrollback` 옵션 기본값(1000줄) 사용 vs 확장
- [ ] 클립보드 지원 — 터미널 텍스트 선택 → 복사/붙여넣기 동작 범위 (브라우저 기본 동작으로 충분한지, xterm.js 클립보드 API 연동이 필요한지)
- [ ] 다중 탭/창에서 동시 접속 — Phase 1에서 같은 PTY에 여러 브라우저 탭이 연결되면 어떻게 처리할지 (차단 vs 허용 vs 경고)
- [ ] 상태 저장 경로 확정 — overview에서 `~/.purple-terminal/` 하위 JSON 파일 언급. Phase 1에서는 상태 저장이 필요 없지만, Phase 2를 위해 디렉토리 구조를 미리 잡아둘지
