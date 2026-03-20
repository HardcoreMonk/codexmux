# API 연동

> 이 문서는 terminal-session의 서버 구현 관점에서의 API 스펙을 정의한다. Phase 2의 `terminal-server.ts` 변경사항을 명시한다.

## server.ts 변경

### upgrade 핸들러 수정

```typescript
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '', `http://localhost:${port}`);

  if (url.pathname === '/api/terminal') {
    const sessionId = url.searchParams.get('session'); // null이면 새 세션
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, sessionId);
    });
  } else {
    upgrade(request, socket, head);
  }
});
```

- `sessionId`를 connection 이벤트에 전달
- `handleConnection(ws, sessionId)` 시그니처 변경

## terminal-server.ts 변경

### handleConnection 시그니처

```typescript
// Phase 2
export const handleConnection = (ws: WebSocket) => { ... }

// Phase 3
export const handleConnection = async (ws: WebSocket, sessionId: string | null) => { ... }
```

### 세션 매칭 로직

```typescript
let sessionName: string;

if (sessionId) {
  // 특정 세션 요청
  const exists = await hasSession(sessionId);
  if (!exists) {
    ws.close(1011, 'Session not found');
    return;
  }
  sessionName = sessionId;
} else {
  // 새 세션 생성 (Phase 2 하위 호환)
  sessionName = defaultSessionName();
  await createSession(sessionName, 80, 24);
}

// tmux attach (Phase 2와 동일)
const ptyProcess = pty.spawn('tmux', ['-L', 'purple', 'attach', '-t', sessionName], {
  cols: 80,
  rows: 24,
});
```

### IActiveConnection 변경

```typescript
interface IActiveConnection {
  ws: WebSocket;
  pty: IPty;
  sessionName: string;      // Phase 2와 동일
  heartbeatTimer: ReturnType<typeof setInterval>;
  cleaned: boolean;
  detaching: boolean;
}
```

변경 없음. Phase 2에서 이미 `sessionName`과 `detaching`이 있음.

### 세션 종료 시 tabs.json 연동

```typescript
ptyProcess.onExit(({ exitCode, signal }) => {
  if (!conn.detaching) {
    // 세션이 진짜 종료됨 → tabs.json에서 제거
    removeTabBySession(conn.sessionName); // tab-api의 함수 호출
    ws.close(1000, 'Session exited');
  }
  cleanup(conn);
});
```

- `removeTabBySession`: tab-api 모듈에서 export하는 함수
- tabs.json 갱신과 WebSocket close가 원자적으로 처리

## 에러 코드 정리

| 상황 | WebSocket 코드 | reason |
|---|---|---|
| 쉘 exit / UI 종료 | 1000 | `Session exited` |
| 서버 종료 | 1001 | `Server shutting down` |
| 하트비트 타임아웃 | 1001 | `Heartbeat timeout` |
| 세션 미존재 | 1011 | `Session not found` |
| 세션 생성 실패 | 1011 | `Session create failed` |
| attach 실패 | 1011 | `Session attach failed` |
| 동시 접속 초과 | 1013 | `Max connections exceeded` |

Phase 2 대비 추가: `Session not found` (1011)

## 의존성

Phase 2와 동일:

| 패키지 | 용도 |
|---|---|
| `ws` | WebSocket 서버 |
| `node-pty` | tmux attach 프로세스 관리 |
| `nanoid` | 세션 ID 생성 |
