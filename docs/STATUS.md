# Claude CLI 작업 상태 감지

Claude CLI의 작업 진행 상태를 서버에서 감지하고, WebSocket으로 클라이언트에 전파하여 UI 인디케이터에 반영하는 시스템.

**핵심 원칙**: `cliState`는 **Claude Code Hook이 유일한 진실의 출처**다. JSONL 휴리스틱·pane capture·클라이언트 로컬 파생 등 기존의 다중 소스는 모두 제거되었고, 훅 이벤트의 결정적 파생식(`deriveStateFromEvent`)으로 상태가 결정된다.

---

## 상태 정의

### Claude 프로세스 상태 (`TClaudeStatus`)

tmux pane에서 Claude CLI 프로세스가 실행 중인지 판별하는 상태. `cliState`와 독립적으로 관리되며 두 경로(터미널 WS, 타임라인 WS)에서 감지된다.

| 상태 | 의미 |
| --- | --- |
| `unknown` | 아직 감지 전 (초기값, 터미널 WS 미연결) |
| `starting` | Claude 프로세스 감지됨, 세션 미준비 (PID 파일/JSONL 아직 없음) |
| `running` | Claude 프로세스 실행 중 + 세션 확인됨 |
| `not-running` | Claude 프로세스 없음 |
| `not-initialized` | Claude CLI 설치됨, `~/.claude` 미생성 |
| `not-installed` | Claude CLI 미설치 |

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

추가로 `claude-code-panel`/`mobile-claude-code-panel`의 `onSync` 콜백에서:

| 차단 전환 | 이유 |
| --- | --- |
| `starting` → `not-running` (타임라인 경유) | 프로세스는 감지됐지만 세션 아직 미준비, check-claude 경유의 `not-running`은 허용 |

### CLI 작업 상태 (`TCliState`)

Claude CLI에서 진행 중인 작업의 상태. 오직 Hook 이벤트의 결정적 파생으로만 변경된다.

| 상태 | 의미 | 트리거 |
| --- | --- | --- |
| `busy` | 사용자 요청을 처리 중 | `prompt-submit` 훅 |
| `idle` | 응답 완료 + 사용자 확인됨 | `session-start` 훅 또는 `dismissTab` |
| `ready-for-review` | 응답 완료, 사용자 미확인 | `stop` 훅 |
| `needs-input` | 권한 프롬프트 / 사용자 입력 대기 | `notification` 훅 |
| `unknown` | 서버 재시작 전 `busy`였고 복구 미완료 | `resolveUnknown` 대기 |
| `inactive` | Claude 프로세스 미실행 초기 상태 | 탭 생성 시 기본값 |
| `cancelled` | 사용자가 탭 삭제 중 | 클라이언트 전용 local 상태 |

### 전이 규칙 (`deriveStateFromEvent`)

순수함수. `src/lib/status-manager.ts`:

```ts
export const deriveStateFromEvent = (event: ILastEvent | null, fallback: TCliState): TCliState => {
  if (!event) return fallback;
  switch (event.name) {
    case 'session-start': return 'idle';
    case 'prompt-submit': return 'busy';
    case 'notification':  return 'needs-input';
    case 'stop':          return 'ready-for-review';
  }
};
```

**예외**: `prevState === 'cancelled'`이면 훅이 와도 `cancelled` 유지.

**`inactive` 처리**: 기본값일 뿐 덮어쓰기 불가 상태가 아니다. 신규 탭이 `inactive`로 시작해도 첫 `session-start` 훅이 `idle`로 승격한다. (과거에 `inactive`/`cancelled` 모두 전이 차단이었는데, 이 때문에 "새 대화 시작" 시 `Creating new conversation...`이 풀리지 않는 버그가 있어 `inactive` 차단을 제거함.)

### `ready-for-review` 해제

`ready-for-review → idle` 전환은 **오직 `dismissTab` 액션**으로만 발생:

- 사용자가 탭 포커스 (auto-dismiss)
- 알림 시트에서 명시적 dismiss

훅이나 JSONL watcher는 이 전환을 일으키지 않는다.

### `needs-input` 해제 (사용자 선택 ack)

