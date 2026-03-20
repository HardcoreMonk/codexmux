# API 연동

## 개요

claude 명령어 감지는 서버 내부 모듈로, REST API를 노출하지 않는다. tmux CLI를 통해 프로세스를 확인하고, 감지 결과를 내부적으로 처리한다.

## tmux CLI 호출

### 포그라운드 프로세스 확인

```bash
tmux -L purple display-message -t {sessionName} -p '#{pane_current_command}'
```

| 파라미터 | 설명 |
|---|---|
| `-L purple` | Purple Terminal 전용 tmux 소켓 |
| `-t {sessionName}` | 대상 tmux 세션 (예: `pt-ws-abc-pane-def-tab-001`) |
| `-p '#{pane_current_command}'` | 현재 포그라운드 프로세스 이름 |

- 반환값 예시: `zsh`, `claude`, `node`, `vim` 등
- 세션 미존재 시: 에러 (exit code ≠ 0)

## 내부 모듈 인터페이스

### src/lib/claude-detection.ts

```typescript
// 단일 세션의 현재 실행 프로세스 확인
const getCurrentCommand: (sessionName: string) => Promise<string | null>

// 폴링 시작
const startClaudeDetection: (options: IClaudeDetectionOptions) => IDetectionHandle

// 폴링 중지
interface IDetectionHandle {
  stop: () => void;
  updateTargets: (targets: IDetectionTarget[]) => void;
}

interface IClaudeDetectionOptions {
  targets: IDetectionTarget[];
  intervalMs: number;          // 기본값: 1500 (1.5초)
  onDetected: (target: IDetectionTarget) => void;
}

interface IDetectionTarget {
  paneId: string;
  tabId: string;
  sessionName: string;
}
```

## 호출 흐름

```
서버 시작
├── startClaudeDetection({
│     targets: 현재 활성 Workspace의 terminal 타입 탭들,
│     intervalMs: 1500,
│     onDetected: (target) => {
│       updateTabPanelType(target.paneId, target.tabId, 'claude-code');
│       saveLayout();
│     }
│   })
│
Workspace 전환 시
├── handle.updateTargets(새 Workspace의 terminal 타입 탭들)
│
탭 생성/삭제 시
├── handle.updateTargets(갱신된 타입 목록)
│
서버 종료 시
└── handle.stop()
```

## 서버 초기화 변경

### server.ts 확장

```
start()
├── checkTmux()
├── scanSessions()
├── applyConfig()
├── initWorkspaceStore()
├── app.prepare()
├── startClaudeDetection(...)  ← 신규
├── 서버 리스닝
```

## panelType 변경 전파

감지 후 클라이언트에 변경을 전파하는 방식:

1. 서버: `updateTabPanelType()` → layout.json 저장
2. 클라이언트 감지 방식 (선택):
   - **방식 A**: 기존 터미널 WebSocket에 커스텀 메시지 추가 (`MSG_PANEL_TYPE_CHANGED = 0x05`)
   - **방식 B**: 클라이언트에서 layout을 주기적 폴링 (비효율)
   - **방식 C**: 타임라인 WebSocket 연결 시 서버가 panelType 변경 푸시
   - **권장**: 방식 A — 기존 터미널 WebSocket 활용, 최소 지연

### 방식 A 상세

```
서버: claude 감지 → layout.json 저장 + 해당 세션의 터미널 WebSocket에 알림
클라이언트: 터미널 WebSocket에서 새 메시지 타입 수신 → panelType 로컬 state 변경
```

바이너리 프로토콜 확장:

```typescript
const MSG_PANEL_TYPE_CHANGED = 0x05;

// 서버 → 클라이언트
// [0x05, ...utf8('claude-code')]
```

## 에러 처리

| 에러 | 처리 |
|---|---|
| tmux 세션 미존재 | 해당 세션 폴링 스킵 |
| tmux 명령 타임아웃 (3초) | 해당 사이클 스킵 |
| tmux 서버 미응답 | 폴링 일시 중단, 30초 후 재개 |
| 동시에 여러 세션 감지 | 각 세션 독립 처리 |

## 성능

| 지표 | 값 |
|---|---|
| 폴링 주기 | 1.5초 |
| tmux 명령 실행 시간 | ~10ms |
| 최대 동시 폴링 대상 | 활성 Workspace의 terminal 타입 탭 수 |
| 감지 → UI 전환까지 | 최대 1.5초 (폴링 주기) + 100ms (전환 처리) |
