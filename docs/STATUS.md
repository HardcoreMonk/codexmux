# Claude CLI 작업 상태 감지

Claude CLI의 작업 진행 상태를 서버에서 감지하고, WebSocket으로 클라이언트에 전파하여 UI 인디케이터에 반영하는 시스템.

---

## 상태 정의

### Claude 프로세스 상태 (`TClaudeStatus`)

tmux pane에서 Claude CLI 프로세스가 실행 중인지 판별하는 상태. 두 경로(터미널 WS, 타임라인 WS)에서 감지되며 `claudeStatus` 단일 필드로 통합 관리된다.

| 상태 | 의미 |
| --- | --- |
| `unknown` | 아직 감지 전 (초기값, 터미널 WS 미연결) |
| `starting` | Claude 프로세스 감지됨, 세션 미준비 (PID 파일/JSONL 아직 없음) |
| `running` | Claude 프로세스 실행 중 + 세션 확인됨 |
| `not-running` | Claude 프로세스 없음 |
| `not-initialized` | Claude CLI 설치됨, `~/.claude` 미생성 (한 번도 실행하지 않은 상태) |
| `not-installed` | Claude CLI 미설치 (바이너리 없음) |

`starting`과 `running`의 차이: `starting`은 프로세스 기반 감지(`isClaudeRunning`)로만 확인된 상태이고, `running`은 타임라인 WS에서 세션(`PID 파일 + sessionId`)까지 확인된 상태이다.

두 감지 경로:

| 경로 | 트리거 | 서버 체크 | 설정 값 |
| --- | --- | --- | --- |
| 터미널 WS `onTitleChange` | tmux 타이틀 변경 시 | `/api/check-claude` → `isClaudeRunning()` | `starting` / `not-running` |
| 타임라인 WS | 세션 파일 변경 시 | `detectActiveSession()` | `running` / `not-running` |

동일 `claudeStatus` 필드에 쓰며, `claudeStatusCheckedAt` 서버 타임스탬프로 stale 업데이트를 방지한다.

#### 상태 전환 가드

`setClaudeStatus`에서 다음 전환을 차단한다:

| 차단 전환 | 이유 |
| --- | --- |
| `running` → `starting` | `running`이 상위 상태 (세션 확인됨), 다운그레이드 방지 |

추가로 `onSync` 콜백(claude-code-panel, mobile-claude-code-panel)에서 다음을 차단한다:

| 차단 전환 | 이유 |
| --- | --- |
| `starting` → `not-running` (타임라인 경유) | 프로세스는 감지됐지만 세션 아직 미준비, check-claude 경유의 `not-running`은 허용 |

### CLI 작업 상태 (`TCliState`)

Claude가 실행 중일 때의 작업 진행 상태.

| 상태 | 의미 |
| --- | --- |
| `busy` | 사용자가 Claude에 작업을 요청했고 응답을 기다리는 중 |
| `idle` | Claude가 응답을 완료하고 다음 입력을 기다리는 중 (사용자 확인됨) |
| `ready-for-review` | Claude가 응답을 완료했으나 사용자가 아직 확인하지 않음 |
| `needs-input` | Claude가 작업 중 사용자 입력을 기다리는 상태 (권한 프롬프트, Notification hook) |
| `inactive` | Claude 프로세스가 실행되지 않는 상태 |

`ready-for-review`은 `busy → idle` 전환 시 자동 승격되며, 사용자가 해당 탭을 포커스하면 `idle`로 전환된다.

`needs-input`은 두 경로로 진입한다: (1) 서버 폴링에서 터미널 화면에 권한 프롬프트가 감지된 경우, (2) Notification hook이 `busy` 상태에서 수신된 경우.

### 탭 표시 상태 (`TTabDisplayStatus`)

`cliState`에서 직접 매핑:

| cliState | 표시 상태 | UI |
| --- | --- | --- |
| `busy` | `busy` | 스피너 |
| `ready-for-review` | `ready-for-review` | 보라색 점 (펄스) |
| `needs-input` | `needs-input` | 황색 점 (펄스) |
| `idle` | `idle` | 표시 없음 |
| `inactive` | `idle` | 표시 없음 |

### 세션뷰 (`TSessionView`)

Claude 패널에서 어떤 화면을 보여줄지 결정하는 파생 상태.

