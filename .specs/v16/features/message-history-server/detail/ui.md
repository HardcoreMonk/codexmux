# 화면 구성

## 개요

서버 전용 feature로 직접적인 UI는 없다. 이 문서는 저장소 데이터 구조와 파일 시스템 레이아웃을 정의한다.

## 파일 시스템 구조

```
~/.purple-terminal/
└── workspaces/
    └── {wsId}/
        ├── layout.json              ← 기존 레이아웃 데이터
        └── message-history.json     ← 신규: 메시지 히스토리
```

- `resolveLayoutDir(wsId)` 경로 재사용
- 워크스페이스 삭제 시 `fs.rm(recursive)`로 디렉토리 전체 삭제 → 히스토리 자동 정리

## 데이터 파일 구조

### message-history.json

```json
{
  "entries": [
    {
      "id": "abc123",
      "message": "이 함수를 리팩토링해줘",
      "sentAt": "2026-03-25T10:30:00.000Z"
    },
    {
      "id": "def456",
      "message": "테스트 코드 작성해줘\n유닛 테스트 위주로",
      "sentAt": "2026-03-25T10:25:00.000Z"
    }
  ]
}
```

- `entries`: MRU 순서 (배열 앞 = 가장 최근 사용)
- 최대 500개
- 파일 미존재 시 `{ entries: [] }`로 초기화

## 타입 정의 (`types/message-history.ts`)

```typescript
interface IMessageHistoryFile {
  entries: IHistoryEntry[];
}

interface IHistoryEntry {
  id: string;       // nanoid
  message: string;  // 전송 원문 (멀티라인 포함)
  sentAt: string;   // ISO 8601
}

// API 응답 타입
interface IMessageHistoryResponse {
  entries: IHistoryEntry[];
}

interface IMessageHistoryAddResponse {
  entry: IHistoryEntry;
}

interface IMessageHistoryDeleteResponse {
  success: boolean;
}
```

## 저장소 모듈 구조 (`lib/message-history-store.ts`)

```typescript
// Public API
const readMessageHistory = async (wsId: string): Promise<IHistoryEntry[]>
const addMessageHistory = async (wsId: string, message: string): Promise<IHistoryEntry>
const deleteMessageHistory = async (wsId: string, id: string): Promise<boolean>
```

| 함수 | 입력 | 출력 | 비고 |
|------|------|------|------|
| `readMessageHistory` | `wsId` | `IHistoryEntry[]` | 파일 없으면 빈 배열, 파싱 실패 시 빈 배열 |
| `addMessageHistory` | `wsId`, `message` | `IHistoryEntry` | 중복 제거 + MRU 삽입 + 500개 제한 |
| `deleteMessageHistory` | `wsId`, `id` | `boolean` | 항상 true (멱등성) |
