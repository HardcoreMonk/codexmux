---
step: build
timestamp: 2026-03-20 21:37
elapsed: 4분 30초
status: completed
---
모든 작업 완료. 타입 체크 0 오류, 린트 0 오류입니다.

## 변경 요약

### `src/lib/workspace-store.ts` — 메모리 캐시 → 파일 직접 읽기/쓰기
- `let store` 모듈 변수, `writeTimer`, `DEBOUNCE_MS`, `scheduleWrite()`, `flushWorkspacesFile()`, `flushWorkspaceStore()` 제거
- `layout-store.ts`와 동일한 `withLock()` 글로벌 lock 패턴 적용 (`__ptWorkspaceLock`)
- `writeWorkspacesFile()`: tmp → rename 원자적 쓰기
- 읽기 함수 (`getWorkspaces`, `getActiveWorkspaceId`, `getWorkspaceById`) → **비동기 전환** (파일에서 직접 읽기)
- 쓰기 함수 (`createWorkspace`, `deleteWorkspace`, `renameWorkspace`, `updateActive`) → **lock 내 read-modify-write** 패턴
- 마이그레이션 함수 → `store` 변수 대신 데이터를 반환하도록 변경

### 삭제 파일
- `src/lib/tab-store.ts`
- `src/pages/api/tabs/index.ts`, `[id].ts`, `active.ts`, `order.ts`

### `src/lib/terminal-server.ts`
- `removeTabBySession` import 및 2곳 호출 제거

### `server.ts`
- `initTabStore`, `flushToDisk`, `flushWorkspaceStore` import/호출 제거
- shutdown: `gracefulShutdown()` + `process.exit(0)`만 유지

### API 라우트 (호출부 async 전환)
- `workspace/index.ts`: `getWorkspaces()` → `await getWorkspaces()`
- `workspace/[workspaceId].ts`: `renameWorkspace()` → `await renameWorkspace()`
- `workspace/active.ts`: `updateActive()` → `await updateActive()`
- `layout/index.ts`: `getActiveWorkspaceId()`, `getWorkspaceById()` → `await` 추가
- `layout/pane/index.ts`, `layout/pane/[paneId]/tabs/index.ts`, `layout/pane/[paneId]/tabs/[tabId].ts`: `getActiveWorkspaceId()` → `await` 추가

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