권한 프롬프트에서 사용자가 옵션을 선택하면 Claude는 작업을 재개하지만 `prompt-submit` 훅을 발사하지 않는다. 따라서 `needs-input → busy` 전환을 훅만으로 감지할 수 없어, 클라이언트가 명시적으로 ack를 보낸다.

**플로우**:

1. `PermissionPromptItem.handleSelect` — `sendSelection` 성공 후 현재 `lastEvent.seq`와 함께 `status:ack-notification` WS 메시지 전송
2. `StatusManager.ackNotificationInput(tabId, seq)`:
   - `cliState === 'needs-input'` 아니면 무시
   - `lastEvent.name === 'notification' && lastEvent.seq === seq` 아니면 무시 (이미 다음 훅이 도착한 경우)
   - 조건 충족 시 `applyCliState(busy)` + `persistToLayout` + `broadcastUpdate`

**seq 가드의 의미**: ack가 도착하기 전에 다른 훅(연속 `notification` 또는 `stop`)이 먼저 도착하면 `entry.lastEvent.seq`가 증가해 ack와 불일치 → 무시. 이미 서버가 더 최신 상태로 전이했으므로 뒤늦은 ack가 덮어쓰는 레이스를 방지한다.

`eventSeq`는 증가시키지 않는다 — 이건 훅 이벤트가 아니라 클라이언트 액션이므로. 다음 실제 훅이 오면 기존 seq보다 큰 값을 받아 정상 처리된다.

### 탭 표시 상태 (`TTabDisplayStatus`)

`selectTabDisplayStatus(tabs, tabId)`에서 `cliState`를 UI 표시용으로 매핑:

| cliState | 표시 상태 | UI 인디케이터 |
| --- | --- | --- |
| `busy` | `busy` | 스피너 |
| `ready-for-review` | `ready-for-review` | 보라색 점 (펄스) |
| `needs-input` | `needs-input` | 황색 점 (펄스) |
| `unknown` | `unknown` | 회색 점 (정적) |
| `idle` | `idle` | 표시 없음 |
| `inactive` | `idle` | 표시 없음 |
| `cancelled` | (컴포넌트 개별 처리) | — |

### 세션뷰 (`TSessionView`)

Claude 패널에서 어떤 화면을 보여줄지 결정하는 파생 상태.

| 상태 | 결정 조건 |
| --- | --- |
| `loading` | `claudeStatus === 'starting'`, 또는 `claudeStatus === 'running' && isTimelineLoading`, 또는 `isResuming` |
| `restarting` | `isRestarting === true` |
| `not-installed` | `claudeStatus === 'not-installed'` |
| `timeline` | `claudeStatus === 'running' && !isTimelineLoading` |
| `inactive` | 위 어디에도 해당하지 않음 |

---

## 탭 스토어 (`useTabStore`)

모든 탭 상태를 `Record<tabId, ITabState>`로 관리하는 Zustand 스토어.

### 주요 필드

| 필드 | 타입 | 소스 | 용도 |
| --- | --- | --- | --- |
| `terminalConnected` | `boolean` | 터미널 WS | 입력 가능 여부 판단 |
| `claudeStatus` | `TClaudeStatus` | 터미널/타임라인 WS | 세션뷰 결정 |
| `claudeStatusCheckedAt` | `number` | 서버 타임스탬프 | stale 업데이트 방지 |
| `cliState` | `TCliState` | 서버 WS (`status:update` / 훅 파생) | 작업 상태, 탭 인디케이터 |
| `lastEvent` | `ILastEvent \| null` | 서버 WS (`status:hook-event`) | 이벤트 순서 추적, PermissionPrompt 재fetch 트리거 |
| `eventSeq` | `number` | 서버 WS | 역전 방지용 단조 카운터 |
| `isTimelineLoading` | `boolean` | 타임라인 WS init 수신 여부 | 세션뷰 `loading` 분기 |
| `isRestarting` | `boolean` | 사용자 새 대화 액션 | 세션뷰 `restarting` 분기 |
| `isResuming` | `boolean` | 세션 resume 액션 | 세션뷰 `loading` 분기 |
| `compactingSince` | `number \| null` | `pre-compact`/`post-compact` 훅 | timeline compacting 인디케이터 |