| 상태 | 의미 | 결정 조건 |
| --- | --- | --- |
| `loading` | 타임라인 로딩 중 | `claudeStatus === 'starting'`, 또는 `claudeStatus === 'running' && isTimelineLoading`, 또는 `isResuming` |
| `restarting` | 새 대화 생성 중 | `isRestarting === true` |
| `not-installed` | Claude CLI 미설치 | `claudeStatus === 'not-installed'` |
| `timeline` | 타임라인 표시 | `claudeStatus === 'running' && !isTimelineLoading` |
| `inactive` | Claude 미실행 | 위 어디에도 해당하지 않음 (`not-initialized`, `not-running` 포함) |

`inactive`일 때 컴포넌트에서 `sessions.length`로 세션 목록/빈 화면을 분기한다.

---

## 탭 스토어 (`useTabStore`)

모든 탭 상태를 `Record<tabId, ITabState>`로 관리하는 Zustand 스토어.

### 필드

| 필드 | 타입 | 소스 | 용도 |
| --- | --- | --- | --- |
| `terminalConnected` | `boolean` | 터미널 WS status | 입력 가능 여부 판단, `claudeStatus` 신뢰성 가드 |
| `claudeStatus` | `TClaudeStatus` | 터미널 WS + 타임라인 WS | 세션뷰 결정, 프로세스 감지 |
| `claudeStatusCheckedAt` | `number` | 서버 타임스탬프 | stale 업데이트 방지 |
| `cliState` | `TCliState` | 타임라인 entries 파생 / 서버 폴링 | 작업 상태, 탭 인디케이터 |
| `isTimelineLoading` | `boolean` | 타임라인 WS init 수신 여부 | 세션뷰 `loading` 분기 |
| `isRestarting` | `boolean` | 사용자 새 대화/재시작 액션 | 세션뷰 `restarting` 분기 |
| `isResuming` | `boolean` | 세션 resume 액션 | 세션뷰 `loading` 분기 |
| `workspaceId` | `string` | 서버 StatusManager | 워크스페이스별 탭 필터링 |

### 쓰기 경로

| 경로 | setter | 특성 |
| --- | --- | --- |
| 로컬 (onSync) | `setCliState` | `busy→idle` 시 `ready-for-review` 승격, `ready-for-review→idle` 보호. `notifyCliState`로 서버에도 전파 |
| 서버 (status WS) | `syncAllFromServer`, `updateFromServer` | 서버가 authority, 직접 patch (승격/보호 없음) |
| 사용자 액션 | `dismissTab` | `ready-for-review → idle` 전환 |

### `isCliIdle()` 헬퍼

`idle`과 `ready-for-review` 모두 "작업 대기 중"을 의미하므로, idle-like 판단이 필요한 곳에서 사용:

```typescript
export const isCliIdle = (cliState: TCliState): boolean =>
  cliState === 'idle' || cliState === 'ready-for-review';
```

사용처: `WebInputBar` 입력 모드, `QuickPromptBar` 활성화, 재시작 완료 감지, dismiss-on-focus.

---

## 상태 판별 로직

### 판별 흐름

```
detectTabCliState(tmuxSession, paneInfo)
│
├─ paneInfo 없음 → inactive
├─ isClaudeRunning(panePid) === false → inactive
│
└─ detectActiveSession(panePid)
    ├─ status !== 'running' → idle (Claude 실행 중이나 세션 없음)
    └─ status === 'running'
        ├─ jsonlPath 없음 → idle (아직 요청 전, JSONL 미생성)
        └─ jsonlPath 있음 → checkJsonlIdle()
            ├─ idle → idle
            └─ busy → busy
```

### JSONL 기반 busy/idle 판별 (통일 기준)

서버(`checkJsonlIdle`)와 클라이언트(`deriveCliState`)가 동일한 규칙을 따른다.
noise 엔트리(`file-history-snapshot`, `progress`, `last-prompt`)는 스킵하고 마지막 의미 있는 엔트리로 판별:

