# API 연동

> 이 문서는 pane-layout(클라이언트)이 호출하는 API를 정의한다.

## 레이아웃 API 호출

### 레이아웃 조회

- `GET /api/layout`
- 호출 시점: 페이지 로드 시 (마운트 직후)
- 응답 타입:
  ```typescript
  interface ILayoutResponse {
    root: TLayoutNode;
    focusedPaneId: string | null;
    updatedAt: string;
  }

  type TLayoutNode = ISplitNode | IPaneNode;

  interface ISplitNode {
    type: 'split';
    orientation: 'horizontal' | 'vertical';
    ratio: number;
    children: [TLayoutNode, TLayoutNode];
  }

  interface IPaneNode {
    type: 'pane';
    id: string;
    tabs: ITab[];
    activeTabId: string | null;
  }

  interface ITab {
    id: string;
    sessionName: string;
    name: string;
    order: number;
  }
  ```
- 에러 시: 재시도 UI → 반복 실패 시 기본 단일 Pane 폴백

### 레이아웃 업데이트

- `PUT /api/layout`
- 호출 시점: 분할/닫기/리사이즈/탭 변경 후
- 요청: `ILayoutResponse` (전체 트리)
- 응답: 200 + 저장된 `ILayoutResponse`
- **디바운스**: 빠른 연속 변경 시 마지막 것만 전송 (300ms)
- 리사이즈 중 비율 변경은 드래그 종료 후 1회만 전송

### 새 Pane 생성 (분할)

- `POST /api/layout/pane`
- 호출 시점: 분할 버튼 클릭 시
- 요청: `{ cwd?: string }`
- 응답:
  ```typescript
  interface ICreatePaneResponse {
    paneId: string;
    tab: ITab;
  }
  ```
- 성공 후: 클라이언트가 트리에 삽입 → `PUT /api/layout`

### CWD 조회

- `GET /api/layout/cwd?session={sessionName}`
- 호출 시점: 분할 직전 (현재 활성 세션의 CWD)
- 응답: `{ cwd: string }`
- 실패 시: 홈 디렉토리 폴백 (분할은 진행)

### Pane 닫기

- `DELETE /api/layout/pane/{paneId}`
- 호출 시점: Pane × 버튼 클릭, 빈 Pane 자동 닫기
- 응답: 204 No Content
- 성공 후: 클라이언트가 트리에서 제거 → `PUT /api/layout`

## Pane 내 탭 관리 API

### 탭 생성

- `POST /api/layout/pane/{paneId}/tabs`
- 호출 시점: Pane 내 + 버튼 클릭, 마지막 탭 삭제 후 자동 생성
- 요청: `{ name?: string }`
- 응답: `ITab`
- 성공 후: `PUT /api/layout` (새 탭 추가된 트리)

### 탭 삭제

- `DELETE /api/layout/pane/{paneId}/tabs/{tabId}`
- 호출 시점: 탭 × 버튼 클릭
- 응답: 204 No Content
- 성공 후: `PUT /api/layout`

### 탭 이름 변경

- `PATCH /api/layout/pane/{paneId}/tabs/{tabId}`
- 호출 시점: 인라인 편집 확정 (Enter/blur)
- 요청: `{ name: string }`
- 응답: 업데이트된 `ITab`
- 성공 후: `PUT /api/layout`

## WebSocket 연결

### 엔드포인트 (변경 없음)

- `ws://localhost:{port}/api/terminal?clientId={clientId}&session={sessionName}`
- 각 Pane이 고유한 `clientId`를 생성하여 독립 연결

### 메시지 프로토콜 (변경 없음)

| 타입 | 방향 | 페이로드 |
|---|---|---|
| `0x00` | 클라이언트 → 서버 | stdin |
| `0x01` | 서버 → 클라이언트 | stdout |
| `0x02` | 클라이언트 → 서버 | resize (cols 2B + rows 2B) |
| `0x03` | 양방향 | heartbeat |
| `0x04` | 클라이언트 → 서버 | kill session |

### 다중 Pane WebSocket 관리

- 최대 3개 동시 WebSocket 연결 (Pane당 1개)
- 각 Pane이 독립적으로 연결/해제 관리
- 탭 전환 시: 해당 Pane의 WebSocket만 교체 (다른 Pane 영향 없음)
- Pane 닫기 시: 해당 Pane의 WebSocket close (서버: detaching → tmux detach)

## 커스텀 훅

### `useLayout` (신규)

레이아웃 트리 상태 관리:

```typescript
interface IUseLayout {
  layout: ILayoutResponse | null;
  isLoading: boolean;
  error: string | null;
  splitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => Promise<void>;
  closePane: (paneId: string) => Promise<void>;
  updateRatio: (splitNodePath: string, ratio: number) => void;
  moveTab: (tabId: string, fromPaneId: string, toPaneId: string, toIndex: number) => void;
  focusPane: (paneId: string) => void;
  paneCount: number;
  canSplit: boolean;
}
```

- 페이지 로드 시 `GET /api/layout` 자동 호출
- 트리 조작 후 `PUT /api/layout` 디바운스 전송
- `canSplit`: `paneCount < 3 && 현재 Pane 크기 >= 최소 × 2`

### `usePaneTabs` (신규 — Pane별 탭 관리)

Phase 3 `useTabs`를 Pane 단위로 분리:

```typescript
interface IUsePaneTabs {
  tabs: ITab[];
  activeTabId: string | null;
  createTab: () => Promise<void>;
  deleteTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => Promise<void>;
  reorderTabs: (tabIds: string[]) => void;
}
```

- `paneId`를 파라미터로 받아 해당 Pane의 탭만 관리
- 각 mutation 후 `useLayout`의 트리를 갱신

### `useTerminalWebSocket` (Phase 2/3 재활용)

- Pane별로 독립 인스턴스 생성 (각 Pane이 자체 `clientId` 보유)
- `connect(sessionName)` / `disconnect()` 인터페이스 동일
- Phase 3과 동일한 재연결 로직 (지수 백오프, 최대 5회)

### `useTerminal` (Phase 2/3 재활용)

- Pane별로 독립 인스턴스 생성
- `reset()`, `fit()`, `focus()`, `dispose()` 메서드
- Pane 닫기 시 `dispose()` 호출하여 xterm.js 리소스 해제
