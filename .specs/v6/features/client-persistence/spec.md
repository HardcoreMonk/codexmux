---
page: client-persistence
title: 클라이언트 영속성 개선
route: /
status: CONFIRMED
complexity: Low
depends_on:
  - docs/STYLE.md
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# 클라이언트 영속성 개선

## 개요

`use-workspace.ts` 훅의 디바운스를 제거하여 Workspace 메타데이터 변경을 즉시 서버에 저장한다. 사이드바 리사이즈만 예외적으로 onDragEnd 시점에 저장하여 드래그 중 불필요한 파일 I/O를 방지한다. 서버 측 store가 파일 직접 쓰기로 전환되므로, 클라이언트에서 보낸 변경이 즉시 디스크에 반영되어 비정상 종료에도 데이터가 안전하다.

## 주요 기능

### use-workspace.ts — 디바운스 제거

- `saveActiveTimer` ref 변수 제거
- `saveActive()` 내부의 `setTimeout` 300ms 제거
- 변경 즉시 `PATCH /api/workspace/active` 호출:
  - `switchWorkspace()` → 즉시 `{ activeWorkspaceId }` 저장
  - `toggleSidebar()` → 즉시 `{ sidebarCollapsed }` 저장
- fire-and-forget 패턴 유지 (`.catch(() => {})`)
- 실패 시 다음 변경 시점에 최신 값이 전송되므로 자동 복구

### use-workspace.ts — 사이드바 리사이즈 저장 시점 변경

- `setSidebarWidth(width)`:
  - 드래그 중: 로컬 state (`setSidebarWidthState`)만 갱신 → UI 즉시 반영
  - 서버 저장 없음 — 드래그 중 매 프레임 호출되므로 I/O 방지
- 새로운 `saveSidebarWidth(width)` 또는 기존 `saveActive()` 활용:
  - onDragEnd 시점에만 호출 → `PATCH /api/workspace/active` with `{ sidebarWidth }`
  - 사이드바 리사이즈 컴포넌트(`sidebar.tsx` 또는 `terminal-page.tsx`)에서 onDragEnd 콜백 연결

### sidebar.tsx / terminal-page.tsx — onDragEnd 콜백 연결

- 사이드바 리사이즈 핸들의 드래그 완료 이벤트에서 `saveSidebarWidth()` 호출
- 현재 사이드바 리사이즈 구현 방식에 따라 연결 위치 결정:
  - `react-resizable-panels` 사용 시: `onLayout` 대신 드래그 완료 이벤트 활용
  - 커스텀 드래그 구현 시: `onMouseUp` / `onPointerUp` 시점에 저장
- 드래그 중 xterm.js `fit()` 호출은 기존대로 유지 (스로틀)

### 복원 흐름 (기존 유지)

- 페이지 로드 시 `GET /api/workspace` → `sidebarWidth`, `sidebarCollapsed` 복원
- 서버가 파일에서 직접 읽으므로 서버 재시작 후에도 마지막 저장 값 반환
- 사이드바 너비/접기 상태 복원 → Pane 렌더링 → xterm.js `fit()`

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
