---
page: workspace-store-refactor
title: Workspace Store 파일 기반 전환 + 레거시 정리
route: /api/workspace
status: CONFIRMED
complexity: Medium
depends_on: []
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# Workspace Store 파일 기반 전환 + 레거시 정리

## 개요

`workspace-store.ts`의 메모리 캐시 + 디바운스 패턴을 제거하고, `layout-store.ts`와 동일한 파일 직접 읽기/쓰기 패턴으로 전환한다. 파일을 단일 진실 원천(source of truth)으로 사용하여 서버 비정상 종료 시에도 데이터 손실을 방지한다. 동시에 역할이 없어진 `tab-store.ts`를 완전 삭제하고 `server.ts`의 shutdown 로직을 단순화한다.

## 주요 기능

### workspace-store.ts — 메모리 캐시 제거

- `let store: IWorkspacesData` 모듈 변수 제거
- `scheduleWrite()`, `writeTimer`, `DEBOUNCE_MS` 제거
- `flushWorkspacesFile()`, `flushWorkspaceStore()` 제거
- `layout-store.ts`의 글로벌 lock 패턴 적용 — 동시 API 요청 시 race condition 방지
  ```
  const g = globalThis as unknown as { __ptWorkspaceLock?: Promise<void> };
  ```

### workspace-store.ts — 읽기 함수 전환

- `getWorkspaces()` → `readWorkspacesFile()`로 파일에서 직접 읽어 반환
- `getActiveWorkspaceId()` → 파일에서 직접 읽어 반환
- `getWorkspaceById(wsId)` → 파일에서 직접 읽어 해당 Workspace 반환
- `validateDirectory(directory)` → 파일에서 직접 읽어 중복 확인
- 파일이 없거나 파싱 실패 시 빈 상태(`{ workspaces: [], ... }`) 반환 (기존 로직 유지)

### workspace-store.ts — 쓰기 함수 전환

- 모든 쓰기 함수: 파일 읽기 → 데이터 수정 → 즉시 파일 쓰기 (글로벌 lock 내)
- `createWorkspace(directory, name?)`:
  1. `readWorkspacesFile()` → 중복 검증
  2. 기본 레이아웃 생성 + tmux 세션 생성
  3. `workspaces` 배열에 추가 → `writeWorkspacesFile()` 즉시 저장
- `deleteWorkspace(workspaceId)`:
  1. `readWorkspacesFile()` → Workspace 찾기
  2. tmux 세션 kill + layout 디렉토리 삭제
  3. 배열에서 제거 → `writeWorkspacesFile()` 즉시 저장
- `renameWorkspace(workspaceId, name)`:
  1. `readWorkspacesFile()` → 이름 변경
  2. `writeWorkspacesFile()` 즉시 저장
- `updateActive(updates)`:
  1. `readWorkspacesFile()` → 필드 업데이트
  2. `writeWorkspacesFile()` 즉시 저장

### workspace-store.ts — 원자적 쓰기

- `writeWorkspacesFile()`: tmp 파일 → rename (기존 `flushWorkspacesFile()` 로직 재활용)
- 파싱 실패 시 `.bak` 파일로 백업 후 빈 상태 반환 (기존 `readWorkspacesFile()` 로직 유지)

### workspace-store.ts — initWorkspaceStore() 유지

- 서버 시작 시 `workspaces.json`을 한 번 읽고 크로스 체크까지 수행하는 기존 흐름 유지
- 크로스 체크 결과 반영 시 `writeWorkspacesFile()` 즉시 저장 (기존에도 `writeLayoutFile()` 사용 중이므로 사실상 동일)
- `server.listen()` 전에 완료 — 초기화 전 API 요청 자연 차단

### tab-store.ts — 완전 삭제

- `src/lib/tab-store.ts` 파일 삭제
- Phase 5에서 이미 역할 없음 — 모든 탭 관리가 `layout-store.ts` (Workspace별 layout.json)로 이관 완료

### server.ts — shutdown 단순화

- `flushWorkspaceStore()` import 및 호출 제거
- `initTabStore()`, `flushToDisk()` import 및 호출 제거
- `tab-store.ts` import 문 제거
- shutdown 함수:
  ```
  const shutdown = async () => {
    gracefulShutdown();  // WebSocket 정리
    process.exit(0);
  };
  ```

### server.ts — 시작 로직 정리

- `await initTabStore();` 호출 제거
- 시작 순서: `checkTmux()` → `scanSessions()` → `initWorkspaceStore()` → `app.prepare()` → `server.listen()`

### API 응답 변경 없음

- `/api/workspace` (GET/POST) — 응답 구조 동일, 내부 store만 파일 직접 읽기로 전환
- `/api/workspace/{id}` (DELETE/PATCH) — 동일
- `/api/workspace/active` (PATCH) — 동일 (디바운스 제거는 클라이언트 측)
- `/api/workspace/validate` (GET) — 동일
- `/api/layout` — 변경 없음 (이미 파일 직접 쓰기)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