### 쓰기 경로

| 경로 | 액션 | 특성 |
| --- | --- | --- |
| 서버 sync (`status:sync`) | `syncAllFromServer` | 초기 로드, `cancelled` 보호 |
| 서버 update (`status:update`) | `updateFromServer` | 메타데이터 + cliState, `cancelled` 보호 |
| 서버 event (`status:hook-event`) | `applyHookEvent` | `lastEvent`/`eventSeq`만 갱신, `seq` 역전 방지 |
| 사용자 dismiss | `dismissTab` | `ready-for-review → idle` 로컬 즉시 반영 + WS `status:tab-dismissed` |
| 사용자 탭 삭제 | `cancelTab` | `cliState = 'cancelled'` 로컬 전용 |

**클라이언트는 `cliState`를 서버로 역전파하지 않는다**. 과거의 `notifyCliState`/`status:cli-state` 경로는 제거됨.

### `isCliIdle()` 헬퍼

`idle`과 `ready-for-review` 모두 "작업 대기 중"을 의미하므로:

```ts
export const isCliIdle = (cliState: TCliState): boolean =>
  cliState === 'idle' || cliState === 'ready-for-review';
```

사용처: `WebInputBar` 입력 모드, 재시작 완료 감지, dismiss-on-focus.

---

## Claude Code Hook 시스템

