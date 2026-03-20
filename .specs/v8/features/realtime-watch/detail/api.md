# API 연동

## 개요

실시간 세션 감시를 위한 전용 WebSocket 엔드포인트와 서버 내부 모듈을 정의한다.

## WebSocket 엔드포인트

### ws://localhost:{port}/api/timeline

기존 `/api/terminal` WebSocket과 분리된 전용 엔드포인트.

#### 연결

```
ws://localhost:{port}/api/timeline?session={sessionName}&workspace={workspaceId}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| session | string | O | tmux 세션 이름 (탭의 sessionName) |
| workspace | string | O | Workspace ID |

#### 서버 → 클라이언트 메시지

**timeline:init**

```json
{
  "type": "timeline:init",
  "entries": [
    { "type": "user-message", "uuid": "...", "timestamp": "...", "text": "..." },
    { "type": "tool-call", "uuid": "...", "timestamp": "...", "toolName": "Edit", "summary": "..." },
    ...
  ],
  "sessionId": "5b92121e-...",
  "totalEntries": 42
}
```

**timeline:append**

```json
{
  "type": "timeline:append",
  "entries": [
    { "type": "assistant-message", "uuid": "...", "timestamp": "...", "markdown": "..." }
  ]
}
```

**timeline:session-changed**

```json
{
  "type": "timeline:session-changed",
  "newSessionId": "abc12345-...",
  "reason": "new-session-started"
}
```

**timeline:error**

```json
{
  "type": "timeline:error",
  "code": "parse-error",
  "message": "JSONL 파싱 중 오류 발생"
}
```

#### 클라이언트 → 서버 메시지

**timeline:subscribe**

```json
{
  "type": "timeline:subscribe",
  "jsonlPath": "/Users/subicura/.claude/projects/.../.jsonl"
}
```

**timeline:unsubscribe**

```json
{
  "type": "timeline:unsubscribe"
}
```

## server.ts 변경

### upgrade 핸들러 확장

```
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, ...);

  if (url.pathname === '/api/terminal') {
    // 기존 터미널 WebSocket 처리
  } else if (url.pathname === '/api/timeline') {
    // 신규 타임라인 WebSocket 처리
    timelineWss.handleUpgrade(request, socket, head, (ws) => {
      timelineWss.emit('connection', ws, request);
    });
  } else {
    upgrade(request, socket, head);  // Next.js
  }
});
```

- `timelineWss`: 타임라인 전용 WebSocketServer 인스턴스
- 기존 `wss` (터미널)와 독립적으로 운영

## 내부 모듈 인터페이스

### src/lib/timeline-server.ts

```typescript
// WebSocket 연결 핸들러
const handleTimelineConnection: (ws: WebSocket, request: IncomingMessage) => void

// fs.watch 관리
const watchSessionFile: (jsonlPath: string, onUpdate: (entries: ITimelineEntry[]) => void) => IWatcher

// watcher 해제
const unwatchSessionFile: (jsonlPath: string, clientId: string) => void

// 연결 정리
const timelineGracefulShutdown: () => void

interface IWatcher {
  path: string;
  watcher: fs.FSWatcher;
  clients: Set<string>;
  lastOffset: number;
  pendingBuffer: string;
}
```

## 연결 관리

| 지표 | 값 |
|---|---|
| 최대 동시 타임라인 연결 | 30 |
| 최대 동시 감시 파일 | 10 |
| heartbeat 간격 | 30초 |
| heartbeat 타임아웃 | 90초 |
| 메시지 형식 | JSON (텍스트) |

## REST API (보조)

### GET /api/timeline/entries

대용량 세션의 이전 데이터를 페이지네이션으로 로드한다.

#### 요청

```
GET /api/timeline/entries?jsonlPath={path}&offset={offset}&limit={limit}
```

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| jsonlPath | string | - | JSONL 파일 경로 |
| offset | number | 0 | 시작 엔트리 인덱스 |
| limit | number | 200 | 최대 반환 수 |

#### 응답

```json
{
  "entries": [...],
  "total": 500,
  "hasMore": true
}
```

## 에러 처리

| 에러 | 처리 |
|---|---|
| WebSocket 연결 초과 | 1013 코드로 거부 |
| jsonlPath 미존재 | timeline:error 전송 |
| fs.watch 실패 | 자동 재등록 (최대 3회) |
| 파싱 에러 | timeline:error 전송 + 해당 줄 무시 |

## 파일 구조

```
src/
├── lib/
│   └── timeline-server.ts       ← WebSocket 핸들러 + fs.watch 관리
└── pages/api/
    └── timeline/
        ├── session.ts           ← GET /api/timeline/session (session-detection)
        └── entries.ts           ← GET /api/timeline/entries (페이지네이션)
```
