# Phase 6 — 레이아웃 영속성 PRD

## 목표

서버 재시작 시 전체 레이아웃을 복원하는 것.

Phase 5에서 Workspace별 레이아웃 저장/로드 인프라를 구축했다. Phase 6에서는 이를 기반으로 **서버를 껐다 켜도 모든 Workspace의 레이아웃과 터미널이 그대로 복원**되는 완전한 영속성을 보장한다.

## 완료 조건

서버를 껐다 켜도 모든 Workspace의 레이아웃과 터미널이 그대로 복원된다. 사용자가 별도의 조작 없이 이전 작업 상태 그대로 돌아올 수 있다.

---

## 현재 상태 (Phase 5 완료)

### 이미 구현된 것

- `~/.purple-terminal/workspaces.json` — Workspace 목록, 활성 Workspace ID, 사이드바 상태 저장
- `~/.purple-terminal/workspaces/{workspaceId}/layout.json` — Workspace별 Pane/Surface 트리 저장
- 서버 시작 시 `initWorkspaceStore()` → workspaces.json + 각 layout.json 로드
- tmux 세션 크로스 체크 (`crossCheckLayout()`) — layout과 실제 tmux 세션 불일치 자동 보정
- Graceful shutdown 시 `flushWorkspaceStore()` 호출
- 브라우저 → `/api/workspace` + `/api/layout` fetch로 상태 복원
- Phase 4 → Phase 5 마이그레이션 (layout.json → default Workspace)

### Phase 6에서 보강할 것

- **메모리 캐시 제거** — 현재 `workspace-store.ts`가 메모리에 상태를 들고 디바운스 후 파일에 쓰는 구조. 파일을 단일 진실 원천(source of truth)으로 전환
- 모든 변경 시 **즉시 파일 저장** (메모리 → 파일 동기화 지연 제거)
- 서버 재시작 시 **완전한 복원 보장** (tmux 세션 + 레이아웃 + UI 상태)
- **에지 케이스 처리** (파일 손상, tmux 세션 외부 종료 등)

---

## 요구사항

### REQ-1: 파일 기반 즉시 저장 (메모리 캐시 제거)

서버의 상태 저장을 메모리 캐시에서 파일 직접 읽기/쓰기로 전환한다.

- **현재 문제**: `workspace-store.ts`가 `let store` 변수에 메모리 캐시를 유지하고 `scheduleWrite()`로 300ms 디바운스 후 파일에 씀. 서버 비정상 종료 시 메모리와 파일 간 불일치 발생 가능
- **변경 방향**: 파일을 단일 진실 원천(source of truth)으로 사용. 모든 변경은 즉시 파일에 쓰고, 읽기도 파일에서 직접 수행
- Workspace CRUD (생성/삭제/이름 변경), 활성 Workspace 변경, 사이드바 상태 변경 시 즉시 `workspaces.json`에 저장
- 레이아웃 변경 (Pane 분할/삭제, 탭 추가/삭제/이동, 포커스 변경) 시 즉시 `layout.json`에 저장
- 파일 쓰기는 원자적 (tmp → rename) — 쓰기 중 크래시 시 파일 손상 방지
- 저장 실패 시 다음 변경 시점에 재시도 (사용자에게 에러 노출하지 않음)

### REQ-2: 서버 시작 시 전체 복원

서버 시작 시 파일에서 상태를 로드하여 이전 작업 환경을 완전히 복원한다.

- 서버 시작 시:
  1. `workspaces.json` 로드 → Workspace 목록, 활성 Workspace ID, 사이드바 상태 복원
  2. 각 Workspace의 `layout.json` 로드 → Pane/Surface 트리 복원
  3. tmux 세션 탐색 (`tmux list-sessions`) → 각 Workspace의 세션과 layout 크로스 체크
  4. 불일치 발생 시 자동 보정 (존재하지 않는 세션 참조 제거, 고아 세션 레이아웃에 추가)
- 브라우저 접속 시:
  1. `/api/workspace` → 마지막 활성 Workspace + 사이드바 상태 복원
  2. `/api/layout?workspace={activeWsId}` → 활성 Workspace의 Pane 트리 복원
  3. 각 Pane의 활성 탭 세션에 WebSocket 자동 연결
  4. 포커스 Pane 복원

### REQ-3: 서버 종료 시 상태 보존

서버 종료 시 별도의 flush 작업 없이 상태가 보존된다.

- 모든 변경이 즉시 파일에 저장되므로 종료 시 추가 저장 불필요
- SIGTERM, SIGINT 수신 시:
  1. 모든 WebSocket 연결을 정리 (tmux detach, 세션은 유지)
  2. 프로세스 종료
