---
page: status-server
title: 서버 상태 감시 + 멀티 클라이언트 동기화
route: /api/status
status: DRAFT
complexity: High
depends_on:
  - docs/STYLE.md
  - .specs/v8/features/claude-code-panel/spec.md
created: 2026-03-22
updated: 2026-03-22
assignee: ''
---

# 서버 상태 감시 + 멀티 클라이언트 동기화

## 개요

모든 탭(활성/비활성 Workspace 포함)의 Claude 실행 상태를 서버에서 중앙 감시하고, WebSocket으로 연결된 모든 클라이언트에 실시간 push하는 백엔드 엔진. 한 클라이언트에서 탭을 확인(방문)하면 다른 클라이언트에서도 `needs-attention`이 즉시 해제되는 멀티 클라이언트 동기화를 포함한다.

## 주요 기능

### 서버 상태 매니저

서버 메모리에 모든 탭의 Claude 상태를 유지하는 싱글턴 매니저.

- 저장 구조: `Map<tabId, ITabStatus>` — tmux 세션 기반
- `ITabStatus`: `{ cliState: TCliState, dismissed: boolean, workspaceId: string, tabName: string }`
- 탭 삭제/Workspace 삭제 시 해당 엔트리 정리
- 서버 재시작 시 전체 재감지 (영속 저장 없음)

### 하이브리드 감시 엔진

활성 탭과 비활성 탭을 다른 방식으로 감시한다.

- **활성 탭**: 기존 이벤트 기반 유지 — 클라이언트의 xterm `onTitleChange` + 타임라인 WebSocket으로 실시간 감지. 클라이언트가 상태 변경을 서버에 보고
- **비활성 탭**: 서버 사이드 폴링
  - 대상: 모든 Workspace의 모든 탭 (비활성 Workspace 포함)
  - 방법: `getPaneCurrentCommand()` → Claude 프로세스 확인, `detectActiveSession()` → 세션 상태 감지
  - 주기: 5~10초 (실시간 불필요, 부하 최소화)
  - 상태 변경 시에만 클라이언트에 push (동일 상태 재전송 방지)

### 상태 전이 로직

```
inactive ──(Claude 시작)──▶ busy ──(프롬프트 복귀)──▶ needs-attention ──(탭 방문)──▶ idle
                              ▲                                                        │
                              └────────────────(Claude 재실행)─────────────────────────┘
```

- `busy` → `needs-attention`: CLI가 `busy` → `idle` 전환 시, `dismissed`를 `false`로 설정
- `needs-attention` → `idle`: 클라이언트에서 `status:tab-dismissed` 수신 시, `dismissed`를 `true`로 설정
- `idle` → `busy`: Claude 재실행 감지 시, `dismissed` 초기화

### WebSocket 이벤트

글로벌 상태 전용 WebSocket 채널. 기존 타임라인 WebSocket(세션 1개 바인딩)과는 별도.

| 이벤트 | 방향 | 페이로드 | 설명 |
|---|---|---|---|
| `status:sync` | Server → Client | `{ tabs: Record<tabId, ITabStatus> }` | 초기 접속 시 전체 상태 전송 |
| `status:update` | Server → Client | `{ tabId, cliState, dismissed }` | 개별 탭 상태 변경 push |
| `status:tab-dismissed` | Client → Server | `{ tabId }` | 탭 방문 확인 |
| `status:tab-active-report` | Client → Server | `{ tabId, cliState }` | 활성 탭의 실시간 상태 보고 |

### 멀티 클라이언트 동기화

- 진실 공급원(source of truth): 서버의 `dismissed` 상태
- 클라이언트 A가 탭 방문 → `status:tab-dismissed` 전송 → 서버가 `dismissed: true` 설정 → 클라이언트 B에 `status:update` broadcast
- 새 클라이언트 접속 → `status:sync`로 현재 전체 상태 수신
- `busy`/`idle` 상태는 서버가 감시하므로 별도 클라이언트 간 동기화 불필요

### 클라이언트 상태 스토어

Zustand 기반 글로벌 스토어. 서버에서 push된 상태를 저장하고 UI 컴포넌트에 제공.

- 스토어명: `useClaudeStatusStore`
- 저장: `{ [tabId]: { cliState, dismissed } }`
- selector: 탭별 / Workspace별 / 전체 집계 조회
  - `getTabStatus(tabId)` → `busy` | `needs-attention` | `idle`
  - `getWorkspaceStatus(wsId)` → `{ busyCount, attentionCount }`
  - `getGlobalStatus()` → `{ busyCount, attentionCount }`
- 상태 변경된 탭만 리렌더 (Zustand selector 활용)
- WebSocket 연결 해제 시 재접속 + `status:sync` 재요청

### 폴링 성능 최적화

- tmux 명령 배치 호출: 탭 N개를 개별 호출하지 않고 `tmux list-panes` 등으로 일괄 조회
- 상태 diff: 이전 폴링 결과와 비교하여 변경분만 broadcast
- 탭 수가 많을 때 (20개+) 폴링 주기 자동 조절 (최대 15초)

### 에러 처리

- tmux 세션 소멸 시 → 해당 탭 상태를 `inactive`로 전환, 클라이언트에 push
- WebSocket 연결 끊김 → 클라이언트 자동 재접속, `status:sync`로 상태 복구
- 서버 재시작 → 전체 탭 재스캔, 모든 `dismissed` 초기화 (모든 탭 미확인 상태로 시작)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-22 | 초안 작성 | DRAFT |
