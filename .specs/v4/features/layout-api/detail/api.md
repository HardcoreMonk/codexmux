# API 연동

> 이 문서는 layout-api 서버의 REST API 엔드포인트 상세 스펙을 정의한다.

## 레이아웃 조회

### GET /api/layout

전체 레이아웃 트리를 반환한다.

- **엔드포인트**: `GET /api/layout`
- **파라미터**: 없음
- **응답 (200)**:
  ```typescript
  interface ILayoutResponse {
    root: TLayoutNode;
    focusedPaneId: string | null;
    updatedAt: string; // ISO 8601
  }
  ```
- **응답 (500)**: `{ error: string }` — layout.json 로드/파싱 실패
- **캐시**: 메모리 스토어에서 즉시 반환 (디스크 I/O 없음)
- **레이아웃 없을 시**: 기본 단일 Pane 자동 생성 후 반환

## 레이아웃 갱신

### PUT /api/layout

전체 레이아웃 트리를 갱신한다.

- **엔드포인트**: `PUT /api/layout`
- **요청 body**:
  ```typescript
  interface ILayoutUpdateRequest {
    root: TLayoutNode;
    focusedPaneId: string | null;
  }
  ```
- **유효성 검증**:
  | 규칙 | 실패 시 |
  |---|---|
  | split 노드는 정확히 2개 자식 | 400 `"split 노드는 2개 자식 필수"` |
  | pane 노드는 tabs 배열 보유 | 400 `"pane 노드에 tabs 필드 필수"` |
  | 리프 노드(pane) 수 ≤ 3 | 400 `"최대 Pane 수(3개) 초과"` |
  | 탭 ID 고유 | 400 `"중복 탭 ID"` |
  | Pane ID 고유 | 400 `"중복 Pane ID"` |
  | focusedPaneId가 실제 Pane 참조 | 400 `"유효하지 않은 focusedPaneId"` |
- **응답 (200)**: 저장된 `ILayoutResponse` (`updatedAt` 갱신)
- **응답 (400)**: `{ error: string }` — 유효성 검증 실패
- **저장**: 메모리 스토어 즉시 갱신 + layout.json 디바운스 쓰기 (300ms)

## Pane 생성

### POST /api/layout/pane

새 Pane과 첫 탭을 생성한다. (분할 시 호출)

- **엔드포인트**: `POST /api/layout/pane`
- **요청 body**:
  ```typescript
  interface ICreatePaneRequest {
    cwd?: string; // 새 tmux 세션의 시작 디렉토리
  }
  ```
- **서버 동작**:
  1. `paneId` = `"pane-{nanoid(6)}"`
  2. `tabId` = `"tab-{nanoid(6)}"`
  3. `sessionName` = `"pt-{nanoid(6)}-{nanoid(6)}-{nanoid(6)}"`
  4. tmux 세션 생성: `tmux -L purple new-session -d -s {sessionName} -x 80 -y 24 [-c {cwd}]`
- **응답 (200)**:
  ```typescript
  interface ICreatePaneResponse {
    paneId: string;
    tab: ITab;
  }
  ```
- **응답 (500)**: `{ error: string }` — tmux 세션 생성 실패

## CWD 조회

### GET /api/layout/cwd

tmux 세션의 현재 작업 디렉토리를 조회한다.

- **엔드포인트**: `GET /api/layout/cwd?session={sessionName}`
- **파라미터**: `session` (query, 필수) — tmux 세션 이름
- **서버 동작**: `tmux -L purple display-message -p -t {session} '#{pane_current_path}'`
- **응답 (200)**: `{ cwd: string }`
- **응답 (404)**: `{ error: "세션을 찾을 수 없습니다" }` — 세션 없음
- **응답 (500)**: `{ error: string }` — tmux 명령 실패

## Pane 닫기

### DELETE /api/layout/pane/{paneId}

Pane의 모든 탭과 tmux 세션을 종료한다.

- **엔드포인트**: `DELETE /api/layout/pane/{paneId}`
- **파라미터**: `paneId` (path, 필수)
- **서버 동작**:
  1. 메모리 스토어에서 해당 Pane의 탭 목록 조회
  2. 각 탭의 tmux 세션: `tmux -L purple kill-session -t {sessionName}`
  3. 해당 세션에 활성 WebSocket이 있으면 close code 1000 전송
- **응답 (204)**: No Content
- **응답 (404)**: `{ error: "Pane을 찾을 수 없습니다" }`
- **참고**: 클라이언트는 DELETE 후 트리에서 Pane을 제거한 뒤 `PUT /api/layout`으로 트리 갱신

## Pane 내 탭 생성

### POST /api/layout/pane/{paneId}/tabs

Pane에 새 탭을 추가한다.

- **엔드포인트**: `POST /api/layout/pane/{paneId}/tabs`
- **요청 body**: `{ name?: string }` (미지정 시 "Terminal {N}")
- **서버 동작**:
  1. 새 tmux 세션 생성
  2. 메모리 스토어의 해당 Pane에 탭 추가
  3. layout.json 저장 (디바운스)
- **응답 (200)**: 생성된 `ITab`
- **응답 (404)**: `{ error: "Pane을 찾을 수 없습니다" }`
- **응답 (500)**: `{ error: string }` — tmux 세션 생성 실패

## Pane 내 탭 삭제

### DELETE /api/layout/pane/{paneId}/tabs/{tabId}

Pane의 탭을 삭제한다.

- **엔드포인트**: `DELETE /api/layout/pane/{paneId}/tabs/{tabId}`
- **서버 동작**:
  1. 해당 탭의 tmux 세션 kill
  2. 메모리 스토어에서 탭 제거
  3. layout.json 저장 (디바운스)
- **응답 (204)**: No Content
- **응답 (404)**: `{ error: "탭을 찾을 수 없습니다" }`

## Pane 내 탭 이름 변경

### PATCH /api/layout/pane/{paneId}/tabs/{tabId}

탭 이름을 변경한다.

- **엔드포인트**: `PATCH /api/layout/pane/{paneId}/tabs/{tabId}`
- **요청 body**: `{ name: string }`
- **서버 동작**:
  1. 메모리 스토어에서 탭 이름 갱신
  2. layout.json 저장 (디바운스)
- **응답 (200)**: 업데이트된 `ITab`
- **응답 (404)**: `{ error: "탭을 찾을 수 없습니다" }`

## Phase 3 호환 API

### GET /api/tabs (하위 호환 어댑터)

- layout.json의 첫 번째 Pane의 탭 목록을 반환
- 응답 형식: Phase 3과 동일한 `{ tabs: ITab[], activeTabId: string | null }`
- `/api/layout` 안정화 후 deprecated 예정

## 타입 정의 요약

```typescript
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

interface ILayoutResponse {
  root: TLayoutNode;
  focusedPaneId: string | null;
  updatedAt: string;
}
```

## 에러 응답 형식

모든 에러 응답은 동일한 형식:

```typescript
interface IErrorResponse {
  error: string;
}
```

| HTTP 상태 | 의미 |
|---|---|
| 400 | 유효성 검증 실패 (클라이언트 요청 오류) |
| 404 | 리소스 미존재 (Pane/탭/세션) |
| 500 | 서버 내부 오류 (tmux 실패, 파일 I/O 실패) |
