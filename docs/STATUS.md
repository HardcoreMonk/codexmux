# Claude CLI 작업 상태 감지

Claude CLI의 작업 진행 상태를 서버에서 감지하고, WebSocket으로 클라이언트에 전파하여 UI 인디케이터에 반영하는 시스템.

---

## 상태 정의

| 상태 (`TCliState`) | 의미 |
| --- | --- |
| `busy` | 사용자가 Claude에 작업을 요청했고 응답을 기다리는 중 |
| `idle` | Claude가 응답을 완료하고 다음 입력을 기다리는 중 |
| `inactive` | Claude 프로세스가 실행되지 않는 상태 |

표시 상태 (`TTabDisplayStatus`)는 `cliState`와 `dismissed` 플래그를 조합하여 결정:

| cliState | dismissed | 표시 상태 |
| --- | --- | --- |
| `busy` | - | `busy` (스피너) |
| `idle` | `false` | `needs-attention` (빨간 점) |
| `idle` | `true` | `idle` (표시 없음) |
| `inactive` | - | `idle` (표시 없음) |

---

## 상태 판별 로직

### 판별 흐름

```
detectTabCliState(tmuxSession, paneInfo)
│
├─ paneInfo 없음 → inactive
├─ pane의 포그라운드 명령이 "claude"가 아님 → inactive
├─ pane PID 없음 → inactive
│
└─ detectActiveSession(panePid)
    ├─ status !== 'active' → idle (Claude 실행 중이나 세션 없음)
    └─ status === 'active'
        ├─ jsonlPath 없음 → idle (아직 요청 전, JSONL 미생성)
        └─ jsonlPath 있음 → checkJsonlIdle()
            ├─ idle → idle
            └─ busy → busy
```

### JSONL 기반 busy/idle 판별 (`checkJsonlIdle`)

JSONL 파일의 끝 8KB를 읽고 마지막 의미 있는 엔트리를 역순 탐색:

| 마지막 엔트리 | 판정 | 이유 |
| --- | --- | --- |
| `system` + `subtype: 'stop_hook_summary'` | idle | 턴 종료 |
| `assistant` + `stop_reason: 'end_turn'` | idle | 응답 완료 |
| `assistant` + `stop_reason: 'max_tokens'` | idle | 토큰 제한 도달 |
| `assistant` + `stop_reason: 'tool_use'` | busy | 도구 실행 중 |
| `assistant` + `stop_reason: null` | busy | 응답 스트리밍 중 |
| `user` (텍스트 또는 tool_result) | busy | 요청/도구결과 전송, 응답 대기 |
| 파일 비어있음 | idle | 아직 요청 전 |

### Claude JSONL 엔트리 흐름 예시

```
user     → 사용자 메시지 전송          → busy
assistant (stop_reason: tool_use)     → busy (도구 호출 중)
user     → tool_result 전송            → busy
assistant (stop_reason: end_turn)     → idle (응답 완료)
system   (stop_hook_summary)          → idle (턴 종료 확정)
```

---

## 데이터 흐름

```
[서버 폴링] status-manager.ts
  │  5~15초 간격 (탭 수에 따라 조절)
  │
  ├─ getAllPanesInfo()          tmux list-panes 1회 호출
  ├─ detectActiveSession()     ~/.claude/sessions/ PID 파일 매칭
  ├─ checkJsonlIdle()          ~/.claude/projects/{project}/{sessionId}.jsonl 읽기
  │
  └─ 상태 변경 감지 시 WebSocket 브로드캐스트
      │
      ▼
[WebSocket] status-server.ts (/api/status)
      │
      ▼
[Zustand 스토어] use-claude-status-store.ts
  │
  ├─ getTabStatus(tabs, tabId)           → TTabDisplayStatus
  ├─ getWorkspaceStatus(tabs, wsId)      → { busyCount, attentionCount }
  └─ getGlobalStatus(tabs)               → { busyCount, attentionCount }
      │
      ▼
[UI 컴포넌트]
  ├─ TabStatusIndicator          탭 바 (각 탭 옆)
  ├─ WorkspaceStatusIndicator    사이드바 (워크스페이스 옆)
  ├─ GlobalStatusSummary         앱 헤더 (전체 요약 + 팝오버)
  └─ useBrowserTitle             브라우저 탭 제목 (N) PT
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
| `src/types/timeline.ts` | `TCliState`, `TSessionStatus` |

### 서버

| 파일 | 설명 |
| --- | --- |
| `src/lib/status-manager.ts` | 폴링 엔진, `checkJsonlIdle`, 상태 브로드캐스트 |
| `src/lib/status-server.ts` | `/api/status` WebSocket 핸들러 |
| `src/lib/session-detection.ts` | `detectActiveSession`, `watchSessionsDir` |
| `server.ts` | StatusManager 초기화 및 WebSocket 라우팅 |

### 클라이언트

| 파일 | 설명 |
| --- | --- |
| `src/hooks/use-claude-status-store.ts` | Zustand 스토어, 상태 집계 헬퍼 |
| `src/hooks/use-claude-status.ts` | WebSocket 연결, `dismissTab`, `reportActiveTab` |
| `src/hooks/use-browser-title.ts` | 브라우저 타이틀에 attention 카운트 반영 |

### UI 컴포넌트

| 파일 | 위치 |
| --- | --- |
| `src/components/features/terminal/tab-status-indicator.tsx` | 탭 바 |
| `src/components/features/terminal/workspace-status-indicator.tsx` | 사이드바 |
| `src/components/features/terminal/global-status-summary.tsx` | 앱 헤더 |

### 통합 지점

| 파일 | 사용 컴포넌트 |
| --- | --- |
| `src/components/features/terminal/pane-tab-bar.tsx` | `TabStatusIndicator` |
| `src/components/features/terminal/workspace-item.tsx` | `WorkspaceStatusIndicator` |
| `src/components/features/mobile/mobile-navigation-sheet.tsx` | `TabStatusIndicator`, `WorkspaceStatusIndicator` |
| `src/components/layout/app-header.tsx` | `GlobalStatusSummary` |
| `src/pages/_app.tsx` | `useClaudeStatus()` 전역 초기화 |