Claude Code의 [Hook](https://docs.anthropic.com/en/docs/claude-code/hooks) 기능을 사용하여 Claude의 작업 상태를 즉시 전달받는다.

### Hook 설정

서버 시작 시 `ensureHookSettings()`가 `~/.purplemux/hooks.json`을 생성한다.

| 파일 | 용도 |
| --- | --- |
| `~/.purplemux/hooks.json` | Hook 이벤트 → shell 스크립트 매핑 |
| `~/.purplemux/status-hook.sh` | 서버로 POST 전송하는 스크립트 |
| `~/.purplemux/port` | 현재 서버 포트 (스크립트에서 참조) |

### Hook 이벤트 매핑

| Claude Code Hook | 전송 이벤트 | 결과 |
| --- | --- | --- |
| `SessionStart` | `session-start` | → `idle` |
| `UserPromptSubmit` | `prompt-submit` | → `busy` |
| `Notification` | `notification` | → `needs-input` (단, notificationType 필터링) |
| `Stop` | `stop` | → `ready-for-review` |
| `StopFailure` | `stop` | → `ready-for-review` |
| `PreCompact` | `pre-compact` | → `compactingSince = now` (cliState 불변) |
| `PostCompact` | `post-compact` | → `compactingSince = null` (cliState 불변) |

`pre-compact`/`post-compact`는 `cliState`/`eventSeq`/`lastEvent`를 건드리지 않고 별도 필드 `compactingSince`만 세팅한다. 이 값은 timeline-view의 compacting 인디케이터(60초 윈도우)를 구동한다. `pre-compact` 후 `post-compact`가 유실될 경우를 대비해 서버가 `COMPACT_STALE_MS = 60s` 타이머로 자동 해제한다.

### Notification 필터링 (`INPUT_REQUESTING_NOTIFICATION_TYPES`)

Claude의 `Notification` 훅은 다양한 시점에 발사되지만 사용자 입력이 필요한 경우만 `needs-input`으로 전이해야 한다. `status-manager.ts`의 화이트리스트:

```ts
const INPUT_REQUESTING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'worker_permission_prompt']);
```

훅 스크립트가 stdin JSON에서 `notification_type`을 파싱해 payload에 포함하면, 서버가 화이트리스트에 없는 타입(예: idle 알림)은 상태 전이 없이 무시한다.

### Hook 스크립트

`~/.purplemux/status-hook.sh`는 `hook-settings.ts`의 `HOOK_SCRIPT_CONTENT`로 생성된다. 핵심 동작:

- `tmux display-message`로 세션 이름 조회 (서버가 어느 탭인지 식별)
- `event === 'notification'`이면 stdin JSON에서 `notification_type` 파싱 → payload에 포함
- `curl POST /api/status/hook`으로 `{ event, session, notificationType? }` 전송

### Agent 탭 별도 hook (참고)

일반 탭은 위 sh 스크립트를 거치지만, **agent 탭/brain 세션**은 `buildAgentTabHookSettings` / `buildAgentBrainHookSettings`로 생성된 `type: 'http'` 훅을 사용해 `/api/agent-rpc/{agentId}/...` 엔드포인트로 직접 POST한다 (`Stop`/`StopFailure`만). StatusManager 경로와 분리되어 있으며 본 문서 범위 밖.

### Hook API 엔드포인트

`/api/status/hook` — localhost only. `event`와 `session`을 받아 `StatusManager.updateTabFromHook()`을 호출한다. `event`가 `poll`이거나 `session`이 없으면 전체 poll을 트리거한다.

### 처리 흐름 (`updateTabFromHook`)

```
훅 수신
  │
  ├─ tabId/entry 조회 (없으면 return)
  ├─ event 화이트리스트 검사 (session-start/prompt-submit/notification/stop)
  │
  ├─ entry.eventSeq += 1
  ├─ entry.lastEvent = { name, at: Date.now(), seq }
  ├─ status:hook-event broadcast (seq + name + at)
  │
  ├─ newState = deriveStateFromEvent(entry.lastEvent, prevState)
  │   (prevState === 'cancelled'이면 그대로 유지)
  │
  └─ prevState !== newState면
      ├─ applyCliState(tabId, entry, newState)
      ├─ persistToLayout(entry)
      └─ status:update broadcast
```

`stop` 이벤트 후 `refreshSnippet`이 JSONL 최종 상태를 비동기로 읽어 `currentAction`/`lastAssistantSnippet`을 추가로 broadcast한다 (500ms 지연 포함).

### 이벤트 섀도잉 (`status:hook-event`)

`cliState`가 바뀌지 않는 경우(예: 연속 `notification` → `needs-input`에서 `needs-input`)에도 `status:hook-event`는 **항상** broadcast된다. 클라이언트는 `applyHookEvent`에서 `event.seq > prev.eventSeq`인 경우에만 반영하여 역전을 방지한다.

`PermissionPromptItem`은 `lastEvent.seq`를 `useEffect` dep로 구독하여 연속 권한 프롬프트 시 새 옵션을 자동 재fetch한다:

```
연속 권한 프롬프트:
prompt-submit → lastEvent{name:'prompt-submit', seq:1} → busy
notification  → lastEvent{name:'notification', seq:2}  → needs-input
사용자 선택
notification  → lastEvent{name:'notification', seq:3}  → needs-input (same cliState, seq++)
stop          → lastEvent{name:'stop', seq:4}          → ready-for-review
```

---

## 서버 재시작 정책

서버가 재시작될 때 훅이 유실될 수 있는 유일한 상태는 `busy`다 (Claude가 다운 기간 중 `stop`/`notification`을 쏘면 유실). 다른 상태는 "공이 사용자 코트"에 있어 자동 전이가 발생하지 않으므로 persisted 값 그대로 유지해도 안전하다.

`StatusManager.scanAll`에서 layout에 저장된 `cliState`를 읽어:

| persisted cliState | 재시작 후 | 후속 처리 |
| --- | --- | --- |
| `busy` | **`unknown`** | `resolveUnknown` 즉시 스케줄 |
| `needs-input` | 유지 | JSONL watcher 시작 |
| 그 외 | 유지 | — |

### `resolveUnknown` — unknown 탭 백그라운드 복구

`busy → unknown`으로 변환된 탭을 다음 확실한 신호만 사용해 승격:

1. **Claude 프로세스 검사** — `isClaudeRunning(panePid)` 실패 → `idle` 확정 (silent, 푸시 없음)
2. **JSONL tail 검사** — `checkJsonlIdle`이 `idle && !stale && lastAssistantSnippet`을 반환 → `ready-for-review` 확정 (silent)
3. **그 외** → `unknown` 유지, 다음 훅 수신 대기

**pane capture는 사용하지 않는다.** 스크롤백에 남은 이전 권한 프롬프트를 현재 프롬프트로 오판할 위험 때문.

`unknown` 상태에서도 JSONL watcher를 시작한다 — cliState는 변경하지 않지만 `currentAction`/`lastAssistantMessage` 메타데이터는 계속 업데이트된다.

### Busy 교착 안전망

운영 중 `busy` 상태가 `BUSY_STUCK_MS` (**10분**) 이상 지속되고 Claude 프로세스도 사망했다면 `idle`로 silent 복구. 메타데이터 poll 루프 내에서 수행. SIGKILL 등 `stop` 훅 유실 대비.

---

## JSONL Watcher (메타데이터 전용)

`busy` / `needs-input` / `unknown` / `ready-for-review` 상태 탭의 JSONL 파일에 `fs.watch`를 설정하여 파일 변경 시 `checkJsonlIdle`을 호출한다.

| 트리거 | 동작 |
| --- | --- |
| 시작 | `busy`/`needs-input`/`unknown` 진입 시 (훅 경로 또는 scanAll) |
| 처리 | `currentAction`, `lastAssistantMessage`, reset 신호만 갱신 → `status:update` broadcast |
| 해제 | `idle`/`inactive` 전이, 탭 삭제, shutdown |

**핵심**: JSONL watcher는 **`cliState`를 절대 변경하지 않는다**. 과거에는 `busy → ready-for-review` 자동 승격 경로가 있었으나 이제 `stop` 훅만이 이 전환을 일으킨다.

---

## 메타데이터 Poll

`cliState`에 관여하지 않는 **메타데이터 전용** 폴링.

### 주기

| 탭 수 | 간격 |
| --- | --- |
| 1~10개 | 30초 |
| 11~20개 | 45초 |
| 21개+ | 60초 |

### 폴링 1회당 비용

| 작업 | 횟수 |
| --- | --- |
| `tmux list-panes -a` | 1회 (전체 일괄) |
| 파일시스템 읽기 (workspace/layout JSON) | 워크스페이스 수 + α |
| 프로세스 확인 (`pgrep`/`ps`) | busy 교착 검사에 걸린 탭 수만 |
| JSONL 파일 tail 읽기 | 신규 탭 발견 시 1회 (기존 탭은 watcher 경로) |

### 처리 내용

- 신규 탭 발견 → `readTabMetadata`로 초기 메타데이터 로드 + entry 생성
  - persisted `cliState === 'busy'` → `'unknown'`으로 변환 + `resolveUnknown` 스케줄
- 기존 탭 → process/ports/title/summary 갱신 (cliState는 건드리지 않음)
- busy 교착 검사 → 10분 경과 + Claude 프로세스 사망 → silent `idle`
- 삭제된 탭 → cleanup + `broadcastRemove`

`cliState` 판정과 `hasPermissionPrompt` 검사가 제거되어 폴링 비용이 Phase 1 이전 대비 ~80% 감소.

---

## 데이터 흐름

```
[Claude Code Hook]
  ~/.purplemux/status-hook.sh
  └─ curl POST /api/status/hook
     │
     ▼
[/api/status/hook] (localhost only)
  └─ StatusManager.updateTabFromHook(session, event)
     │
     ├─ entry.eventSeq 증가
     ├─ entry.lastEvent = { name, at, seq }
     ├─ status:hook-event broadcast
     ├─ deriveStateFromEvent → newState
     └─ prevState !== newState면
         ├─ applyCliState (idempotent 가드 + 푸시 알림)
         ├─ persistToLayout (layout JSON)
         └─ status:update broadcast
             │
             ▼
[JSONL Watcher] (병렬)
  busy/needs-input/unknown/ready-for-review 탭만 감시
  파일 변경 시 checkJsonlIdle → currentAction/lastAssistantSnippet 갱신
  └─ status:update broadcast (cliState는 불변)
             │
             ▼
[메타데이터 Poll] (병렬, 30~60초)
  - 신규 탭 감지, 삭제 탭 정리
  - process/ports/summary 갱신
  - busy 교착 안전망
  - persisted busy → unknown 변환 + resolveUnknown
             │
             ▼
[Status WebSocket] /api/status
  서버 → 클라: status:sync / status:update / status:hook-event
  클라 → 서버: status:tab-dismissed / status:ack-notification / status:request-sync
             │
             ▼
[Zustand 스토어] useTabStore
  syncAllFromServer / updateFromServer (메타+cliState)
  applyHookEvent (lastEvent/eventSeq, seq 역전 방지)
  dismissTab / cancelTab (로컬 액션)
             │
             ▼
[UI 컴포넌트]
  TabStatusIndicator         탭 바 인디케이터
  WorkspaceStatusIndicator   사이드바 워크스페이스
  PermissionPromptItem       타임라인, lastEvent.seq로 재fetch
  NotificationSheet          알림 시트
  Bell 아이콘                 사이드바 + 앱 헤더
  useBrowserTitle            브라우저 탭 제목
```

### 터미널 WS 경로 (프로세스 감지, cliState 무관)

```
tmux 타이틀 변경 → onTitleChange
  ├─ formatTabTitle → 탭 표시명 업데이트
  └─ fetch /api/check-claude
      └─ isClaudeRunning(panePid)
          └─ setClaudeStatus(tabId, 'starting' | 'not-running')
```

### 타임라인 WS 경로 (세션 + 엔트리)

```
타임라인 WS 연결 → 서버의 detectActiveSession
  ├─ session-changed → claudeStatus 반영
  ├─ timeline:init → entries 수신, isTimelineLoading = false
  └─ timeline:append → entries 추가
      └─ useTimeline.onSync 콜백
          ├─ setClaudeStatus(tabId, status, checkedAt)
          └─ setTimelineLoading(tabId, loading)
```

`useTimeline`은 **더 이상 `cliState`를 로컬 파생하지 않는다** (과거 `deriveCliState` 제거). 타임라인 WS는 메타데이터 (엔트리, 요약)만 담당하고 `cliState`는 훅 경로로만 갱신된다.

---

## 로그 설정

### 전역 레벨

```bash
LOG_LEVEL=debug pnpm dev      # 전체
```

### 모듈별 레벨

`LOG_LEVELS` 환경변수로 그룹별 레벨 분리. `createLogger(name)`이 해당 그룹의 레벨을 child logger에 적용한다.

```bash
# Claude Code hook 동작만 debug로 추적
LOG_LEVELS=hooks=debug pnpm dev

# 여러 그룹 동시
LOG_LEVELS=hooks=debug,status=warn pnpm dev
```

주요 그룹:

| 그룹 | 출처 | 디버깅 대상 |
| --- | --- | --- |
| `hooks` | `api/status/hook.ts`, `status-manager.ts` (`hookLog`) | 훅 수신·처리·상태 전이 |
| `status` | `status-manager.ts` (`log`) | poll, JSONL watcher, broadcast |
| `tmux` | `lib/tmux.ts` | tmux 명령 실행 |

`hooks=debug`로 켜면 다음이 보인다:

- `[hooks] received { event, session }` — 훅 엔드포인트 수신
- `[hooks] no tabId for session` / `no entry for tab` — 실패 케이스
- `[hooks] processed { tabId, event, seq, prevState, newState, transition }` — 처리 결과

### 동작 원리

`src/lib/logger.ts`가 `LOG_LEVELS`를 파싱하고 root logger의 level을 그룹 최소값으로 설정한 뒤, `createLogger(name)`이 child logger에 그룹별 level을 적용한다. Pino는 root가 최소 레벨까지 열려 있어야 child에서 필터링할 수 있기 때문.

---

## 관련 파일

### 타입

| 파일 | 설명 |
| --- | --- |
| `src/types/status.ts` | `ITabStatusEntry`, `ILastEvent`, `TEventName`, `TTabDisplayStatus`, WebSocket 메시지 |
| `src/types/timeline.ts` | `TCliState`, `TClaudeStatus` |

### 서버

| 파일 | 설명 |
| --- | --- |
| `src/lib/status-manager.ts` | `deriveStateFromEvent`, `updateTabFromHook`, `applyCliState`, `resolveUnknown`, `readTabMetadata`, busy 교착 안전망, 메타데이터 poll, JSONL watcher |
| `src/lib/status-server.ts` | `/api/status` WebSocket 핸들러 |
| `src/lib/hook-settings.ts` | Hook 설정 파일 생성, 스크립트 관리 |
| `src/pages/api/status/hook.ts` | Hook API 엔드포인트 (localhost only) |
| `src/lib/session-detection.ts` | `detectActiveSession`, `isClaudeRunning` |
| `src/pages/api/check-claude.ts` | Claude 프로세스 감지 API |
| `src/lib/layout-store.ts` | `updateTabCliStatus` 등 layout JSON 쓰기 |
| `src/lib/logger.ts` | `LOG_LEVELS` 파싱 + 그룹별 pino child |

### 클라이언트

| 파일 | 설명 |
| --- | --- |
| `src/hooks/use-tab-store.ts` | Zustand 탭 스토어, `applyHookEvent`, `selectTabDisplayStatus` |
| `src/hooks/use-claude-status.ts` | Status WebSocket 연결, `status:hook-event`/`status:update` 처리, `dismissTab` |
| `src/hooks/use-timeline.ts` | 타임라인 WS 데이터 (cliState 파생 없음) |
| `src/hooks/use-web-input.ts` | 입력 모드 결정 (`unknown` → `input` 허용) |
| `src/hooks/use-native-notification.ts` | 데스크톱 네이티브 알림 |
| `src/hooks/use-browser-title.ts` | 브라우저 타이틀 attention 카운트 |

### UI 컴포넌트

| 파일 | 역할 |
| --- | --- |
| `src/components/features/terminal/tab-status-indicator.tsx` | 탭 바 인디케이터 |
| `src/components/features/terminal/workspace-status-indicator.tsx` | 사이드바 워크스페이스 점 |
| `src/components/features/mobile/mobile-workspace-tab-bar.tsx` | 모바일 탭 바 |
| `src/components/features/timeline/permission-prompt-item.tsx` | 권한 프롬프트 UI (`lastEvent.seq` 구독) |
| `src/components/features/terminal/notification-sheet.tsx` | 알림 시트 + `useNotificationCount` |

---

## 알림 시스템

### 알림 시트 (`NotificationSheet`)

Bell 아이콘 클릭 시 Sheet로 표시. 진행중(`busy`), 입력 대기(`needs-input`), 리뷰(`ready-for-review`), 완료(`done`) 네 섹션.

완료 섹션은 `dismissTab`으로 확인된 탭(`dismissedAt` 값 존재 + `cliState`가 `idle`/`inactive`) 중 현재 활성 탭을 제외하여 최신순으로 표시한다. 해당 탭에서 새 작업이 시작되면 `dismissedAt`이 초기화되어 목록에서 제거된다.

### 활성 탭 제외 로직

현재 보고 있는 탭은 이미 사용자가 인지하고 있으므로 알림 카운트에서 제외:

| 페이지 | 제외 대상 |
| --- | --- |
| 터미널 (`/`) | 현재 활성 pane의 `activeTabId` |
| 그 외 | 없음 (전체 포함) |

`useNotificationCount` 훅이 이 로직을 캡슐화하며 사이드바·앱 헤더·알림 시트가 동일 카운트를 공유한다.

### `unknown` 상태 처리

`unknown` 탭은 attention/busy 카운트에서 모두 **제외**된다. 재시작 직후의 불확정 상태를 알림으로 울리지 않기 위한 의도된 동작. 사이드바 뱃지만 회색 점으로 조용히 표시.

### 푸시 알림 정책

`applyCliState` 호출 경로에서 자동 발사:

- `newState === 'ready-for-review'` → web push "Task Complete"
- `newState === 'needs-input'` → web push "Input Required"

함수 상단의 idempotent 가드 (`prevState === newState`)가 중복 호출을 차단하므로 호출자 쪽 상태 추적 부담이 없다.

`resolveUnknown` / `dismissTab` / busy-stuck 안전망 / 서버 재시작 복구 같은 "silent" 경로는 `{ silent: true }` 옵션으로 푸시를 억제한다.