- tmux 세션은 서버 종료 시 kill하지 않음 (tmux 특성상 독립 실행 유지)
- 비정상 종료 (kill -9, 크래시) 시에도 파일에 이미 최신 상태가 반영되어 있으므로 데이터 손실 없음

### REQ-4: 브라우저 새로고침 시 상태 복원

브라우저 새로고침 후에도 동일한 작업 상태가 복원된다.

- 새로고침 시 복원되는 상태:
  - 활성 Workspace + Workspace 목록
  - 활성 Workspace의 Pane 트리 (분할 구조, 비율)
  - 각 Pane의 탭 목록 + 활성 탭
  - 포커스 Pane
  - 사이드바 접기/펼치기 상태 + 너비
- 새로고침 시 각 Pane의 활성 탭에 WebSocket 재연결 → tmux 세션에 attach
- 비활성 Workspace의 tmux 세션은 백그라운드 유지

### REQ-5: 저장 구조

`~/.purple-terminal/` 하위에 JSON 파일로 전체 상태를 관리한다.

- **저장 구조**:
  ```
  ~/.purple-terminal/
  ├── workspaces.json                          ← Workspace 목록 + 메타데이터
  └── workspaces/
      ├── {workspaceId}/
      │   └── layout.json                     ← Pane/Surface 트리 + tmux 세션 매핑
      └── {workspaceId2}/
          └── layout.json
  ```
- **workspaces.json 구조**:
  ```json
  {
    "workspaces": [
      { "id": "ws-abc123", "name": "my-app", "directory": "/path/to/my-app", "order": 0 }
    ],
    "activeWorkspaceId": "ws-abc123",
    "sidebarCollapsed": false,
    "sidebarWidth": 200,
    "updatedAt": "2026-03-20T10:00:00.000Z"
  }
  ```
- **layout.json 구조**: Phase 4/5의 트리 구조와 동일 (split/pane 노드 + 탭 + tmux 세션 매핑)
- 파일 쓰기는 원자적 (tmp 파일 → rename) — 쓰기 중 크래시 시 파일 손상 방지
- 파일 읽기 실패(파싱 에러) 시 `.bak` 파일로 백업 후 기본값 생성

### REQ-6: tmux 세션 크로스 체크

서버 시작 시 layout 파일과 실제 tmux 세션의 일치를 검증하고 자동 보정한다.

- 서버 시작 시 `tmux -L purple list-sessions`로 전체 세션 스캔
- 각 Workspace별로 세션을 그룹핑 (`pt-{workspaceId}-*` 패턴)
- **layout에는 있지만 tmux에 없는 세션**: layout에서 해당 탭 제거
- **tmux에는 있지만 layout에 없는 세션**: 해당 Workspace의 첫 번째 Pane에 탭으로 추가
- **Workspace가 없는 고아 tmux 세션**: 해당 세션 kill (또는 무시)
- 보정 후 변경된 layout.json 자동 저장
- Pane의 모든 탭이 제거된 경우 기본 탭 재생성

---

## 비기능 요구사항

### NFR-1: 복원 신뢰성

서버 재시작, 브라우저 새로고침, 네트워크 일시 단절 등 모든 시나리오에서 마지막 저장 상태로 안정적으로 복원되어야 한다.

### NFR-2: 저장 성능

파일 즉시 저장이 UI 응답성에 영향을 주지 않아야 한다. 서버 측 파일 쓰기는 비동기로 처리하되, API 응답은 저장 완료 후 반환한다.

### NFR-3: 데이터 안전성

파일 쓰기 중 크래시가 발생해도 이전 데이터가 손상되지 않아야 한다. 원자적 쓰기(tmp → rename) 사용. 파싱 실패 시 백업 파일 생성.

### NFR-4: Phase 5 호환

Phase 5에서 구축한 저장 구조(`workspaces.json`, Workspace별 `layout.json`)를 그대로 사용한다. 기존 API 인터페이스 변경 없음.

### NFR-5: 백그라운드 세션 연속성

서버 재시작 전후로 tmux 세션이 중단 없이 유지되어야 한다. 서버 종료 시 tmux 세션을 kill하지 않는다.

---

## 범위 제외 (Phase 6에서 하지 않는 것)

| 항목 | 담당 Phase |
|---|---|
| 전체 단축키 체계 (cmux 호환) | Phase 7 |
| Claude Code 연동 (타임라인 + 세션 파싱) | Phase 8 |
| Claude Code 세션 탐색 (과거 세션 resume) | Phase 9 |
| 터미널 스크롤백 내용 저장 | 추후 (tmux 자체 기능에 위임) |
| Workspace 간 탭/Pane 이동 | 추후 |
| 동시 접속 동기화 | 추후 |
| 인증/보안 | 추후 |

