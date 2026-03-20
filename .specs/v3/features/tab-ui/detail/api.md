# API 연동

> 이 문서는 tab-ui(클라이언트)가 호출하는 API를 정의한다.

## 탭 관리 API 호출

### 탭 목록 조회

- `GET /api/tabs`
- 호출 시점: 페이지 로드 시 (마운트 직후)
- 응답 타입:
  ```typescript
  interface ITabListResponse {
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
- 에러 시: 재시도 UI 표시

### 탭 생성

- `POST /api/tabs`
- 호출 시점: + 버튼 클릭, 마지막 탭 삭제 후 자동 생성, 빈 탭 목록 시 초기 생성
- 요청: `{ name?: string }`
- 응답: `ITab` (생성된 탭 정보)
- 성공 후: 반환된 `sessionName`으로 WebSocket 연결

### 탭 삭제

- `DELETE /api/tabs/{tabId}`
- 호출 시점: × 버튼 클릭
- 응답: 204 No Content
- 성공 후: 탭 바에서 제거, 활성 탭이면 인접 탭 전환

### 탭 이름 변경

- `PATCH /api/tabs/{tabId}`
- 호출 시점: 인라인 편집 확정 (Enter/blur)
- 요청: `{ name: string }`
- 응답: 업데이트된 `ITab`

### 탭 순서 변경

- `PATCH /api/tabs/order`
- 호출 시점: 드래그 앤 드롭 완료
- 요청: `{ tabIds: string[] }` (새 순서)
- 응답: 업데이트된 `ITab[]`

### 활성 탭 저장

- `PATCH /api/tabs/active`
- 호출 시점: 탭 전환, 탭 생성 시
- 요청: `{ activeTabId: string }`
- 응답: 200 OK
- 디바운스: 빠른 연속 전환 시 마지막 것만 전송 (300ms)

## WebSocket 연결

### 엔드포인트

- 기존 세션 연결: `ws://localhost:{port}/api/terminal?session={sessionName}`
- 새 세션 생성: `ws://localhost:{port}/api/terminal` (탭 API 경유로 생성 후 연결하므로 실제로는 항상 `?session` 사용)

### 메시지 프로토콜 (변경 없음)

| 타입 | 방향 | 페이로드 |
|---|---|---|
| `0x00` | 클라이언트 → 서버 | stdin |
| `0x01` | 서버 → 클라이언트 | stdout |
| `0x02` | 클라이언트 → 서버 | resize (cols 2B + rows 2B) |
| `0x03` | 양방향 | heartbeat |

## 커스텀 훅

### `useTabs` (신규)

탭 상태 관리 훅:

```typescript
interface IUseTabs {
  tabs: ITab[];
  activeTabId: string | null;
  isLoading: boolean;
  createTab: () => Promise<void>;
  deleteTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => Promise<void>;
  reorderTabs: (tabIds: string[]) => Promise<void>;
}
```

- 페이지 로드 시 `GET /api/tabs` 자동 호출
- 각 mutation 후 로컬 상태 즉시 반영 (optimistic)
- 서버 실패 시 롤백

### `useTerminalWebSocket` (Phase 2 확장)

- `connect(sessionName: string)` — 특정 세션에 연결
- `disconnect()` — 현재 연결 해제 (detach)
- 탭 전환 시: `disconnect()` → `connect(newSession)`
- 자동 재연결 로직은 Phase 2와 동일 (지수 백오프, 최대 5회)

### `useTerminal` (변경 최소)

- `reset()` 메서드 추가 — 탭 전환 시 xterm.js 초기화
- 나머지 (ResizeObserver, addon-fit 등)는 Phase 2와 동일
