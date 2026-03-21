# API 연동

## 개요

Quick Prompts 전송은 서버 API 없이 클라이언트에서 직접 PTY write한다. 서버 API는 설정 CRUD(quick-prompts.json 읽기/쓰기)만 담당한다.

## 전송 (서버 API 없음)

기존 Web 입력창의 PTY write 경로를 재활용한다.

```typescript
// 버튼 클릭 핸들러
const handleQuickPrompt = (prompt: string) => {
  const data = encodeStdin(prompt + '\r');
  terminalWrite(data);
};
```

- `encodeStdin`: 기존 `terminal-protocol.ts`
- `terminalWrite`: 기존 터미널 WebSocket write 함수 (useWebInput에서 공유)

## REST API (설정 CRUD)

### GET /api/quick-prompts

Quick Prompts 목록을 조회한다.

#### 응답 (200)

```json
[
  { "id": "builtin-commit", "name": "커밋하기", "prompt": "/commit-commands:commit", "enabled": true },
  { "id": "custom-1", "name": "코드 리뷰", "prompt": "현재 변경사항을 리뷰해주세요.", "enabled": true }
]
```

- 파일 없으면 빌트인 기본값 반환
- 파일 파싱 실패 시에도 빌트인 기본값 반환

### PUT /api/quick-prompts

Quick Prompts 목록 전체를 저장한다.

#### 요청

```json
[
  { "id": "builtin-commit", "name": "커밋하기", "prompt": "/commit-commands:commit", "enabled": true },
  { "id": "custom-1", "name": "코드 리뷰", "prompt": "현재 변경사항을 리뷰해주세요.", "enabled": false }
]
```

#### 응답 (200)

```json
{ "success": true }
```

- `~/.purple-terminal/quick-prompts.json`에 저장
- 디렉토리 없으면 자동 생성

## 클라이언트 훅

### useQuickPrompts

Quick Prompts 목록 관리와 전송을 담당하는 훅.

```typescript
interface IQuickPrompt {
  id: string;
  name: string;
  prompt: string;
  enabled: boolean;
}

interface IUseQuickPromptsReturn {
  prompts: IQuickPrompt[];          // enabled 필터 적용된 목록 (suggestion용)
  allPrompts: IQuickPrompt[];       // 전체 목록 (설정용)
  isLoading: boolean;
  execute: (id: string) => void;    // PTY 전송
  save: (prompts: IQuickPrompt[]) => Promise<void>;  // 설정 저장
}

const useQuickPrompts: (
  cliState: TCliState,
  terminalWrite: (data: Uint8Array) => void
) => IUseQuickPromptsReturn
```

내부 동작:

- 마운트 시 `GET /api/quick-prompts` 호출
- `prompts`: `allPrompts.filter(p => p.enabled)` (suggestion 바에 표시할 목록)
- `execute(id)`:
  1. `cliState !== 'idle'` → 무시
  2. 해당 prompt 문자열을 입력창 value에 설정 (useWebInput의 setValue 호출)
  3. 입력창에 포커스 이동
- `save(prompts)`: `PUT /api/quick-prompts` → 로컬 상태 즉시 갱신

## 컴포넌트 구조

```
ClaudeCodePanel
├── TimelineView
├── QuickPromptBar (신규)
│   └── QuickPromptButton[] (pill 버튼)
├── WebInputBar
└── TerminalContainer

설정 페이지/모달
└── QuickPromptsSettings (신규)
    ├── QuickPromptItem[] (이름 + prompt + 토글 + 수정/삭제)
    ├── AddPromptForm (추가/수정 폼)
    └── ResetButton (기본값 초기화)
```

## 파일 구조

```
src/
├── components/features/terminal/
│   ├── claude-code-panel.tsx         ← 기존 수정: QuickPromptBar 삽입
│   └── quick-prompt-bar.tsx          ← 신규: suggestion 바
├── components/features/settings/
│   └── quick-prompts-settings.tsx    ← 신규: 설정 UI
├── hooks/
│   └── use-quick-prompts.ts          ← 신규: 목록 관리 + 전송
├── lib/
│   └── quick-prompts-store.ts        ← 신규: 서버 측 JSON 읽기/쓰기
└── pages/api/
    └── quick-prompts.ts              ← 신규: GET/PUT 핸들러
```

## 에러 처리

| 에러 | 처리 |
|---|---|
| quick-prompts.json 없음 | 빌트인 기본값 반환 |
| JSON 파싱 실패 | 빌트인 기본값으로 폴백, console.warn |
| PUT 저장 실패 | sonner 토스트 에러 "설정을 저장할 수 없습니다" |
| busy 상태에서 클릭 | 무시 (pointer-events-none으로 이미 차단) |
