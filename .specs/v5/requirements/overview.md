# Purple Terminal v5 — 프로젝트 개요

## 비전

웹 기반 영속적 작업 환경. 로컬 PC에 서버를 띄우고, 브라우저에서 터미널 + Claude Code를 통합 관리하는 도구.

**핵심 가치**: 한번 열어둔 작업이 서버 재시작 후에도 그 자리에 그대로 있는 것.

## 계층 구조

```
Server (= Window)
└── Workspace (사이드바 항목 = 프로젝트)  ← v5 범위
    └── Pane (분할 영역)
        └── Surface (탭)
            └── Panel (콘텐츠)
```

| 계층 | 역할 |
|---|---|
| Server | 로컬 서버 프로세스 하나 = 하나의 Window |
| **Workspace** | **프로젝트와 1:1 매핑. 독립적인 Pane 레이아웃 보유** |
| Pane | 수평/수직 분할 영역. 하나 이상의 Surface(탭) 포함 |
| Surface | Pane 내의 탭. 하나의 Panel을 렌더링 |
| Panel | 실제 콘텐츠 단위. Terminal, Claude Code 등 |

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js (Pages Router) + Custom Server |
| 프론트엔드 | React + xterm.js |
| 터미널 | tmux (-L purple) + node-pty |
| 통신 | WebSocket |
| 상태 저장 | `~/.purple-terminal/` 하위 JSON 파일 |
| Claude Code 연동 | 세션 파일 파싱 + CLI 실행 |

## 완료 사항

| 항목 | 상태 |
|---|---|
| Phase 1: 웹 터미널 (xterm.js + node-pty + WebSocket) | ✅ 완료 |
| Custom Server 전환 (API Route → server.ts) | ✅ 완료 |
| Phase 2: tmux 백엔드 (세션 영속성, detaching 플래그, close code 정책) | ✅ 완료 |
| Phase 3: Surface (탭 바 UI, 탭 생성/전환/삭제/순서 변경/이름 변경, 탭 영속성) | ✅ 완료 |
| Phase 4: Pane (화면 분할, Pane별 독립 xterm.js/탭/WebSocket, 리사이즈, 탭 이동, layout.json) | ✅ 완료 |

## 구현 로드맵

| Phase | 핵심 | 의존 | 상태 |
|---|---|---|---|
| 1. 웹 터미널 | 브라우저에서 터미널 동작 | - | ✅ 완료 |
| 2. tmux 백엔드 | 세션 영속성 | Phase 1 | ✅ 완료 |
| 3. Surface | 탭 관리 | Phase 2 | ✅ 완료 |
| 4. Pane | 화면 분할 | Phase 3 | ✅ 완료 |
| **5. Workspace** | **프로젝트 단위 관리** | **Phase 4** | **← v5 범위** |
| 6. 레이아웃 영속성 | 전체 상태 복원 | Phase 5 | |
| 7. 단축키 | cmux 호환 조작 | Phase 4 | |
| 8. Claude Code Panel | 타임라인 + 터미널 | Phase 6 | |
| 9. 세션 탐색 | 과거 세션 resume | Phase 8 | |
