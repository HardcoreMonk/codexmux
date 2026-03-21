# API 연동

## 개요

cli-state-detection은 별도 API 엔드포인트를 추가하지 않는다. 기존 타임라인 WebSocket 메시지와 세션 상태 API를 활용하여 클라이언트 측에서 CLI 상태를 계산한다.

## 사용 API (기존)

| API | 용도 |
|---|---|
| GET /api/timeline/session | 초기 sessionStatus 확인 (active/inactive/none) |
| ws://api/timeline → timeline:init | 초기 엔트리 로드 → 초기 cliState 계산 |
| ws://api/timeline → timeline:append | 새 엔트리 → cliState 갱신 |
| ws://api/timeline → timeline:session-changed | 세션 전환 → cliState 리셋 |

## 클라이언트 훅

### useTimeline 확장

기존 `useTimeline` 훅에 `cliState` 파생 상태를 추가한다.

```typescript
type TCliState = 'idle' | 'busy' | 'inactive';

// useTimeline 반환값에 추가
interface IUseTimelineReturn {
  // ... 기존 필드
  cliState: TCliState;
}
```

### 상태 계산 함수

```typescript
const deriveCliState = (
  sessionStatus: TSessionStatus,
  entries: ITimelineEntry[]
): TCliState => {
  // 세션 비활성이면 무조건 inactive
  if (sessionStatus === 'inactive' || sessionStatus === 'none') {
    return 'inactive';
  }

  // 엔트리가 없으면 idle (새 세션)
  if (entries.length === 0) {
    return 'idle';
  }

  // 마지막 엔트리 타입으로 판단
  const lastEntry = entries[entries.length - 1];
  if (lastEntry.type === 'assistant-message') {
    return 'idle';
  }

  return 'busy';
};
```

### 갱신 시점

| 트리거 | 동작 |
|---|---|
| `timeline:init` 수신 | `deriveCliState(sessionStatus, entries)` |
| `timeline:append` 수신 | `deriveCliState(sessionStatus, [...entries, ...newEntries])` |
| `timeline:session-changed` 수신 | `deriveCliState(sessionStatus, [])` → `idle` |
| sessionStatus 변경 | `deriveCliState(newStatus, entries)` |

## 타입 정의

### src/types/timeline.ts 확장

```typescript
// 기존 타입에 추가
type TCliState = 'idle' | 'busy' | 'inactive';
```

## 파일 구조

```
src/
├── hooks/
│   └── use-timeline.ts      ← 기존 수정: cliState 파생 상태 추가
└── types/
    └── timeline.ts           ← 기존 수정: TCliState 타입 추가
```

변경이 필요한 파일은 2개뿐 — 기존 훅에 파생 상태 하나를 추가하는 최소 변경.
