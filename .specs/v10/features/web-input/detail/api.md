# API 연동

## 개요

Web 입력창은 새로운 API 엔드포인트를 추가하지 않는다. 기존 터미널 WebSocket의 `MSG_STDIN` 바이너리 프로토콜을 재활용하여 텍스트를 전송한다.

## 기존 API 재활용

### 터미널 WebSocket (ws://api/terminal)

입력창의 텍스트 전송에 사용하는 기존 바이너리 프로토콜.

| 메시지 타입 | 코드 | 방향 | 용도 |
|---|---|---|---|
| MSG_STDIN | 0x00 | 클라이언트 → 서버 | 텍스트를 PTY에 write |

#### 전송 형식

```typescript
// 기존 terminal-protocol.ts의 encodeStdin 재활용
const payload = encodeStdin(text + '\r');  // 텍스트 + Enter
ws.send(payload);                          // 바이너리 전송
```

#### 전송 데이터 인코딩 규칙

| 입력 | 인코딩 | 설명 |
|---|---|---|
| 한 줄 텍스트 + Enter | `"텍스트\r"` | 일반 전송 |
| 여러 줄 텍스트 + Enter | `"줄1\n줄2\n줄3\r"` | 줄바꿈 유지, 마지막에 \r |
| 중단 (Escape 2회) | `"\x1b\x1b"` | CLI 중단 신호 |

### 타임라인 WebSocket (ws://api/timeline)

CLI 상태 감지에 사용하는 기존 WebSocket. cli-state-detection 참조.

| 메시지 타입 | 용도 |
|---|---|
| timeline:init | 초기 엔트리 → 초기 cliState 계산 |
| timeline:append | 새 엔트리 → cliState 갱신 |
| timeline:session-changed | 세션 전환 → cliState 리셋 |

## 클라이언트 훅

### useWebInput

입력창의 상태와 전송 로직을 관리하는 훅.

```typescript
interface IUseWebInputReturn {
  value: string;
  setValue: (v: string) => void;
  mode: 'input' | 'interrupt' | 'disabled';
  send: () => void;
  interrupt: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  focusInput: () => void;
}

const useWebInput: (
  cliState: TCliState,
  terminalWrite: (data: Uint8Array) => void
) => IUseWebInputReturn
```

내부 동작:

- `mode`: `cliState`에서 파생 — `idle` → `input`, `busy` → `interrupt`, `inactive` → `disabled`
- `send()`:
  1. `mode !== 'input'` → 무시 (또는 toast.error)
  2. `value.trim() === ''` → 무시
  3. `encodeStdin(value + '\r')` → `terminalWrite()`
  4. `setValue('')`
- `interrupt()`:
  1. `encodeStdin('\x1b\x1b')` → `terminalWrite()`
- `focusInput()`: `textareaRef.current?.focus()`

### terminalWrite 접근

입력창 컴포넌트가 터미널 WebSocket의 write 함수에 접근하는 방법:

```typescript
// pane-container.tsx에서 터미널 write 함수를 ref 또는 콜백으로 전달
const terminalWriteRef = useRef<(data: Uint8Array) => void>();

// TerminalContainer에서 WebSocket 연결 시 ref에 할당
// WebInput 컴포넌트에서 ref를 통해 호출
```

## 컴포넌트 구조

```
ClaudeCodePanel
├── TimelineView (타임라인, 기존)
├── WebInputBar (신규)
│   ├── textarea (autosize)
│   ├── SendButton / InterruptButton (모드에 따라 전환)
│   └── InterruptAlertDialog (중단 확인)
└── TerminalContainer (터미널, 기존)
```

## 파일 구조

```
src/
├── components/features/terminal/
│   ├── claude-code-panel.tsx       ← 기존 수정: WebInputBar 삽입
│   ├── web-input-bar.tsx           ← 신규: 입력창 컴포넌트
│   ├── interrupt-dialog.tsx        ← 신규: 중단 확인 AlertDialog
│   └── pane-container.tsx          ← 기존 수정: terminalWrite ref 전달
├── hooks/
│   ├── use-web-input.ts            ← 신규: 입력창 상태/전송 로직
│   └── use-timeline.ts             ← 기존 수정: cliState 파생 상태 추가
└── lib/
    └── keyboard-shortcuts.ts       ← 기존 수정: Cmd/Ctrl+I 추가
```

## 에러 처리

| 에러 | 처리 |
|---|---|
| 터미널 WebSocket 미연결 | toast.error("터미널 연결이 끊어졌습니다"), 텍스트 유지 |
| inactive 상태에서 전송 시도 | toast.error("Claude Code가 실행 중이 아닙니다") |
| encodeStdin 실패 (이론상 불가) | console.error, 사용자에게 알림 없음 |
