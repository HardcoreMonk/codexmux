# API 연동

> 이 문서는 tab-api의 서버 구현 관점에서의 REST API 스펙을 정의한다.

## 파일 구조

| 파일 | 역할 | 신규/변경 |
|---|---|---|
| `src/pages/api/tabs/index.ts` | GET (목록 조회), POST (생성) | 신규 |
| `src/pages/api/tabs/[id].ts` | DELETE (삭제), PATCH (이름 변경) | 신규 |
| `src/pages/api/tabs/order.ts` | PATCH (순서 변경) | 신규 |
| `src/pages/api/tabs/active.ts` | PATCH (활성 탭 저장) | 신규 |
| `src/lib/tab-store.ts` | tabs.json 읽기/쓰기, 인메모리 상태, 정합성 체크 | 신규 |

## API 엔드포인트 상세

### GET /api/tabs

탭 목록 조회.

- 파라미터: 없음
- 응답 200:
  ```typescript
  interface ITabListResponse {
    tabs: ITab[];
    activeTabId: string | null;
  }
  ```
- 에러: 500 (tabs.json 읽기 실패 등)

### POST /api/tabs

새 탭 생성.

- 요청:
  ```typescript
  interface ICreateTabRequest {
    name?: string; // 미지정 시 "Terminal {N}"
  }
  ```
- 서버 동작:
  1. nanoid로 탭 ID 생성
  2. nanoid로 세션 이름 생성 (`pt-{w}-{p}-{s}`)
  3. `tmux -L purple new-session -d -s {name} -x 80 -y 24 -f {configPath}`
  4. 탭 목록에 추가
  5. tabs.json 저장
- 응답 201:
  ```typescript
  interface ITab {
    id: string;
    sessionName: string;
    name: string;
    order: number;
  }
  ```
- 에러:
  - 500: tmux 세션 생성 실패

### DELETE /api/tabs/[id]

탭 삭제.

- 파라미터: `id` (URL path)
- 서버 동작:
  1. 탭 찾기
  2. `tmux -L purple kill-session -t {sessionName}`
  3. 탭 목록에서 제거
  4. tabs.json 저장
- 응답: 204 No Content
- 에러:
  - 404: 탭 미존재

### PATCH /api/tabs/[id]

탭 이름 변경.

- 파라미터: `id` (URL path)
- 요청:
  ```typescript
  interface IUpdateTabRequest {
    name: string;
  }
  ```
- 서버 동작:
  1. 탭 찾기
  2. 이름 업데이트
  3. tabs.json 저장
- 응답 200: 업데이트된 `ITab`
- 에러:
  - 404: 탭 미존재
  - 400: 빈 이름

### PATCH /api/tabs/order

탭 순서 변경.

- 요청:
  ```typescript
  interface IReorderTabsRequest {
    tabIds: string[]; // 새 순서대로
  }
  ```
- 서버 동작:
  1. tabIds 검증 (기존 탭 ID와 일치 여부)
  2. order 재할당
  3. tabs.json 저장
- 응답 200: 업데이트된 `ITab[]`
- 에러:
  - 400: tabIds가 기존 탭과 불일치

### PATCH /api/tabs/active

활성 탭 저장.

- 요청:
  ```typescript
  interface ISetActiveTabRequest {
    activeTabId: string;
  }
  ```
- 서버 동작:
  1. activeTabId 업데이트 (탭 존재 여부 미확인 — 삭제 직후 race condition 방지)
  2. tabs.json 저장
- 응답: 200 OK

## tab-store 모듈 (`src/lib/tab-store.ts`)

### 타입 정의

```typescript
interface ITab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
}

interface ITabStore {
  tabs: ITab[];
  activeTabId: string | null;
}
```

### 주요 함수

| 함수 | 설명 |
|---|---|
| `initTabStore()` | tabs.json 로드 + tmux 크로스 체크. 서버 시작 시 1회 호출 |
| `getTabs()` | 현재 탭 목록 반환 (인메모리) |
| `addTab(name?: string)` | 새 탭 생성 + tmux 세션 생성 + tabs.json 저장 |
| `removeTab(tabId: string)` | 탭 삭제 + tmux kill + tabs.json 저장 |
| `removeTabBySession(sessionName: string)` | 세션 이름으로 탭 삭제 (exit 시 사용) |
| `renameTab(tabId: string, name: string)` | 이름 변경 + tabs.json 저장 |
| `reorderTabs(tabIds: string[])` | 순서 변경 + tabs.json 저장 |
| `setActiveTab(tabId: string)` | 활성 탭 업데이트 + tabs.json 저장 |
| `flushToDisk()` | 디바운스 무시, 즉시 저장 (graceful shutdown 시) |

### 저장 전략

```typescript
const TABS_FILE = path.join(os.homedir(), '.purple-terminal', 'tabs.json');
const SAVE_DEBOUNCE = 300; // ms

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(TABS_FILE, JSON.stringify(store, null, 2));
  }, SAVE_DEBOUNCE);
};

const flushToDisk = async () => {
  if (saveTimer) clearTimeout(saveTimer);
  await fs.writeFile(TABS_FILE, JSON.stringify(store, null, 2));
};
```

### 정합성 체크

```typescript
const syncWithTmux = async () => {
  const tmuxSessions = await listSessions(); // tmux -L purple ls
  const tabSessions = new Set(store.tabs.map(t => t.sessionName));

  // stale 탭 제거
  store.tabs = store.tabs.filter(tab => tmuxSessions.includes(tab.sessionName));

  // orphan 복구
  for (const session of tmuxSessions) {
    if (!tabSessions.has(session)) {
      store.tabs.push({
        id: `tab-${nanoid(6)}`,
        sessionName: session,
        name: `Recovered ${store.tabs.length + 1}`,
        order: store.tabs.length,
      });
    }
  }
};
```

## 의존성

| 패키지 | 용도 | 신규 |
|---|---|---|
| `nanoid` | 탭 ID, 세션 이름 생성 | Phase 2에서 추가됨 |
| `fs/promises` | tabs.json 읽기/쓰기 | Node.js 내장 |
| `path`, `os` | 저장 경로 생성 | Node.js 내장 |
