# API 연동

## 개요

기존 `/api/timeline` WebSocket에 resume 관련 메시지 타입을 추가한다.

## WebSocket 메시지 (신규)

### 클라이언트 → 서버

**timeline:resume**

세션 resume을 요청한다.

```json
{
  "type": "timeline:resume",
  "sessionId": "5b92121e-a3f4-4b1a-9c2d-1234567890ab",
  "tmuxSession": "pt-ws1-tab1"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| sessionId | string | resume할 세션 ID |
| tmuxSession | string | 명령어를 전송할 tmux 세션 이름 |

### 서버 → 클라이언트

**timeline:resume-started**

resume 명령어 전송 성공. 클라이언트는 이후 subscribe를 전송하여 타임라인을 구독한다.

```json
{
  "type": "timeline:resume-started",
  "sessionId": "5b92121e-a3f4-4b1a-9c2d-1234567890ab",
  "jsonlPath": "/Users/subicura/.claude/projects/-Users-subicura-project/5b92121e.jsonl"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| sessionId | string | resume된 세션 ID |
| jsonlPath | string | 세션 JSONL 파일 경로 (subscribe에 사용) |

**timeline:resume-blocked**

터미널에 다른 프로세스가 실행 중이라 resume할 수 없음.

```json
{
  "type": "timeline:resume-blocked",
  "reason": "process-running",
  "processName": "node"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| reason | string | 차단 사유 (`process-running`) |
| processName | string? | 현재 실행 중인 프로세스 이름 |

**timeline:resume-error**

resume 과정에서 서버 에러 발생.

```json
{
  "type": "timeline:resume-error",
  "message": "tmux send-keys failed: session not found"
}
```

## 서버 내부 처리

### src/lib/timeline-server.ts 확장

기존 `handleTimelineConnection` 핸들러에 resume 메시지 처리를 추가한다.

```typescript
// resume 메시지 핸들러
const handleResumeMessage: (
  ws: WebSocket,
  payload: { sessionId: string; tmuxSession: string }
) => Promise<void>

// tmux 포그라운드 프로세스 확인
const checkTerminalProcess: (tmuxSession: string) => Promise<{
  isSafe: boolean;
  processName: string;
}>

// tmux send-keys 실행
const sendKeysToTmux: (tmuxSession: string, command: string) => Promise<void>
```

### resume 처리 순서

```
1. checkTerminalProcess(tmuxSession)
   └── tmux list-panes -t {session} -F "#{pane_current_command}"
2. isSafe === false → ws.send(timeline:resume-blocked)
3. isSafe === true:
   a. sendKeysToTmux(tmuxSession, `claude --resume ${sessionId}`)
   b. layout.json에 claudeSessionId 저장 (session-persistence 모듈 호출)
   c. sessionId → JSONL 파일 경로 매핑
   d. ws.send(timeline:resume-started)
```

## 기존 메시지와의 관계

| 기존 메시지 | 역할 | resume과의 관계 |
|---|---|---|
| timeline:subscribe | JSONL 파일 감시 시작 | resume-started 수신 후 클라이언트가 전송 |
| timeline:init | 초기 타임라인 데이터 | subscribe 후 서버가 전송 |
| timeline:append | 실시간 업데이트 | Claude Code 실행 후 자동 |
| timeline:session-changed | 세션 전환 | resume과 무관, 새 세션 시작 시 |

## 에러 처리

| 에러 | 처리 |
|---|---|
| tmux 세션 없음 | resume-error { message } |
| tmux send-keys 실패 | resume-error { message } |
| JSONL 경로 매핑 실패 | resume-started 전송, jsonlPath는 null (이후 session-detection이 처리) |
| WebSocket 연결 끊김 | 메시지 유실, 클라이언트 재연결 후 상태 재확인 |
