# API 연동

## 개요

session-persistence는 별도 API 엔드포인트를 추가하지 않는다. 기존 layout.json 저장 메커니즘과 서버 초기화 로직을 확장한다.

## Surface 타입 확장

### src/types/terminal.ts

```typescript
// 기존
interface ISurfaceTab {
  id: string;
  name: string;
  panelType: TPanelType;
  tmuxSession: string;
}

// v9 확장
interface ISurfaceTab {
  id: string;
  name: string;
  panelType: TPanelType;
  tmuxSession: string;
  claudeSessionId: string | null;  // 신규
}
```

## layout.json 저장/로드

### 저장

기존 `workspace-store.ts`의 저장 로직을 활용한다. `claudeSessionId`가 변경되면 기존 debounce 메커니즘으로 자동 저장.

```typescript
// 세션 ID 업데이트 함수
const updateClaudeSessionId: (
  workspaceId: string,
  tabId: string,
  sessionId: string | null
) => void
```

호출 시점:

| 이벤트 | sessionId 값 |
|---|---|
| claude 명령어 자동 감지 | PID 파일에서 추출한 sessionId |
| 수동 resume (timeline:resume-started) | 사용자가 선택한 sessionId |
| Panel 타입 → terminal 수동 전환 | null |

### 로드

서버 시작 시 layout.json에서 `claudeSessionId`를 읽는다. 필드가 없으면 `null`로 처리 (하위 호환).

```typescript
const tab = loadedTab as ISurfaceTab;
const claudeSessionId = tab.claudeSessionId ?? null;
```

## 서버 초기화 확장

### src/lib/auto-resume.ts

서버 시작 시 자동 resume을 처리하는 모듈.

```typescript
interface IAutoResumeTarget {
  workspaceId: string;
  tabId: string;
  tmuxSession: string;
  claudeSessionId: string;
}

// 자동 resume 대상 추출
const findAutoResumeTargets: () => IAutoResumeTarget[]

// 자동 resume 실행 (순차, 2초 간격)
const executeAutoResume: (targets: IAutoResumeTarget[]) => Promise<void>

// 단일 Surface resume
const resumeSingleSurface: (target: IAutoResumeTarget) => Promise<boolean>
```

### server.ts 초기화 흐름

```typescript
// 서버 시작 시
const startServer = async () => {
  // 1. 기존 초기화 (포트 바인딩, WebSocket 설정 등)
  // 2. layout.json 로드 (기존)
  // 3. tmux 세션 복원 (기존 Phase 2)
  // 4. 자동 resume (신규)
  const targets = findAutoResumeTargets();
  if (targets.length > 0) {
    executeAutoResume(targets);  // 비동기 실행, 서버 시작 블로킹하지 않음
  }
};
```

## 내부 유틸리티

### tmux 프로세스 확인

```typescript
// tmux 세션의 포그라운드 프로세스 조회
const getTmuxForegroundProcess: (tmuxSession: string) => Promise<string>
// 반환값: "bash", "zsh", "fish", "claude", "node" 등

// 셸 여부 판단
const isShellProcess: (processName: string) => boolean
// bash, zsh, fish, sh → true
```

### 세션 ID → JSONL 경로 매핑

```typescript
// sessionId와 cwd를 기반으로 JSONL 파일 경로 생성
const sessionIdToJsonlPath: (sessionId: string, cwd: string) => string | null
// cwd → 프로젝트 경로 변환 → ~/.claude/projects/{path}/{sessionId}.jsonl
// 파일 존재 확인 후 반환, 없으면 null
```

## 파일 구조

```
src/
├── lib/
│   ├── auto-resume.ts          ← 신규: 서버 시작 시 자동 resume
│   ├── workspace-store.ts      ← 기존 수정: claudeSessionId 저장/로드
│   └── timeline-server.ts      ← 기존 수정: resume 시 sessionId 저장 호출
├── types/
│   └── terminal.ts             ← 기존 수정: ISurfaceTab에 claudeSessionId 추가
└── server.ts                   ← 기존 수정: 초기화에 자동 resume 추가
```

## 에러 처리

| 에러 | 처리 |
|---|---|
| layout.json에 claudeSessionId 필드 없음 | null로 처리 (하위 호환) |
| tmux 세션 없음 | 새 세션 생성 후 resume 시도 |
| 셸 준비 전 send-keys | 1초 딜레이로 방지 |
| resume 타임아웃 (10초) | 세션 목록 뷰로 fallback |
| JSONL 파일 없음 | resume은 시도 (CLI가 처리), 타임라인은 빈 상태 |