| 마지막 엔트리 | 판정 | 이유 |
| --- | --- | --- |
| `system` + `subtype: 'stop_hook_summary'` | idle | 턴 종료 |
| `system` + `subtype: 'turn_duration'` | idle | 턴 종료 |
| `assistant` + `stop_reason: 'end_turn'` | idle | 응답 완료 |
| `assistant` + `stop_reason: 'max_tokens'` | idle | 토큰 제한 도달 |
| `assistant` + `stop_reason: 'tool_use'` | busy | 도구 실행 중 |
| `assistant` + `stop_reason: null` | busy | 응답 스트리밍 중 |
| `user` + `[Request interrupted by user]` | idle | 사용자 중단 |
| `user` (텍스트 또는 tool_result) | busy | 요청/도구결과 전송, 응답 대기 |
| 파일 비어있음 | idle | 아직 요청 전 |

### ready-for-review 승격 로직

서버(`StatusManager.poll`, `StatusManager.updateTabFromHook`)와 클라이언트(`setCliState`)에서 동일하게 적용:

- `busy → idle` 전환 시 `ready-for-review`으로 승격
- `ready-for-review` 상태에서 `idle` 수신 시 무시 (보호)
- `dismissTab` 호출 시 `ready-for-review → idle` 전환

#### ready-for-review / needs-input 보호 불변식

`ready-for-review`는 **`dismissTab`으로만 해제**된다. `needs-input`은 Hook이 설정한 상태이므로, Hook 또는 서버 폴링에 의해서만 변경된다. `cliState`를 쓰는 모든 경로에서 이 보호가 필요하다:

| 경로 | 보호 방법 |
| --- | --- |
| `setCliState` (로컬) | `prev === 'ready-for-review' && new === 'idle'` → 무시, `prev === 'needs-input'` → 무시 |
| `updateTab` (서버 StatusManager) | 동일 조건 → 무시 |
| `poll` (서버 StatusManager) | `cliChanged` 조건에서 제외 |
| `initTab` (탭 초기화/재연결) | `existing === 'ready-for-review'` → 유지 |
| `updateTabFromHook` (Hook) | `needs-input`은 `prev === 'busy'`일 때만 전환, `stop`은 `busy`/`needs-input`에서만 `ready-for-review`로 전환 |
| `syncAllFromServer` / `updateFromServer` | 서버가 authority, 직접 patch (서버에서 이미 보호) |

**새로운 `cliState` 쓰기 경로를 추가할 때는 반드시 이 보호를 포함해야 한다.** `initTab`에서 layout JSON의 stale 값이 store의 `ready-for-review`를 덮어쓰는 버그가 실제 발생한 사례가 있다 — layout 파일 persist는 비동기(fire-and-forget)이므로 WebSocket을 통해 전파된 store 값과 layout 파일 값이 불일치할 수 있다.

#### Staleness fallback (서버만 적용)

위 규칙에서 `busy`로 판정되더라도, JSONL 파일의 mtime이 **90초 이상** 경과했으면 `idle`로 전환한다.
Claude CLI가 최종 엔트리(`assistant(end_turn)`, `system(turn_duration)`)를 기록하지 않고 턴이 종료된 경우를 보완한다.

#### 클라이언트 구현 (`deriveCliState` in `use-timeline.ts`)

`session-parser.ts`가 파싱한 `ITimelineEntry[]`의 마지막 엔트리 타입으로 판별:

| 타임라인 엔트리 타입 | 판정 | raw JSONL 대응 |
| --- | --- | --- |
| `turn-end` | idle | `system(stop_hook_summary\|turn_duration)` |
| `interrupt` | idle | `user([Request interrupted by user])` |
| `session-exit` | idle | `user(/exit)` |
| `assistant-message` + `stopReason ≠ 'tool_use'` | idle | `assistant(end_turn\|max_tokens)` |
| `ask-user-question` + `status === 'pending'` | idle | 사용자 질문 대기 |
| 그 외 | busy | — |

---

## Claude Code Hook 시스템

