---
page: web-input
title: Web 입력창
route: /
status: DETAILED
complexity: High
depends_on:
  - .specs/v10/features/cli-state-detection/spec.md
  - .specs/v8/features/claude-code-panel/spec.md
  - .specs/v8/features/realtime-watch/spec.md
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# Web 입력창

## 개요

Claude Code Panel의 타임라인과 터미널 사이에 배치되는 텍스트 입력 컴포넌트. 채팅 앱처럼 텍스트를 입력하고 Enter로 전송하면, 기존 터미널 WebSocket 경로를 통해 Claude Code CLI에 전달된다. CLI 상태에 따라 입력 모드 / 중단 모드 / 비활성 모드로 자동 전환된다.

## 주요 기능

### 레이아웃

- 기존 Claude Code Panel 레이아웃(타임라인 ↔ 터미널) 사이에 고정 높이 영역으로 삽입
- `react-resizable-panels`의 리사이즈 대상이 아님 — 리사이즈 핸들은 타임라인 ↔ (입력창 + 터미널) 사이에 유지
- 입력창 높이: 기본 1줄 (~40px), 내용에 따라 자동 확장 (최대 5줄)
- **오버레이 확장**: 여러 줄 입력 시 터미널 영역 위로 겹쳐 확장 — 타임라인 영역에 영향 없음
- 입력창 우측에 Send 버튼 (lucide-react `SendHorizontal`) — 마우스 보조, Enter가 주 전송 수단

### 텍스트 입력 및 전송

- `textarea` 기반 (autosize), placeholder: "메시지를 입력하세요..."
- **Enter**: 텍스트 + `\r`을 기존 터미널 WebSocket의 `MSG_STDIN` 바이너리 프로토콜로 전송
  - `encodeStdin()`으로 인코딩 → 동일 WebSocket 채널 → PTY write
  - 별도 WebSocket 메시지 타입이나 tmux send-keys 불필요
- **전송 조건**: CLI가 입력 대기 중(입력 모드)일 때만 전송 가능
  - CLI 미실행 상태에서 전송 시도 → `toast.error("Claude Code가 실행 중이 아닙니다")`
- **전송 후**: 입력창 클리어, 포커스 유지 (연속 입력)
- **빈 입력 Enter**: 무시

### 여러 줄 입력

- **Shift+Enter**: 줄바꿈 삽입 (`\n`) → 입력창 높이 자동 확장
- **전송 시 인코딩**: 텍스트 내 `\n`은 그대로 유지, 마지막에 `\r` 추가하여 한 번에 전송
- **붙여넣기 (Cmd+V)**: 여러 줄 텍스트 붙여넣기 시 입력창 자동 확장

### 포커스 관리

- **Cmd/Ctrl+I**: 입력창 포커스 진입 — `keyboard-shortcuts.ts`의 `isAppShortcut` 세트에 추가
- **Escape**: 입력창에서 포커스 해제 → 터미널(xterm.js)로 포커스 이동
- **Enter 전송 후**: 포커스 유지 (연속 입력 패턴)
- **터미널 클릭**: 터미널에 포커스 이동 (입력창 blur)
- **입력창 클릭**: 입력창에 포커스
- xterm.js `customKeyEventHandler`와의 상호작용: Cmd/Ctrl+I가 xterm.js에 전달되지 않도록 처리

### 3가지 입력창 모드

CLI 상태(cli-state-detection에서 제공)에 따라 모드 자동 전환:

#### 입력 모드 (CLI 입력 대기 중)

- textarea 활성, Send 버튼 활성
- placeholder: "메시지를 입력하세요..."
- 텍스트 입력 + Enter로 전송

#### 중단 모드 (CLI 처리 중)

- textarea 비활성 (`disabled`), Send 버튼 → **중단 버튼**으로 교체 (lucide-react `Square`, `text-ui-red`)
- placeholder: "Claude가 응답 중..."
- 중단 버튼 클릭 → shadcn/ui `AlertDialog`로 확인 ("Claude 작업을 중단하시겠습니까?")
- 확인 시 → Escape 2회 (`\x1b\x1b`)를 터미널 WebSocket으로 전송
- 중단 후 CLI가 입력 대기로 복귀 → 입력 모드로 자동 전환

#### 비활성 모드 (CLI 종료, inactive)

- textarea 비활성 (`disabled`), 시각적으로 회색 처리 (`opacity-50`)
- placeholder: "Claude Code가 실행 중이 아닙니다"
- Send 버튼 비활성

### 조건부 표시/숨김

| 상태 | 입력창 |
|---|---|
| `panelType === 'claude-code'` + 타임라인 뷰 (active 또는 inactive) | 표시 |
| `panelType === 'claude-code'` + 세션 목록 뷰 | 숨김 |
| `panelType === 'terminal'` | 숨김 |

- 표시 ↔ 숨김: height transition 150ms
- 숨김 시 입력 내용 초기화

### 다크 모드

- 입력창 배경: `bg-background`
- 테두리: `border` (0.5px), 포커스 시 `border-ring`
- 텍스트: `text-foreground`
- placeholder: `text-muted-foreground`
- 비활성 시: `opacity-50`

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
