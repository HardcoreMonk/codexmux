# API 연동

> 이 문서는 terminal-api의 서버 구현 관점에서의 API 스펙을 정의한다. 클라이언트 관점의 연동은 `web-terminal/detail/api.md` 참조.

## API Route 설정

### 파일 위치

`src/pages/api/terminal.ts`

### Next.js API Route 설정

```typescript
export const config = {
  api: {
    bodyParser: false, // WebSocket 업그레이드와 충돌 방지
  },
};
```

### HTTP 응답

| 요청 | 응답 | 설명 |
| --- | --- | --- |
| WebSocket Upgrade | 101 Switching Protocols | 정상 업그레이드 |
| 일반 HTTP GET | 426 Upgrade Required | WebSocket이 아닌 요청 |
| POST, PUT 등 | 405 Method Not Allowed | 미지원 메서드 |

## WebSocket 서버 구현

### 싱글턴 관리

```typescript
// HMR 시 중복 생성 방지
const getWsServer = (httpServer: any): WebSocketServer => {
  if (!(globalThis as any).__wsServer) {
    (globalThis as any).__wsServer = new WebSocketServer({ noServer: true });
  }
  return (globalThis as any).__wsServer;
};
```

- `noServer: true`: HTTP 서버에 바인딩하지 않고, 수동으로 upgrade 이벤트 처리
- `globalThis`에 저장하여 HMR 시에도 단일 인스턴스 보장

### Upgrade 처리

```typescript
// res.socket.server에서 HTTP 서버 인스턴스 접근
const server = res.socket.server;
const wss = getWsServer(server);

// upgrade 이벤트 핸들러 등록 (중복 방지)
if (!server.__upgradeRegistered) {
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/api/terminal') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });
  server.__upgradeRegistered = true;
}
```

## PTY 관리

### PTY 생성

| 옵션 | 값 | 설명 |
| --- | --- | --- |
| `file` | `process.env.SHELL \|\| '/bin/zsh'` | 사용자 기본 쉘 |
| `args` | `[]` | 쉘 인자 없음 |
| `cwd` | `process.env.HOME` | 홈 디렉토리에서 시작 |
| `cols` | `80` (초기값) | 클라이언트 리사이즈 메시지로 갱신 |
| `rows` | `24` (초기값) | 클라이언트 리사이즈 메시지로 갱신 |
| `env` | `{ ...process.env, TERM: 'xterm-256color' }` | 256색 지원 |

### PTY 인터페이스

| 메서드/이벤트 | 용도 |
| --- | --- |
| `pty.write(data)` | stdin에 데이터 쓰기 |
| `pty.resize(cols, rows)` | 터미널 크기 변경 |
| `pty.kill()` | 프로세스 종료 |
| `pty.onData(callback)` | stdout 데이터 수신 |
| `pty.onExit(callback)` | 프로세스 종료 이벤트 |
| `pty.pause()` | stdout 읽기 일시 중단 |
| `pty.resume()` | stdout 읽기 재개 |

## 연결 관리

### 활성 연결 추적

```typescript
interface IActiveConnection {
  ws: WebSocket;
  pty: IPty;
  heartbeatTimer: NodeJS.Timeout;
  cleaned: boolean;
}

// Map<WebSocket, IActiveConnection>
const connections = new Map();
```

### 연결 수 제한

| 설정 | 값 | 설명 |
| --- | --- | --- |
| `MAX_CONNECTIONS` | `10` | 최대 동시 PTY 수 |

- 새 연결 요청 시 `connections.size >= MAX_CONNECTIONS` 체크
- 초과 시 WebSocket close (1013, "Max connections exceeded")

### 하트비트

| 설정 | 값 |
| --- | --- |
| 전송 간격 | 30초 |
| 타임아웃 | 90초 (3회 미수신) |

- 서버는 클라이언트 하트비트(0x03) 수신 시 `lastHeartbeat` 타임스탬프 갱신
- 30초 간격 체크: `Date.now() - lastHeartbeat > 90_000` → 연결 종료

## 리소스 정리

### cleanup 함수

모든 종료 경로에서 호출되는 단일 정리 함수:

```typescript
const cleanup = (connection: IActiveConnection) => {
  if (connection.cleaned) return; // 멱등성
  connection.cleaned = true;

  clearInterval(connection.heartbeatTimer);

  if (connection.pty) {
    connection.pty.kill();
  }

  if (connection.ws.readyState === WebSocket.OPEN) {
    connection.ws.close();
  }

  connections.delete(connection.ws);
};
```

### 서버 셧다운

```typescript
const gracefulShutdown = () => {
  connections.forEach((conn) => {
    conn.ws.close(1001, 'Server shutting down');
    cleanup(conn);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

## 에러 코드 정리

| 상황 | WebSocket 코드 | reason | HTTP (비WS) |
| --- | --- | --- | --- |
| PTY 정상 종료 | 1000 | `PTY exited` | — |
| 서버 셧다운 | 1001 | `Server shutting down` | — |
| 하트비트 타임아웃 | 1001 | `Heartbeat timeout` | — |
| PTY 생성 실패 | 1011 | `PTY spawn failed` | — |
| 동시 접속 초과 | 1013 | `Max connections exceeded` | — |
| 일반 HTTP 요청 | — | — | 426 |
| 미지원 메서드 | — | — | 405 |

## 의존성

| 패키지 | 버전 | 용도 |
| --- | --- | --- |
| `ws` | latest | WebSocket 서버 |
| `node-pty` | latest | PTY 프로세스 생성 |

### node-pty 빌드 요구사항

- Node.js
- node-gyp
- Python 3
- C++ 컴파일러 (macOS: Xcode Command Line Tools)
