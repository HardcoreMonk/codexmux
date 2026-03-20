# API 연동

> 이 문서는 workspace-ui(클라이언트)가 호출하는 API를 정의한다.

## Workspace API 호출

### Workspace 목록 조회

- `GET /api/workspace`
- 호출 시점: 페이지 로드 시 (마운트 직후)
- 응답 타입:
  ```typescript
  interface IWorkspaceListResponse {
    workspaces: IWorkspace[];
    activeWorkspaceId: string | null;
    sidebarCollapsed: boolean;
    sidebarWidth: number;
  }
  interface IWorkspace {
    id: string;
    name: string;
    directory: string;
    order: number;
  }
  ```
- 에러 시: 사이드바 에러 UI + 재시도

### Workspace 생성

- `POST /api/workspace`
- 호출 시점: 생성 다이얼로그에서 "추가" 클릭
- 요청: `{ directory: string, name?: string }`
- 응답: `IWorkspace`
- 성공 후: 사이드바에 추가 + Workspace 전환 트리거

### Workspace 삭제

- `DELETE /api/workspace/{workspaceId}`
- 호출 시점: 컨텍스트 메뉴 → "삭제" → 확인
- 응답: 204 No Content
- 성공 후: 사이드바에서 제거 + 필요 시 인접 전환

### Workspace 이름 변경

- `PATCH /api/workspace/{workspaceId}`
- 호출 시점: 인라인 편집 확정 (Enter/blur)
- 요청: `{ name: string }`
- 응답: 업데이트된 `IWorkspace`

### 활성 Workspace + 사이드바 상태 저장

- `PATCH /api/workspace/active`
- 호출 시점: Workspace 전환, 사이드바 접기/펼치기, 리사이즈 완료
- 요청: `{ activeWorkspaceId?: string, sidebarCollapsed?: boolean, sidebarWidth?: number }`
- 응답: 200 OK
- **디바운스**: 300ms — 빠른 연속 변경 시 마지막 것만 전송

### 디렉토리 유효성 검증

- `GET /api/workspace/validate?directory={path}`
- 호출 시점: 생성 다이얼로그에서 경로 입력 중 (디바운스 300ms)
- 응답: `{ valid: boolean, error?: string, suggestedName?: string }`
- `suggestedName`: 유효 시 디렉토리명 추출 결과

## 레이아웃 API 호출 (Workspace 스코프)

### Workspace별 레이아웃 조회

- `GET /api/layout?workspace={workspaceId}`
- 호출 시점: Workspace 전환 시, 페이지 로드 시
- 응답: Phase 4 `ILayoutResponse`와 동일
- `workspace` 미지정 시 활성 Workspace (Phase 4 하위 호환)

### Workspace별 레이아웃 갱신

- `PUT /api/layout?workspace={workspaceId}`
- 호출 시점: Pane 분할/닫기/리사이즈/탭 변경 후, Workspace 전환 전 저장
- Phase 4와 동일한 요청/응답 + `workspace` 파라미터 추가
- Workspace 전환 전 저장: fire-and-forget (응답 대기 안 함)

### Pane/탭 관리 API

- Phase 4의 `/api/layout/pane`, `/api/layout/cwd`, `/api/layout/pane/{id}/tabs` 등
- 모든 호출에 `?workspace={workspaceId}` 추가
- 동작은 Phase 4와 동일, Workspace 스코프만 적용

## WebSocket 연결

### 엔드포인트 (변경 없음)

- `ws://localhost:{port}/api/terminal?clientId={clientId}&session={sessionName}`
- 활성 Workspace의 Pane만 WebSocket 연결 유지

### Workspace 전환 시 WebSocket 관리

| 동작 | 현재 Workspace | 대상 Workspace |
|---|---|---|
| 전환 시작 | 모든 WebSocket close (detach) | — |
| 레이아웃 로드 | — | Pane별 xterm.js 생성 |
| 연결 | — | 각 Pane의 활성 탭에 WebSocket 연결 (병렬) |
| 연결 완료 | — | 포커스 Pane에 focus() |

- 비활성 Workspace의 WebSocket은 0개 (tmux 세션만 유지)
- 활성 Workspace의 WebSocket은 Pane 수만큼 (최대 3개)

## 커스텀 훅

### `useWorkspace` (신규)

Workspace 상태 관리:

```typescript
interface IUseWorkspace {
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  isLoading: boolean;
  error: string | null;
  createWorkspace: (directory: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  validateDirectory: (directory: string) => Promise<IValidateResponse>;
}
```

- 페이지 로드 시 `GET /api/workspace` 자동 호출
- `switchWorkspace`: 레이아웃 저장 → 리소스 해제 → 대상 로드 → 연결
- `toggleSidebar` / `setSidebarWidth`: 즉시 UI 반영 + 서버 저장 (디바운스)

### `useLayout` (Phase 4 확장)

- Workspace ID를 파라미터로 받아 해당 Workspace의 레이아웃 관리
- `switchWorkspace` 시 `workspaceId`가 변경되면 레이아웃 재로드

### Phase 4 훅 재활용

- `usePaneTabs`, `useTerminalWebSocket`, `useTerminal` — Phase 4와 동일
- Workspace 전환 시 모든 인스턴스를 dispose 후 새로 생성
