# API 연동

## 개요

세션 목록 조회를 위한 REST API 엔드포인트를 정의한다.

## REST API

### GET /api/timeline/sessions

프로젝트별 과거 Claude Code 세션 목록을 반환한다.

#### 요청

```
GET /api/timeline/sessions?tmuxSession={name}&limit={n}&offset={n}
```

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| tmuxSession | string | O | - | tmux 세션 이름 (서버에서 cwd 조회에 사용) |
| limit | number | X | 50 | 최대 반환 건수 |
| offset | number | X | 0 | 시작 인덱스 |

#### 성공 응답 (200)

```json
{
  "sessions": [
    {
      "sessionId": "5b92121e-a3f4-4b1a-9c2d-1234567890ab",
      "startedAt": "2026-03-21T14:30:00.000Z",
      "lastActivityAt": "2026-03-21T16:45:00.000Z",
      "firstMessage": "버그 수정해줘",
      "turnCount": 12
    },
    {
      "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "startedAt": "2026-03-21T10:15:00.000Z",
      "lastActivityAt": "2026-03-21T12:30:00.000Z",
      "firstMessage": "테스트 추가해줘",
      "turnCount": 8
    }
  ],
  "total": 25,
  "hasMore": false
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| sessions | ISessionMeta[] | 세션 메타정보 배열 (lastActivityAt 내림차순) |
| total | number | 전체 세션 수 |
| hasMore | boolean | 추가 페이지 존재 여부 |

#### 에러 응답

| 상태 | 코드 | 조건 |
|---|---|---|
| 400 | `missing-param` | tmuxSession 파라미터 누락 |
| 404 | `tmux-session-not-found` | tmux 세션이 존재하지 않음 |
| 500 | `cwd-lookup-failed` | tmux에서 cwd 조회 실패 |
| 500 | `internal-error` | 서버 내부 오류 |

```json
{
  "error": "tmux-session-not-found",
  "message": "tmux session 'pt-ws1-tab1' not found"
}
```

## 내부 모듈 인터페이스

### src/lib/session-list.ts

```typescript
interface ISessionMeta {
  sessionId: string;
  startedAt: string;       // ISO 8601
  lastActivityAt: string;  // ISO 8601
  firstMessage: string;
  turnCount: number;
}

// tmux 세션의 cwd에서 프로젝트별 세션 목록 조회
const listSessions: (tmuxSession: string) => Promise<ISessionMeta[]>

// 단일 세션 파일에서 메타정보 경량 파싱
const parseSessionMeta: (jsonlPath: string) => Promise<ISessionMeta | null>

// cwd → Claude 프로젝트 디렉토리 경로 변환
const cwdToProjectPath: (cwd: string) => string
```

### src/lib/session-meta-cache.ts

```typescript
interface IMetaCache {
  get: (sessionId: string) => ISessionMeta | undefined;
  set: (sessionId: string, meta: ISessionMeta, mtime: number) => void;
  isStale: (sessionId: string, currentMtime: number) => boolean;
  clear: () => void;
}

// TTL 30초, mtime 변경 시 자동 무효화
const createMetaCache: () => IMetaCache
```

## 파일 구조

```
src/
├── lib/
│   ├── session-list.ts         ← 세션 목록 조회 + 메타 파싱
│   └── session-meta-cache.ts   ← 메타정보 단기 캐시
└── pages/api/
    └── timeline/
        ├── session.ts          ← (기존) GET /api/timeline/session
        ├── sessions.ts         ← (신규) GET /api/timeline/sessions
        └── entries.ts          ← (기존) GET /api/timeline/entries
```

## 에러 처리

| 에러 | 처리 |
|---|---|
| tmux 세션 없음 | 404 응답, 클라이언트에서 에러 UI 표시 |
| Claude 프로젝트 경로 없음 | 200 빈 배열 (에러 아님) |
| 개별 파일 파싱 실패 | 건너뜀, 나머지 정상 반환 |
| fs.readdir 실패 | 500 응답 |
