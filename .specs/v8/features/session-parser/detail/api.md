# API 연동

## 개요

세션 파일 파싱 엔진은 서버 내부 모듈로, REST API 엔드포인트를 노출하지 않는다. realtime-watch와 session-detection에서 내부적으로 호출한다.

## 내부 모듈 인터페이스

### src/lib/session-parser.ts

```typescript
// Zod 스키마
const BaseEntrySchema: z.ZodSchema
const AssistantEntrySchema: z.ZodSchema
const UserEntrySchema: z.ZodSchema
const ToolUseContentSchema: z.ZodSchema
const ToolResultContentSchema: z.ZodSchema

// 전체 파싱
const parseSessionFile: (filePath: string) => Promise<IParseResult>

// 증분 파싱
const parseIncremental: (
  filePath: string,
  fromOffset: number,
  pendingBuffer: string,
) => Promise<IIncrementalResult>

// 도구 호출 요약 생성
const summarizeToolCall: (name: string, input: Record<string, unknown>) => string

// 도구 결과 요약 생성
const summarizeToolResult: (content: string | unknown[], isError: boolean) => string
```

### 반환 타입

```typescript
interface IParseResult {
  entries: ITimelineEntry[];
  lastOffset: number;
  totalLines: number;
  errorCount: number;
}

interface IIncrementalResult {
  newEntries: ITimelineEntry[];
  newOffset: number;
  pendingBuffer: string;
}
```

## 호출 흐름

| 호출자 | 함수 | 용도 |
|---|---|---|
| realtime-watch (timeline WebSocket init) | `parseSessionFile()` | 초기 연결 시 전체 파싱 |
| realtime-watch (fs.watch 콜백) | `parseIncremental()` | 파일 변경 시 증분 파싱 |
| session-detection | 없음 (파일 경로만 제공) | - |

## Zod 스키마 상세

### BaseEntrySchema

```typescript
z.object({
  uuid: z.string().uuid(),
  parentUuid: z.string().uuid().nullable().optional(),
  timestamp: z.string().datetime(),
  sessionId: z.string(),
  cwd: z.string(),
  isSidechain: z.boolean(),
  type: z.string(),
  userType: z.literal('external').optional(),
  version: z.string().optional(),
  gitBranch: z.string().optional(),
})
```

### AssistantEntrySchema

```typescript
BaseEntrySchema.extend({
  type: z.literal('assistant'),
  message: z.object({
    role: z.literal('assistant'),
    model: z.string().optional(),
    content: z.array(z.union([
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({ type: z.literal('tool_use'), id: z.string(), name: z.string(), input: z.record(z.unknown()) }),
      z.object({ type: z.literal('thinking'), thinking: z.string() }),
    ])),
    stop_reason: z.string().nullable().optional(),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    }).passthrough().optional(),
  }),
})
```

### UserEntrySchema

```typescript
BaseEntrySchema.extend({
  type: z.literal('user'),
  message: z.object({
    role: z.literal('user'),
    content: z.union([
      z.string(),
      z.array(z.union([
        z.object({ type: z.literal('text'), text: z.string() }),
        z.object({ type: z.literal('tool_result'), tool_use_id: z.string(), content: z.unknown(), is_error: z.boolean().optional() }),
        z.object({ type: z.literal('image'), source: z.object({ type: z.literal('base64'), media_type: z.string(), data: z.string() }) }),
      ])),
    ]),
  }),
})
```

## 에러 처리

| 에러 | 처리 |
|---|---|
| 파일 읽기 실패 | 빈 결과 반환 + 에러 로그 |
| JSON.parse 실패 (단일 줄) | 해당 줄 무시, errorCount 증가 |
| Zod 검증 실패 | 해당 엔트리 무시, errorCount 증가 |
| 파일 크기 초과 (1MB+) | tail 모드 전환 (마지막 N 엔트리만) |

## 성능 사양

| 지표 | 목표 |
|---|---|
| 1MB 파일 전체 파싱 | 100ms 이내 |
| 증분 파싱 (10줄) | 5ms 이내 |
| 메모리: 파싱 중 | 파일 크기 × 2 이내 |
| 메모리: 파싱 후 | 캐싱하지 않음 (즉시 GC 대상) |