---

## 기술 구성

### 영속성 라이프사이클

```
서버 시작
├── workspaces.json 로드 → Workspace 목록 복원
├── 각 Workspace의 layout.json 로드 → Pane/Surface 트리 복원
├── tmux list-sessions → 세션 크로스 체크 + 자동 보정
└── 준비 완료 (브라우저 접속 대기)

브라우저 접속/새로고침
├── GET /api/workspace → 활성 Workspace + 사이드바 상태
├── GET /api/layout?workspace={wsId} → Pane 트리 렌더링
├── 각 Pane의 활성 탭 → WebSocket 연결 → tmux attach
└── 포커스 Pane 복원

레이아웃 변경
├── 클라이언트 UI 즉시 반영 (optimistic update)
├── PUT /api/layout → layout.json 즉시 저장 (atomic write)
└── Workspace 메타 변경 → PATCH /api/workspace/active → workspaces.json 즉시 저장

서버 종료
├── 추가 저장 불필요 (모든 변경이 이미 파일에 반영)
├── WebSocket 연결 정리 (tmux detach)
└── tmux 세션은 그대로 유지
```

### 상태 저장 매핑

| 대상 | 저장 방식 | 복원 방법 |
|---|---|---|
| Workspace 목록 + 메타데이터 | `workspaces.json` | 서버 시작 시 파일 로드 |
| Pane/Surface 레이아웃 | `workspaces/{id}/layout.json` | 서버 시작 시 파일 로드 → 크로스 체크 |
| Terminal 세션 | tmux 세션 (독립 프로세스) | tmux 세션에 WebSocket 재연결 |
| 사이드바 상태 | `workspaces.json` 내 필드 | 서버 시작 시 파일 로드 |
| 포커스 Pane | `layout.json` 내 `focusedPaneId` | 브라우저 접속 시 복원 |

---

## 검증 시나리오

1. **서버 재시작 복원**: 서버 종료 → 재시작 → 브라우저 접속 시 이전 Workspace 목록 + 활성 Workspace + Pane 레이아웃 + 탭이 모두 복원된다
2. **터미널 세션 유지**: 서버 재시작 전 실행 중이던 프로세스가 재시작 후에도 tmux 세션에서 계속 실행 중이다
3. **브라우저 새로고침**: 새로고침 후 동일한 Workspace, 동일한 Pane 분할, 동일한 탭 구조가 복원된다
4. **사이드바 상태 복원**: 사이드바 접기/너비 설정이 서버 재시작/새로고침 후에도 유지된다
5. **포커스 복원**: 서버 재시작/새로고침 후 마지막으로 포커스된 Pane에 커서가 위치한다
6. **레이아웃 즉시 저장**: Pane 분할/탭 추가 등 레이아웃 변경 시 즉시 파일에 반영된다
7. **비정상 종료 복원**: `kill -9`로 서버를 강제 종료 → 재시작 시 마지막 자동 저장 시점의 상태로 복원된다
8. **tmux 세션 크로스 체크 (세션 누락)**: 서버 종료 중 tmux 세션이 외부에서 종료된 경우 → 재시작 시 해당 탭이 layout에서 자동 제거된다
9. **tmux 세션 크로스 체크 (고아 세션)**: layout에 없는 tmux 세션이 존재할 경우 → 해당 Workspace의 Pane에 탭으로 자동 추가된다
10. **다중 Workspace 복원**: 3개 이상의 Workspace가 있을 때 서버 재시작 후 모든 Workspace의 레이아웃이 각각 올바르게 복원된다
11. **파일 손상 복구**: layout.json이 손상된 경우(파싱 에러) → `.bak` 파일로 백업 후 기본 레이아웃으로 복구된다
12. **Graceful Shutdown**: SIGTERM 시 추가 저장 없이 바로 종료해도 데이터 손실이 없다

---

## 확정된 결정사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 저장 구조 | Phase 5와 동일 (`workspaces.json` + Workspace별 `layout.json`) | 기존 인프라 활용, 변경 최소화 |
| 파일 쓰기 방식 | 원자적 쓰기 (tmp → rename) | 크래시 시 데이터 안전성 보장 |
| 저장 방식 | 메모리 캐시 제거, 파일 직접 읽기/쓰기 | 파일이 단일 진실 원천, 비정상 종료에도 데이터 안전 |
| 서버 종료 시 tmux | 세션 유지 (kill하지 않음) | tmux 특성 활용, 세션 영속성 |
| 복원 트리거 | 브라우저 접속 시 API fetch → 렌더링 | SSR이 아닌 CSR 기반 복원 |
| 크로스 체크 시점 | 서버 시작 시 1회 | 런타임 중에는 API 요청 시 개별 검증 |
