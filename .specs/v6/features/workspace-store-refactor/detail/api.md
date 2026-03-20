# API 연동

## 개요

API 엔드포인트와 응답 구조는 변경 없음. 내부 store 구현만 메모리 캐시 → 파일 직접 읽기/쓰기로 전환.

## workspace-store.ts 함수 시그니처 변경

### 읽기 함수 (동기 → 비동기 전환)

| Phase 5 (현재) | Phase 6 (변경) |
|---|---|
| `getWorkspaces(): {...}` (동기, 메모리) | `getWorkspaces(): Promise<{...}>` (비동기, 파일) |
| `getActiveWorkspaceId(): string \| null` (동기) | `getActiveWorkspaceId(): Promise<string \| null>` (비동기) |
| `getWorkspaceById(wsId): IWorkspace \| undefined` (동기) | `getWorkspaceById(wsId): Promise<IWorkspace \| undefined>` (비동기) |

### 쓰기 함수 (이미 비동기, 내부 변경)

| 함수 | 변경 내용 |
|---|---|
| `createWorkspace(directory, name?)` | `store.push()` + `scheduleWrite()` → `readFile` + `push` + `writeFile` |
| `deleteWorkspace(workspaceId)` | `store.splice()` + `scheduleWrite()` → `readFile` + `splice` + `writeFile` |
| `renameWorkspace(workspaceId, name)` | `store.name = ...` + `scheduleWrite()` → `readFile` + 변경 + `writeFile` |
| `updateActive(updates)` | `store.xxx = ...` + `scheduleWrite()` → `readFile` + 변경 + `writeFile` |
| `validateDirectory(directory)` | `store.workspaces.some(...)` (동기) → `readFile` + `some` (비동기) |

### 제거되는 함수

| 함수 | 이유 |
|---|---|
| `flushWorkspaceStore()` | 즉시 저장이므로 flush 불필요 |
| `scheduleWrite()` | 디바운스 제거 |
| `flushWorkspacesFile()` | `writeWorkspacesFile()`으로 통합 |

## API 엔드포인트별 변경 사항

### GET /api/workspace

```
// Phase 5 (현재)
const data = getWorkspaces();  // 동기, 메모리
res.json(data);

// Phase 6 (변경)
const data = await getWorkspaces();  // 비동기, 파일
res.json(data);
```

응답 구조 동일:
```json
{
  "workspaces": [
    { "id": "ws-abc123", "name": "my-app", "directory": "/path/to/my-app", "order": 0 }
  ],
  "activeWorkspaceId": "ws-abc123",
  "sidebarCollapsed": false,
  "sidebarWidth": 200
}
```

### POST /api/workspace

- 내부에서 `createWorkspace()` 호출 → 이미 비동기이므로 호출부 변경 없음
- 내부 구현만 변경 (메모리 → 파일)

### DELETE /api/workspace/{workspaceId}

- 내부에서 `deleteWorkspace()` 호출 → 이미 비동기이므로 호출부 변경 없음

### PATCH /api/workspace/{workspaceId}

- 내부에서 `renameWorkspace()` 호출
- Phase 5: 동기 → Phase 6: 비동기로 전환 필요
- `const result = renameWorkspace(...)` → `const result = await renameWorkspace(...)`

### PATCH /api/workspace/active

- 내부에서 `updateActive()` 호출
- Phase 5: 동기 (void) → Phase 6: 비동기로 전환 필요
- `updateActive(updates)` → `await updateActive(updates)`

### GET /api/workspace/validate

- 내부에서 `validateDirectory()` 호출 → 이미 비동기이므로 호출부 변경 없음

## API 라우트 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `src/pages/api/workspace/index.ts` | `getWorkspaces()` → `await getWorkspaces()` |
| `src/pages/api/workspace/[workspaceId].ts` | `renameWorkspace()` → `await renameWorkspace()` |
| `src/pages/api/workspace/active.ts` | `updateActive()` → `await updateActive()` |
| `src/pages/api/workspace/validate.ts` | `validateDirectory()` → 이미 비동기, 변경 없음 |

## 삭제 대상 API 라우트 (레거시)

| 파일 | 이유 |
|---|---|
| `src/pages/api/tabs/index.ts` | tab-store.ts 의존, Phase 5에서 미사용 |
| `src/pages/api/tabs/[id].ts` | tab-store.ts 의존, Phase 5에서 미사용 |
| `src/pages/api/tabs/active.ts` | tab-store.ts 의존, Phase 5에서 미사용 |
| `src/pages/api/tabs/order.ts` | tab-store.ts 의존, Phase 5에서 미사용 |

## terminal-server.ts 변경

```
// Phase 5 (현재)
import { removeTabBySession } from './tab-store';
...
removeTabBySession(conn.sessionName).catch(...);

// Phase 6 (변경)
// import 제거, 호출 제거
// 세션 종료 시 탭 정리는 layout-store의 removeTabFromPane이 담당
// (클라이언트가 탭 닫기 시 DELETE /api/layout/pane/{id}/tabs/{tabId} 호출)
```

## 글로벌 lock 패턴

```typescript
const g = globalThis as unknown as { __ptWorkspaceLock?: Promise<void> };
if (!g.__ptWorkspaceLock) g.__ptWorkspaceLock = Promise.resolve();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const prev = g.__ptWorkspaceLock!;
  g.__ptWorkspaceLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
};
```

- `layout-store.ts`의 `__ptLayoutLock`과 동일한 패턴
- Workspace 읽기/쓰기 전체를 lock으로 보호
- 동시 API 요청 시 직렬화하여 race condition 방지

## 원자적 파일 쓰기

```typescript
const writeWorkspacesFile = async (data: IWorkspacesData): Promise<void> => {
  data.updatedAt = new Date().toISOString();
  const tmpFile = WORKSPACES_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, WORKSPACES_FILE);
};
```

- tmp 파일에 먼저 쓰고 rename (기존 `flushWorkspacesFile()` 로직 동일)
- rename은 POSIX에서 원자적 → 쓰기 중 크래시에도 원본 파일 안전

## 에러 처리

| 시나리오 | 처리 |
|---|---|
| `workspaces.json` 없음 | 빈 상태 반환 (`{ workspaces: [], ... }`) |
| `workspaces.json` 파싱 실패 | `.bak` 백업 → 빈 상태 반환 |
| 파일 쓰기 실패 | 에러 로그 + API 500 응답 |
| tmux 세션 생성 실패 | Workspace 생성 실패 → API 500 응답 |