Claude Code의 [Hook](https://docs.anthropic.com/en/docs/claude-code/hooks) 기능을 활용하여, JSONL 폴링만으로는 감지가 늦는 상태 변화를 즉시 반영한다.

### Hook 설정

서버 시작 시 `ensureHookSettings()`가 `~/.purplemux/hooks.json`을 생성한다. Claude Code는 이 파일을 프로젝트 레벨 Hook 설정으로 인식한다.

| 파일 | 용도 |
| --- | --- |
| `~/.purplemux/hooks.json` | Hook 이벤트 → shell 스크립트 매핑 |
| `~/.purplemux/status-hook.sh` | Hook 실행 시 서버로 POST 전송하는 스크립트 |
| `~/.purplemux/port` | 현재 서버 포트 (스크립트에서 참조) |

### Hook 이벤트

| Claude Code Hook | 전송 이벤트 | 용도 |
| --- | --- | --- |
| `SessionStart` | `session-start` | Claude 세션 시작 감지 |
| `UserPromptSubmit` | `prompt-submit` | 사용자 입력 제출 → busy 전환 |
| `Notification` | `notification` | Claude가 사용자 입력을 기다리는 상태 감지 |
| `Stop` | `stop` | Claude 작업 완료 |
| `StopFailure` | `stop` | Claude 작업 실패 (Stop과 동일 처리) |

### Hook 스크립트 동작

```bash
#!/bin/sh
EVENT="${1:-poll}"
PORT_FILE="$HOME/.purplemux/port"
[ -f "$PORT_FILE" ] || exit 0
PORT=$(cat "$PORT_FILE")
SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null) || SESSION=""
curl -s -X POST -o /dev/null \
  -H 'Content-Type: application/json' \
  -d "{\"event\":\"${EVENT}\",\"session\":\"${SESSION}\"}" \
  "http://localhost:${PORT}/api/status/hook" 2>/dev/null
exit 0
```

tmux 세션 이름을 함께 전송하여 서버가 어떤 탭에서 발생한 이벤트인지 식별한다.

### Hook API 엔드포인트 (`/api/status/hook`)

localhost 연결만 허용 (보안). `event`와 `session`을 수신하여 `StatusManager.updateTabFromHook()`을 호출한다. `event`가 `poll`이거나 `session`이 없으면 전체 폴링을 트리거한다.

### Hook 상태 전환 (`updateTabFromHook`)

| 이벤트 | 전환 규칙 | 설명 |
| --- | --- | --- |
| `session-start` | → `idle` | 세션 시작, 입력 대기 |
| `prompt-submit` | → `busy` | 사용자 입력 제출 |
| `notification` | `busy` → `needs-input`, 그 외 → 유지 | busy일 때만 전환 (아래 참고) |
| `stop` | `busy`/`needs-input` → `ready-for-review`, 그 외 → `idle` | 작업 완료 |

#### Notification 조건부 처리

Notification hook은 `prevState === 'busy'`일 때만 `needs-input`으로 전환한다. 이는 Stop hook이 먼저 도착하여 `ready-for-review`로 전환된 후, 뒤늦은 Notification이 상태를 덮어쓰는 문제를 방지한다.

```
정상 순서:                   비정상 순서 (보호 동작):
prompt-submit → busy         prompt-submit → busy
notification  → needs-input  stop          → ready-for-review
stop          → ready-for-review  notification  → 무시 (prev ≠ busy)
```

### Hook Grace Period

Hook 이벤트 수신 후 **15초**(HOOK_GRACE_MS) 동안 해당 탭의 폴링 재감지를 스킵한다.

Hook이 즉시 상태를 전환한 뒤, 폴링이 아직 JSONL에 반영되지 않은 이전 상태를 읽어 덮어쓰는 경합을 방지한다. 15초 후에는 폴링이 다시 JSONL 기반으로 상태를 감지한다.

```
Hook 수신 → hookUpdatedAt.set(tabId, Date.now())
  │
  ├─ 15초 이내 폴링 → 기존 cliState 유지 (detectTabCliState 스킵)
  └─ 15초 경과 후 폴링 → detectTabCliState 재실행
```

### 관련 파일

| 파일 | 설명 |
| --- | --- |
| `src/lib/hook-settings.ts` | Hook 설정 파일 생성, 스크립트 관리 |
| `src/pages/api/status/hook.ts` | Hook API 엔드포인트 |
| `src/lib/status-manager.ts` | `updateTabFromHook()`, Grace Period 로직 |

---

## 데이터 흐름

```
[Claude Code Hook] hook-settings.ts → /api/status/hook
  │  SessionStart, UserPromptSubmit, Notification, Stop, StopFailure
  │
  └─ updateTabFromHook(session, event)
      ├─ 즉시 cliState 전환 + hookUpdatedAt 기록
      └─ WebSocket 브로드캐스트
          │
          ▼
[서버 폴링] status-manager.ts
  │  5~15초 간격 (탭 수에 따라 조절)
  │  ※ hookUpdatedAt 15초 이내면 해당 탭 스킵
  │
  ├─ getAllPanesInfo()          tmux list-panes 1회 호출
  ├─ isClaudeRunning()         자식 프로세스 args 확인
  ├─ detectActiveSession()     ~/.claude/sessions/ PID 파일 매칭
  ├─ checkJsonlIdle()          ~/.claude/projects/{project}/{sessionId}.jsonl 읽기
  │
  └─ 상태 변경 감지 시 WebSocket 브로드캐스트 (ready-for-review 승격 포함)
      │
      ▼
[Status WebSocket] status-server.ts (/api/status)
  │  서버 → 클라이언트: status:sync, status:update
  │  클라이언트 → 서버: status:tab-dismissed
  │
  ▼
[Zustand 스토어] use-tab-store.ts
  │
  │  서버 경로: syncAllFromServer / updateFromServer (직접 patch)
  │  로컬 경로: setCliState (승격/보호 로직 포함)
  │
  ├─ selectTabDisplayStatus(tabs, tabId)     → TTabDisplayStatus
  ├─ selectSessionView(tabs, tabId)          → TSessionView
  ├─ selectWorkspaceStatus(tabs, wsId)       → { busyCount, attentionCount }
  └─ selectGlobalStatus(tabs)                → { busyCount, attentionCount }
      │
      ▼
[알림 카운트] useNotificationCount()
  │  selectGlobalStatus에서 현재 활성 탭(activeTabId)을 제외한 카운트
  │  터미널 페이지(/)에서만 제외, 다른 페이지에서는 전체 포함
  │
  ▼
[UI 컴포넌트]
  ├─ TabStatusIndicator          탭 바 (각 탭 옆)
  ├─ WorkspaceStatusIndicator    사이드바 (워크스페이스 옆)
  ├─ NotificationSheet           알림 시트 (진행중/리뷰 목록)
  ├─ Bell 아이콘                  사이드바 + 앱 헤더 (fill 상태, 배지)
  └─ useBrowserTitle             브라우저 탭 제목 (N) purplemux
```

### 터미널 WS 경로 (프로세스 감지)

```
tmux 타이틀 변경 → onTitleChange
  │  lastTitleRef로 중복 호출 방지
  │
  ├─ formatTabTitle() → 탭 표시명 업데이트
  └─ fetch /api/check-claude
      └─ isClaudeRunning(panePid) → { running, checkedAt }
          └─ setClaudeStatus(tabId, running ? 'starting' : 'not-running', checkedAt)
```

### 타임라인 WS 경로 (세션 + 작업 상태)

```
타임라인 WS 연결 → detectActiveSession()
  │
  ├─ session-changed 메시지 → claudeStatus 설정
  ├─ timeline:init 메시지 → entries 수신, isTimelineLoading = false
  └─ timeline:append 메시지 → entries 추가
      │
      └─ useTimeline onSync 콜백
          ├─ setClaudeStatus(tabId, status, Date.now())
          │    ※ 현재 starting이고 incoming이 not-running이면 무시
          ├─ setCliState(tabId, cliState)    ← 여기서 ready-for-review 승격
          └─ setTimelineLoading(tabId, loading)
```

---

## 폴링 주기

| 탭 수 | 간격 |
| --- | --- |
| 1~10개 | 5초 |
| 11~20개 | 8초 |
| 21개+ | 15초 |

### 폴링 1회당 비용

| 작업 | 횟수 |
| --- | --- |
| `tmux list-panes -a` | 1회 (전체 일괄) |
| 파일시스템 읽기 (workspace/layout JSON) | 워크스페이스 수 + α |
| `pgrep -P` | 탭 수 |
| `ps -p` | 매칭된 PID 수 |
| JSONL 파일 tail 읽기 (8KB) | active 세션 수 |

---

## 관련 파일

### 타입

| 파일 | 설명 |
| --- | --- |
| `src/types/status.ts` | `ITabStatusEntry`, `TTabDisplayStatus`, WebSocket 메시지 타입 |
| `src/types/timeline.ts` | `TCliState`, `TClaudeStatus` |

### 서버

| 파일 | 설명 |
| --- | --- |
| `src/lib/status-manager.ts` | 폴링 엔진, `checkJsonlIdle`, `updateTabFromHook`, ready-for-review 승격, 상태 브로드캐스트 |
| `src/lib/status-server.ts` | `/api/status` WebSocket 핸들러 (`tab-dismissed` 처리) |
| `src/lib/hook-settings.ts` | Hook 설정 파일(`hooks.json`) 생성, 스크립트(`status-hook.sh`) 관리 |
| `src/pages/api/status/hook.ts` | Hook API 엔드포인트 (localhost only, `updateTabFromHook` 호출) |
| `src/lib/session-detection.ts` | `detectActiveSession`, `isClaudeRunning`, `watchSessionsDir` |
| `src/pages/api/check-claude.ts` | Claude 프로세스 감지 API (터미널 onTitleChange에서 호출) |
| `server.ts` | StatusManager 초기화, Hook 설정 초기화(`ensureHookSettings`), WebSocket 라우팅 |

### 클라이언트

| 파일 | 설명 |
| --- | --- |
| `src/hooks/use-tab-store.ts` | Zustand 탭 스토어, 파생 selectors, `isCliIdle` 헬퍼 |
| `src/hooks/use-claude-status.ts` | Status WebSocket 연결, `dismissTab` |
| `src/hooks/use-timeline.ts` | 타임라인 WS 데이터, `deriveCliState`, `onSync` 콜백 |
| `src/hooks/use-browser-title.ts` | 브라우저 타이틀에 attention 카운트 반영 |

### UI 컴포넌트

| 파일 | 위치 |
| --- | --- |
| `src/components/features/terminal/tab-status-indicator.tsx` | 탭 바 |
| `src/components/features/terminal/workspace-status-indicator.tsx` | 사이드바 |
| `src/components/features/terminal/notification-sheet.tsx` | 알림 시트 + `useNotificationCount` 훅 |

### 통합 지점

| 파일 | 사용 컴포넌트 |
| --- | --- |
| `src/components/features/terminal/pane-tab-bar.tsx` | `TabStatusIndicator` |
| `src/components/features/terminal/workspace-item.tsx` | `WorkspaceStatusIndicator` |
| `src/components/features/mobile/mobile-workspace-tab-bar.tsx` | `selectTabDisplayStatus` |
| `src/components/features/terminal/sidebar.tsx` | `useNotificationCount` (Bell 아이콘) |
| `src/components/layout/app-header.tsx` | `useNotificationCount` (Bell 아이콘) |
| `src/pages/_app.tsx` | `useClaudeStatus()` 전역 초기화 |

---

## 알림 시스템

### 알림 시트 (`NotificationSheet`)

Bell 아이콘 클릭 시 Sheet로 표시. 진행중(`busy`), 입력 대기(`needs-input`), 리뷰(`ready-for-review`) 세 섹션.

### 활성 탭 제외 로직

현재 보고 있는 탭은 이미 사용자가 인지하고 있으므로 알림 목록과 아이콘 카운트에서 제외한다.

| 페이지 | 제외 대상 |
| --- | --- |
| 터미널 (`/`) | 현재 활성 pane의 activeTabId |
| 그 외 (노트, 통계 등) | 없음 (전체 포함) |

`useNotificationCount` 훅이 이 로직을 캡슐화하며, 알림 시트·사이드바 Bell·앱 헤더 Bell이 동일한 카운트를 공유한다.

### 알림 항목 데이터

| 필드 | 소스 | 설명 |
| --- | --- | --- |
| `workspaceName` | `useWorkspaceStore` | 워크스페이스 이름 |
| `lastUserMessage` | `ITab.lastUserMessage` (레이아웃 JSON) | 마지막 사용자 메시지 |
| `busySince` | `ITabStatusEntry.busySince` | busy 상태 진입 시점 |
| `readyForReviewAt` | `ITabStatusEntry.readyForReviewAt` | ready-for-review 전환 시점 |

`lastUserMessage`는 타임라인 서버에서 `user-message` 엔트리 수신 시 레이아웃 JSON에 저장(`updateTabLastUserMessage`). 상태 매니저 폴링 시 레이아웃에서 읽어 클라이언트로 전파.
