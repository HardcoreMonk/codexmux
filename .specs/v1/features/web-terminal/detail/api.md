# API 연동

## WebSocket 연결

### 엔드포인트

- URL: `ws://localhost:{port}/api/terminal`
- 프로토콜: WebSocket (HTTP Upgrade)
- 바이너리 타입: `ArrayBuffer`

### 연결 설정

```typescript
const ws = new WebSocket(`ws://${location.host}/api/terminal`);
ws.binaryType = 'arraybuffer';
```

### 연결 파라미터

| 파라미터 | 전달 방식 | 설명 |
| --- | --- | --- |
| (없음) | — | Phase 1에서는 인증, 세션 ID 등 파라미터 없음 |

## 메시지 프로토콜

### 프레임 구조

```
[타입 1바이트] [페이로드 N바이트]
```

### 메시지 타입

| 타입 | 값 | 방향 | 페이로드 | 설명 |
| --- | --- | --- | --- | --- |
| STDIN | `0x00` | 클라이언트 → 서버 | 가변 바이너리 | 사용자 입력 |
| STDOUT | `0x01` | 서버 → 클라이언트 | 가변 바이너리 | PTY 출력 |
| RESIZE | `0x02` | 클라이언트 → 서버 | 4바이트 고정 | 터미널 크기 변경 |
| HEARTBEAT | `0x03` | 양방향 | 0바이트 | 연결 유지 확인 |

### STDIN (0x00)

클라이언트가 서버로 사용자 입력을 전송.

```
[0x00] [키 입력 바이트...]
```

- xterm.js `onData` 콜백에서 받은 문자열을 UTF-8 인코딩하여 전송
- 단일 키 입력: 1~4바이트 (ASCII, 유니코드)
- 붙여넣기: 가변 길이

### STDOUT (0x01)

서버가 클라이언트로 PTY 출력을 전송.

```
[0x01] [PTY 출력 바이트...]
```

- PTY에서 발생한 데이터를 그대로 중계 (ANSI 이스케이프 시퀀스 포함)
- 크기 제한 없음 (WebSocket 프레임 크기에 의존)

### RESIZE (0x02)

클라이언트가 터미널 크기 변경을 서버에 알림.

```
[0x02] [cols: uint16 BE] [rows: uint16 BE]
```

- cols: 2바이트, Big Endian unsigned 16-bit integer
- rows: 2바이트, Big Endian unsigned 16-bit integer
- 예: 120열 × 40행 → `0x02 0x00 0x78 0x00 0x28`

### HEARTBEAT (0x03)

연결 유지 확인.

```
[0x03]
```

- 클라이언트: 30초마다 전송
- 서버: 수신 시 즉시 응답 (pong)
- 서버가 90초(3회) 동안 하트비트 미수신 시 연결 종료

## WebSocket 클로즈 코드

| 코드 | 의미 | 발생 조건 | 클라이언트 처리 |
| --- | --- | --- | --- |
| 1000 | 정상 종료 | PTY 프로세스 정상 종료 (exit) | "세션 종료" UI, 자동 재연결 안 함 |
| 1001 | Going Away | 서버 셧다운 | 자동 재연결 시도 |
| 1011 | Internal Error | PTY 생성 실패 | 에러 메시지 표시, 수동 재연결 |
| 1013 | Try Again Later | 동시 접속 수 초과 | "동시 접속 초과" 메시지 |

## 클라이언트 구현 상세

### 메시지 송신 헬퍼

```typescript
// 타입 정의
const MSG_STDIN = 0x00;
const MSG_STDOUT = 0x01;
const MSG_RESIZE = 0x02;
const MSG_HEARTBEAT = 0x03;

// stdin 전송
const sendStdin = (ws: WebSocket, data: string) => {
  const encoder = new TextEncoder();
  const payload = encoder.encode(data);
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = MSG_STDIN;
  frame.set(payload, 1);
  ws.send(frame.buffer);
};

// 리사이즈 전송
const sendResize = (ws: WebSocket, cols: number, rows: number) => {
  const frame = new ArrayBuffer(5);
  const view = new DataView(frame);
  view.setUint8(0, MSG_RESIZE);
  view.setUint16(1, cols);  // Big Endian (기본)
  view.setUint16(3, rows);
  ws.send(frame);
};

// 하트비트 전송
const sendHeartbeat = (ws: WebSocket) => {
  const frame = new Uint8Array([MSG_HEARTBEAT]);
  ws.send(frame.buffer);
};
```

### 메시지 수신 처리

```typescript
ws.onmessage = (event: MessageEvent) => {
  const data = new Uint8Array(event.data as ArrayBuffer);
  const type = data[0];
  const payload = data.slice(1);

  switch (type) {
    case MSG_STDOUT:
      // xterm.js에 write (청크 큐 경유)
      enqueueWrite(payload);
      break;
    case MSG_HEARTBEAT:
      // pong 응답 (서버 → 클라이언트 하트비트에 대한 응답)
      sendHeartbeat(ws);
      break;
  }
};
```

### 재연결 로직

```typescript
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // 지수 백오프
const MAX_RETRIES = 5;

// 재연결 시:
// 1. 기존 Terminal 인스턴스 유지 (화면 지우지 않음)
// 2. 새 WebSocket 연결
// 3. 연결 성공 시 terminal.clear() + 새 PTY 출력 수신 시작
// 4. 연결 실패 시 다음 딜레이로 재시도
```

## 커스텀 훅 구조

### useTerminalWebSocket

WebSocket 연결 생명주기를 관리하는 훅.

| 반환값 | 타입 | 설명 |
| --- | --- | --- |
| `status` | `'connecting' \| 'connected' \| 'reconnecting' \| 'disconnected' \| 'session-ended'` | 연결 상태 |
| `sendStdin` | `(data: string) => void` | 입력 전송 |
| `sendResize` | `(cols: number, rows: number) => void` | 리사이즈 전송 |
| `reconnect` | `() => void` | 수동 재연결 |
| `onData` | `(callback: (data: Uint8Array) => void) => void` | 출력 수신 콜백 등록 |

### useTerminal

xterm.js 인스턴스와 애드온을 관리하는 훅.

| 반환값 | 타입 | 설명 |
| --- | --- | --- |
| `terminalRef` | `RefObject<HTMLDivElement>` | 마운트 대상 ref |
| `write` | `(data: Uint8Array) => void` | 터미널에 출력 쓰기 |
| `clear` | `() => void` | 터미널 화면 클리어 |
| `fit` | `() => { cols: number; rows: number }` | 리사이즈 수행 + 크기 반환 |
| `focus` | `() => void` | 터미널에 포커스 |
