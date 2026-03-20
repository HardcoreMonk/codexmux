# API 연동

## 개요

세션 감지 결과를 클라이언트에 전달하기 위한 REST API와 내부 모듈 인터페이스를 정의한다.

## REST API

### GET /api/timeline/session

현재 Workspace의 활성 Claude Code 세션 정보를 반환한다.

#### 요청

```
GET /api/timeline/session?workspace={workspaceId}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| workspace | string | O | Workspace ID |

#### 응답 — 활성 세션 있음

```json
{
  "status": "active",
  "sessionId": "5b92121e-c047-446a-bf7a-a47fa6a37e00",
  "pid": 14666,
  "jsonlPath": "/Users/subicura/.claude/projects/-Users-subicura-Workspace-github-com-subicura-pt/5b92121e-c047-446a-bf7a-a47fa6a37e00.jsonl",
  "startedAt": 1774013877450
}
```

#### 응답 — 활성 세션 없음, 최근 세션 있음

```json
{
  "status": "inactive",
  "sessionId": "abc12345-...",
  "jsonlPath": "/Users/subicura/.claude/projects/.../.jsonl",
  "startedAt": null
}
```

#### 응답 — 세션 없음

```json
{
  "status": "none",
  "sessionId": null,
  "jsonlPath": null,
  "startedAt": null
}
```

#### 응답 — Claude Code 미설치

```json
{
  "status": "not-installed",
  "sessionId": null,
  "jsonlPath": null,
  "startedAt": null
}
```

## 내부 모듈 인터페이스

### src/lib/session-detection.ts

```typescript
type TSessionStatus = 'active' | 'inactive' | 'none' | 'not-installed';

interface ISessionInfo {
  status: TSessionStatus;
  sessionId: string | null;
  jsonlPath: string | null;
  pid: number | null;
  startedAt: number | null;
}

// 활성 세션 탐색
const detectActiveSession: (workspaceDir: string) => Promise<ISessionInfo>

// 프로젝트 디렉토리 → Claude 프로젝트 이름 변환
const toClaudeProjectName: (dirPath: string) => string

// PID 프로세스 실행 여부 확인
const isProcessRunning: (pid: number) => Promise<boolean>

// sessions 디렉토리 감시 시작
const watchSessionsDir: (
  workspaceDir: string,
  onNewSession: (info: ISessionInfo) => void,
) => fs.FSWatcher

// 세션 종료 폴링 시작
const startEndDetectionPolling: (
  pid: number,
  onEnd: () => void,
  intervalMs?: number,
) => NodeJS.Timeout
```

## 호출 흐름

```
클라이언트 (Claude Code Panel 마운트)
├── GET /api/timeline/session?workspace={wsId}
├── 응답 수신 → status 기반 UI 분기
│   ├── active → 타임라인 WebSocket 연결
│   ├── inactive → 정적 타임라인 표시
│   ├── none → 빈 상태 UI
│   └── not-installed → 미설치 안내
└── 타임라인 WebSocket 연결 시 jsonlPath 전달
```

## 에러 처리

| 에러 | HTTP 상태 | 응답 |
|---|---|---|
| workspace 미지정 | 400 | `{ error: "workspace parameter required" }` |
| workspace 미존재 | 404 | `{ error: "workspace not found" }` |
| 파일 시스템 에러 | 500 | `{ error: "session detection failed" }` |

## 파일 구조

```
src/
├── lib/
│   └── session-detection.ts      ← 세션 탐지 코어 로직
└── pages/api/
    └── timeline/
        └── session.ts            ← GET /api/timeline/session
```
