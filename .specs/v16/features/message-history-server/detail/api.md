# API 연동

## 개요

단일 API 라우트 `pages/api/message-history.ts`에서 GET/POST/DELETE를 method switching으로 처리한다. 저장소 로직은 `lib/message-history-store.ts`에 분리한다.

## REST API

### GET /api/message-history

히스토리 목록을 MRU 순서로 조회한다.

#### 요청

```
GET /api/message-history?wsId=workspace-abc
```

| 파라미터 | 위치 | 필수 | 설명 |
|----------|------|------|------|
| `wsId` | query | O | 워크스페이스 ID |

#### 응답 (200)

```json
{
  "entries": [
    {
      "id": "V1StGXR8_Z5jdHi6B-myT",
      "message": "이 함수를 리팩토링해줘",
      "sentAt": "2026-03-25T10:30:00.000Z"
    },
    {
      "id": "kM3q8R_xY2pWvNhL9-abC",
      "message": "테스트 코드 작성해줘\n유닛 테스트 위주로",
      "sentAt": "2026-03-25T10:25:00.000Z"
    }
  ]
}
```

#### 에러

| 상태 | 조건 | 응답 |
|------|------|------|
| 400 | `wsId` 누락 | `{ error: "wsId is required" }` |

#### 동작

- 파일 없음 → `{ entries: [] }` 반환
- 파싱 실패 → `{ entries: [] }` 반환 + `console.warn`

---

### POST /api/message-history

새 메시지를 히스토리에 추가한다. 중복 제거 + 500개 제한을 자동 적용한다.

#### 요청

```json
{
  "wsId": "workspace-abc",
  "message": "이 함수를 리팩토링해줘"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `wsId` | string | O | 워크스페이스 ID |
| `message` | string | O | 전송한 메시지 원문 |

#### 응답 (201)

```json
{
  "entry": {
    "id": "V1StGXR8_Z5jdHi6B-myT",
    "message": "이 함수를 리팩토링해줘",
    "sentAt": "2026-03-25T10:30:00.000Z"
  }
}
```

#### 에러

| 상태 | 조건 | 응답 |
|------|------|------|
| 400 | `wsId` 누락 | `{ error: "wsId is required" }` |
| 400 | `message` 누락 또는 공백만 | `{ error: "message is required" }` |
| 500 | 파일 쓰기 실패 | `{ error: "Failed to save" }` |

#### 비즈니스 로직

1. 슬래시 커맨드 필터링은 **클라이언트에서** 수행 (서버는 받은 메시지를 그대로 저장)
2. 동일 `message` 텍스트 존재 시 기존 항목 제거 후 최상단 삽입 (MRU)
3. 500개 초과 시 가장 오래된 항목 제거
4. `id`는 서버에서 `nanoid()`로 생성
5. `sentAt`은 서버에서 `new Date().toISOString()`으로 생성

---

### DELETE /api/message-history

개별 히스토리 항목을 삭제한다.

#### 요청

```json
{
  "wsId": "workspace-abc",
  "id": "V1StGXR8_Z5jdHi6B-myT"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `wsId` | string | O | 워크스페이스 ID |
| `id` | string | O | 삭제할 항목 ID |

#### 응답 (200)

```json
{
  "success": true
}
```

#### 에러

| 상태 | 조건 | 응답 |
|------|------|------|
| 400 | `wsId` 누락 | `{ error: "wsId is required" }` |
| 400 | `id` 누락 | `{ error: "id is required" }` |
| 500 | 파일 쓰기 실패 | `{ error: "Failed to save" }` |

#### 동작

- 존재하지 않는 `id` → `{ success: true }` (멱등성)

---

## 저장소 모듈 (`lib/message-history-store.ts`)

### 내부 구현 패턴

```typescript
// workspace-store.ts의 withLock 패턴 참고
// per-workspace lock으로 동시 쓰기 직렬화

const locks = new Map<string, Promise<void>>();

const withLock = async <T>(wsId: string, fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const prev = locks.get(wsId) ?? Promise.resolve();
  locks.set(wsId, next);
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    if (locks.get(wsId) === next) locks.delete(wsId);
  }
};
```

### 파일 경로

```typescript
const resolveHistoryPath = (wsId: string): string =>
  path.join(resolveLayoutDir(wsId), 'message-history.json');
```

### atomic write

```typescript
const writeHistoryFile = async (filePath: string, data: IMessageHistoryFile): Promise<void> => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = filePath + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, filePath);
};
```

## API 핸들러 구조

```typescript
// pages/api/message-history.ts
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  switch (req.method) {
    case 'GET': ...
    case 'POST': ...
    case 'DELETE': ...
    default: res.status(405).json({ error: 'Method not allowed' });
  }
};
```

## 파일 구조

```
src/
├── types/
│   └── message-history.ts        ← 신규: 공유 타입
├── lib/
│   └── message-history-store.ts   ← 신규: 저장소 (read/add/delete)
└── pages/api/
    └── message-history.ts         ← 신규: API 핸들러
```

## 에러 처리 요약

| 에러 상황 | 처리 |
|-----------|------|
| `message-history.json` 없음 | 빈 배열 반환 |
| JSON 파싱 실패 | 빈 배열 반환, `console.warn` |
| 디렉토리 없음 (첫 쓰기) | `mkdir({ recursive: true })` 후 생성 |
| 동시 쓰기 충돌 | per-workspace lock으로 직렬화 |
| 파일 쓰기 실패 | 500 응답, 에러 로깅 |
| 잘못된 HTTP method | 405 응답 |
