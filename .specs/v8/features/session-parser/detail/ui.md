# 화면 구성

## 개요

세션 파일 파싱 엔진은 서버 측 모듈이므로 UI 요소가 없다. 파싱 결과로 생성되는 타임라인 엔트리 타입과 클라이언트 데이터 구조를 정의한다.

## 타임라인 엔트리 타입

파싱 엔진이 JSONL 엔트리를 변환하여 클라이언트에 전달하는 구조:

```
ITimelineEntry (union)
├── ITimelineUserMessage     — 사용자 입력 메시지
├── ITimelineAssistantMessage — Claude 텍스트 응답 (마크다운)
├── ITimelineToolCall        — 도구 호출 (요약)
├── ITimelineToolResult      — 도구 결과 (요약 + 성공/실패)
└── ITimelineAgentGroup      — 서브에이전트 접힌 그룹
```

### ITimelineUserMessage

```
┌─ 사용자 메시지 ────────────────────────────┐
│ 🕐 14:30                                   │
│                                            │
│ 버그 수정해줘                                │
└────────────────────────────────────────────┘
```

| 필드 | 타입 | 설명 |
|---|---|---|
| type | `'user-message'` | 엔트리 타입 |
| uuid | string | 고유 ID |
| timestamp | string | ISO 8601 |
| text | string | 사용자 입력 텍스트 |

### ITimelineAssistantMessage

```
┌─ 어시스턴트 응답 ──────────────────────────┐
│ 🕐 14:32                                   │
│                                            │
│ 수정 완료했습니다. `src/main.ts`에서         │
│ 발생하던 null 참조 오류를...                  │
└────────────────────────────────────────────┘
```

| 필드 | 타입 | 설명 |
|---|---|---|
| type | `'assistant-message'` | 엔트리 타입 |
| uuid | string | 고유 ID |
| timestamp | string | ISO 8601 |
| markdown | string | 마크다운 원문 |

### ITimelineToolCall

```
┌─ 도구 호출 ────────────────────────────────┐
│ 🕐 14:31  ✅ Edit src/main.ts (+3, -1)    │
│           ▸ diff 보기                      │
└────────────────────────────────────────────┘
```

| 필드 | 타입 | 설명 |
|---|---|---|
| type | `'tool-call'` | 엔트리 타입 |
| uuid | string | 고유 ID |
| toolUseId | string | tool_use.id |
| timestamp | string | ISO 8601 |
| toolName | string | 도구 이름 (Read, Edit, Bash 등) |
| summary | string | 요약 한 줄 |
| diff | IDiffData \| null | Edit/Write 시 diff 데이터 |
| status | `'success'` \| `'error'` \| `'pending'` | 결과 상태 |

### ITimelineToolResult

| 필드 | 타입 | 설명 |
|---|---|---|
| type | `'tool-result'` | 엔트리 타입 |
| toolUseId | string | 매칭되는 tool_use.id |
| isError | boolean | 실패 여부 |
| summary | string | 결과 요약 |

### ITimelineAgentGroup

```
┌─ 서브에이전트 ──────────────────────────────┐
│ 🕐 14:31  ▸ Agent: Explore — 코드베이스 탐색 │
└────────────────────────────────────────────┘
```

| 필드 | 타입 | 설명 |
|---|---|---|
| type | `'agent-group'` | 엔트리 타입 |
| uuid | string | 고유 ID |
| timestamp | string | ISO 8601 |
| agentType | string | 에이전트 타입 (Explore, Code 등) |
| description | string | 에이전트 설명 |
| entryCount | number | 서브에이전트 엔트리 수 |

### IDiffData

| 필드 | 타입 | 설명 |
|---|---|---|
| filePath | string | 변경된 파일 경로 |
| oldString | string | 변경 전 텍스트 |
| newString | string | 변경 후 텍스트 |

## 도구별 요약 포맷

| 도구 | 요약 예시 | 아이콘 |
|---|---|---|
| Read | `Read src/lib/tmux.ts` | FileText |
| Edit | `Edit src/lib/tmux.ts (+3, -1)` | FilePen |
| Write | `Write src/types/terminal.ts` | FilePlus |
| Bash | `$ pnpm build → 12줄 출력` | Terminal |
| Grep | `Grep "panelType" → 5건` | Search |
| Glob | `Glob "**/*.ts" → 23건` | FolderSearch |
| 기타 | `{도구명} {첫 번째 input 필드}` | Wrench |

## 파일 구조

```
src/
├── lib/
│   └── session-parser.ts      ← 파싱 코어 + Zod 스키마
└── types/
    └── timeline.ts            ← ITimelineEntry 타입 정의
```
