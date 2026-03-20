---
page: workspace-api
title: Workspace 관리 API
route: /api/workspace
status: DRAFT
complexity: Medium
depends_on: []
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# Workspace 관리 API

## 개요

Workspace CRUD와 영속성을 관리하는 REST API. Workspace 생성/조회/삭제/이름 변경을 처리하고, `~/.purple-terminal/workspaces.json`에 목록을 저장한다. 각 Workspace의 레이아웃은 `~/.purple-terminal/workspaces/{id}/layout.json`에 별도 저장된다. Phase 4의 `/api/layout`을 Workspace별로 확장하고, 서버 시작 시 Phase 4 layout.json 마이그레이션과 tmux 세션 크로스 체크를 수행한다.

## 주요 기능

### Workspace 목록 조회

- `GET /api/workspace` — 전체 Workspace 목록 + 사이드바 상태 반환
- 응답:
  ```json
  {
    "workspaces": [
      { "id": "ws-abc123", "name": "my-app", "directory": "/Users/user/projects/my-app", "order": 0 }
    ],
    "activeWorkspaceId": "ws-abc123",
    "sidebarCollapsed": false,
    "sidebarWidth": 200
  }
  ```
- 메모리 스토어에서 즉시 반환 (디스크 I/O 없음)
- Workspace가 없으면 빈 배열 반환 → 클라이언트가 기본 Workspace 생성 트리거

### Workspace 생성

- `POST /api/workspace` — 새 Workspace 생성
- 요청: `{ directory: string, name?: string }`
- 서버 동작:
  1. 디렉토리 존재 여부 확인 (`fs.stat`)
  2. 중복 디렉토리 확인
  3. Workspace ID 생성 (`ws-{nanoid(6)}`)
  4. 기본 레이아웃 생성: 단일 Pane + 탭 1개 + tmux 세션 (CWD = 해당 디렉토리)
  5. `workspaces/{id}/layout.json` 저장
  6. `workspaces.json` 갱신
- 응답: 생성된 Workspace 정보
- 에러: 400 (디렉토리 미존재, 중복), 500 (tmux 세션 생성 실패)

### Workspace 삭제

- `DELETE /api/workspace/{workspaceId}` — Workspace 삭제
- 서버 동작:
  1. 해당 Workspace의 모든 tmux 세션 kill (`pt-{wsId}-*`)
  2. `workspaces/{id}/` 디렉토리 삭제 (layout.json 포함)
  3. `workspaces.json`에서 제거
- 활성 WebSocket이 있으면 close code 1000 전송
- 응답: 204 No Content

### Workspace 이름 변경

- `PATCH /api/workspace/{workspaceId}` — 이름 변경
- 요청: `{ name: string }`
- `workspaces.json` 갱신
- 응답: 업데이트된 Workspace 정보

### 활성 Workspace 저장

- `PATCH /api/workspace/active` — 활성 Workspace ID + 사이드바 상태 저장
- 요청: `{ activeWorkspaceId: string, sidebarCollapsed?: boolean, sidebarWidth?: number }`
- `workspaces.json` 갱신 (디바운스 300ms)
- 응답: 200 OK

### 디렉토리 유효성 검증

- `GET /api/workspace/validate?directory={path}` — 디렉토리 존재 + 중복 확인
- 서버: `fs.stat` + 기존 Workspace 디렉토리 목록 비교
- 응답: `{ valid: boolean, error?: string, suggestedName?: string }`
- `suggestedName`: 디렉토리명에서 추출한 Workspace 이름 제안

### Workspace별 레이아웃 API 확장

- Phase 4의 `/api/layout` 엔드포인트에 `workspace` 쿼리 파라미터 추가
- `GET /api/layout?workspace={workspaceId}` — 특정 Workspace의 레이아웃 반환
- `PUT /api/layout?workspace={workspaceId}` — 특정 Workspace의 레이아웃 갱신
- `workspace` 미지정 시 활성 Workspace의 레이아웃 (Phase 4 하위 호환)
- 하위 API (`/api/layout/pane`, `/api/layout/cwd`, `/api/layout/pane/{id}/tabs` 등)도 동일하게 Workspace 스코프 적용
- 각 Workspace의 레이아웃은 `~/.purple-terminal/workspaces/{id}/layout.json`에 저장

### workspaces.json 저장소

- 저장 경로: `~/.purple-terminal/workspaces.json`
- 디렉토리가 없으면 자동 생성
- 파일이 없거나 파싱 실패 시 빈 상태로 시작
- 쓰기 시 디바운스 적용 (300ms)
- 내용: Workspace 목록 + activeWorkspaceId + sidebarCollapsed + sidebarWidth + updatedAt

### Phase 4 layout.json 마이그레이션

- 서버 시작 시 `workspaces.json`이 없고 Phase 4의 `layout.json`이 존재하면:
  1. "default" Workspace 생성 (ID: `ws-default`, 디렉토리: 홈 디렉토리)
  2. Phase 4 `layout.json`을 `workspaces/ws-default/layout.json`으로 복사
  3. `workspaces.json` 생성 (default Workspace 포함)
- 마이그레이션 후 기존 `layout.json`은 보존 (삭제하지 않음)
- 로그: `[purple-terminal] Phase 4 layout.json → Workspace 'default' 마이그레이션 완료`

### 서버 시작 시 정합성 체크

- `workspaces.json` 로드 → 각 Workspace의 `layout.json` 로드
- 각 Workspace별로 `tmux -L purple ls`와 크로스 체크:
  - tmux 세션 네이밍 `pt-{wsId}-*`로 그룹핑
  - layout.json의 탭 중 tmux 세션 없는 탭 → 제거
  - tmux 세션이 있지만 layout.json에 없는 세션 → 해당 Workspace 첫 번째 Pane에 orphan 탭 추가
  - Workspace의 모든 탭이 비면 → 기본 탭 생성
- 정합성 체크 후 각 layout.json 갱신 (변경 있을 때만)

### Graceful Shutdown

- SIGTERM/SIGINT 수신 시:
  1. 미저장 `workspaces.json` 데이터 즉시 flush
  2. 모든 Workspace의 미저장 `layout.json` 데이터 즉시 flush
  3. 모든 WebSocket에 close code 1001 전송
  4. tmux 세션은 유지 (Phase 2 정책)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
