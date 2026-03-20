# API 연동

## 개요

Claude Code Panel은 세션 정보 REST API와 타임라인 WebSocket을 사용한다. 터미널 WebSocket은 기존 `/api/terminal` 그대로 사용한다.

## API 호출 흐름

```
ClaudeCodePanel 마운트
├── GET /api/timeline/session → 세션 정보
├── ws://api/timeline → 타임라인 WebSocket
└── ws://api/terminal → 터미널 WebSocket (기존)
```

## 사용하는 API

### GET /api/timeline/session (session-detection)

Panel 마운트 시 활성 세션 정보를 가져온다.

```
GET /api/timeline/session?workspace={workspaceId}
→ { status, sessionId, jsonlPath }
```

- status 기반 UI 분기 (active/inactive/none/not-installed)
- active/inactive → 타임라인 WebSocket 연결

### ws://api/timeline (realtime-watch)

타임라인 실시간 데이터를 수신한다.

```
연결: ws://localhost:{port}/api/timeline?session={sessionName}&workspace={wsId}

수신:
  timeline:init → 전체 타임라인 데이터
  timeline:append → 새 엔트리
  timeline:session-changed → 세션 전환

송신:
  timeline:subscribe → 특정 파일 감시 시작
  timeline:unsubscribe → 감시 중지
```

### ws://api/terminal (기존)

축소 터미널 영역의 입출력을 처리한다. 기존 바이너리 프로토콜 그대로 사용.

```
연결: ws://localhost:{port}/api/terminal?session={sessionName}&clientId={clientId}
프로토콜: 바이너리 (0x00~0x04)
```

### GET /api/timeline/entries (보조)

대용량 세션에서 이전 데이터를 페이지네이션 로드한다.

```
GET /api/timeline/entries?jsonlPath={path}&offset={offset}&limit=200
→ { entries, total, hasMore }
```

- 타임라인 상단으로 스크롤 시 호출 (역방향 무한 스크롤)
- 초기 로드에서 전체 전송이 아닌 경우에만 사용

## 클라이언트 훅

### useTimelineWebSocket (신규)

```typescript
interface IUseTimelineWebSocketOptions {
  sessionName: string;
  workspaceId: string;
  enabled: boolean;
  onInit: (entries: ITimelineEntry[]) => void;
  onAppend: (entries: ITimelineEntry[]) => void;
  onSessionChanged: (newSessionId: string) => void;
  onError: (error: { code: string; message: string }) => void;
}

interface IUseTimelineWebSocketReturn {
  status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  subscribe: (jsonlPath: string) => void;
  unsubscribe: () => void;
}
```

- `enabled: false` → WebSocket 연결하지 않음 (terminal 모드)
- 재연결: 지수 백오프 (1s, 2s, 4s, 8s, 16s), 최대 5회
- heartbeat: 30초 간격 ping/pong

### useTimeline (신규)

```typescript
interface IUseTimelineReturn {
  entries: ITimelineEntry[];
  status: TSessionStatus;
  wsStatus: TConnectionStatus;
  isAutoScrollEnabled: boolean;
  toggleAutoScroll: (enabled: boolean) => void;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}
```

- 타임라인 엔트리 상태 관리
- 자동 스크롤 상태 관리
- 이전 데이터 페이지네이션 로드

## 컴포넌트 구조

```
ClaudeCodePanel
├── useTimeline()          ← 타임라인 상태 관리
├── useTimelineWebSocket() ← 타임라인 WebSocket
├── TimelineView           ← 상단 타임라인 (가상 스크롤)
│   ├── UserMessageItem
│   ├── AssistantMessageItem (react-markdown)
│   ├── ToolCallItem (요약 + diff 토글)
│   ├── AgentGroupItem (접힌 그룹)
│   └── ScrollToBottomButton (플로팅)
└── TerminalView           ← 하단 축소 터미널
    └── TerminalContainer (기존, scale 0.5)
```

## 에러 처리

| 에러 | 처리 |
|---|---|
| GET /api/timeline/session 실패 | 빈 상태 UI + 재시도 버튼 |
| 타임라인 WebSocket 연결 실패 | 재연결 배너 표시 |
| 타임라인 WebSocket 데이터 파싱 에러 | 해당 메시지 무시 |
| 터미널 WebSocket 연결 실패 | 기존 터미널 에러 처리 로직 |

## 파일 구조

```
src/
├── components/features/timeline/
│   ├── claude-code-panel.tsx       ← 메인 컴포넌트
│   ├── timeline-view.tsx           ← 타임라인 가상 스크롤 컨테이너
│   ├── user-message-item.tsx       ← 사용자 메시지
│   ├── assistant-message-item.tsx  ← 어시스턴트 응답 (마크다운)
│   ├── tool-call-item.tsx          ← 도구 호출 + diff 토글
│   ├── agent-group-item.tsx        ← 서브에이전트 그룹
│   └── scroll-to-bottom-button.tsx ← 플로팅 버튼
├── hooks/
│   ├── use-timeline.ts             ← 타임라인 상태 관리
│   └── use-timeline-websocket.ts   ← 타임라인 WebSocket
└── types/
    └── timeline.ts                 ← ITimelineEntry 타입
```
