---
page: layout-api
title: 레이아웃 관리 API
route: /api/layout
status: CONFIRMED
complexity: Medium
depends_on: []
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# 레이아웃 관리 API

## 개요

Pane 트리 구조와 각 Pane의 탭 목록을 통합 관리하는 REST API. Phase 3의 `/api/tabs` + `tabs.json` 구조를 `/api/layout` + `layout.json` 트리 구조로 전환한다. 서버 시작 시 layout.json과 tmux 세션을 크로스 체크하여 정합성을 보장하고, tabs.json에서 자동 마이그레이션을 지원한다. 서버 MAX_CONNECTIONS를 20~30으로 상향하여 다중 Pane 동시 WebSocket을 지원한다.

## 주요 기능

### 레이아웃 조회

- `GET /api/layout` — 전체 레이아웃 트리 반환
- 응답:
  ```json
  {
    "root": { "type": "split" | "pane", ... },
    "focusedPaneId": "pane-abc123",
    "updatedAt": "2026-03-20T10:00:00.000Z"
  }
  ```
- 트리 노드 타입:
  - `split`: `{ type, orientation, ratio, children: [node, node] }`
  - `pane`: `{ type, id, tabs: [...], activeTabId }`
- layout.json이 없으면: tabs.json 마이그레이션 시도 → 없으면 빈 단일 Pane 생성
- 응답 전 tmux 세션 크로스 체크 수행 (정합성 보장)
- 에러 시 500 + 에러 메시지 반환, 클라이언트는 기본 단일 Pane으로 폴백

### 레이아웃 업데이트

- `PUT /api/layout` — 전체 레이아웃 트리 갱신
- 요청 body: 전체 트리 데이터 (분할/닫기/리사이즈/탭 변경 시 클라이언트가 전체 트리 전송)
- 서버: 유효성 검증 후 layout.json에 저장 (디바운스 300ms)
- 유효성 검증:
  - 트리 구조 정합성 (내부 노드는 반드시 2개 자식, 리프 노드는 탭 배열 보유)
  - Pane 수 ≤ 3
  - 순환 참조 없음
- 응답: 200 + 저장된 레이아웃

### Pane 탭 생성 (분할 시)

- `POST /api/layout/pane` — 새 Pane에 첫 탭 생성
- 요청 body: `{ "cwd"?: string }` (원래 Pane의 CWD)
- 서버 동작:
  1. 새 tmux 세션 생성 (CWD가 있으면 해당 디렉토리에서 시작)
  2. 새 Pane ID + 탭 항목 생성
- 응답: `{ paneId, tab: { id, sessionName, name, order } }`
- 클라이언트는 반환값으로 트리를 업데이트한 뒤 `PUT /api/layout`으로 전체 트리 저장

### Pane CWD 조회

- `GET /api/layout/cwd?session={sessionName}` — tmux 세션의 현재 작업 디렉토리 조회
- 서버: `tmux -L purple display-message -p -t {session} '#{pane_current_path}'` 실행
- 응답: `{ "cwd": "/Users/user/projects/my-app" }`
- 분할 시 새 Pane의 시작 디렉토리를 결정하는 데 사용

### Pane 닫기 (세션 정리)

- `DELETE /api/layout/pane/{paneId}` — Pane의 모든 탭과 tmux 세션 종료
- 서버 동작:
  1. 해당 Pane의 모든 탭의 tmux 세션을 `kill-session`으로 종료
  2. 활성 WebSocket이 있으면 close code 1000 전송
- 응답: 204 No Content
- 클라이언트는 트리에서 Pane을 제거한 뒤 `PUT /api/layout`으로 전체 트리 저장

### 탭 관리 (Pane 내)

- `POST /api/layout/pane/{paneId}/tabs` — Pane에 새 탭 생성
  - 서버: 새 tmux 세션 생성 + 탭 항목 생성
  - 응답: 생성된 탭 정보
- `DELETE /api/layout/pane/{paneId}/tabs/{tabId}` — Pane의 탭 삭제
  - 서버: tmux 세션 kill + 탭 제거
  - 응답: 204 No Content
- `PATCH /api/layout/pane/{paneId}/tabs/{tabId}` — 탭 이름 변경
  - 요청 body: `{ "name": "new name" }`
  - 응답: 업데이트된 탭 정보
- 각 API 호출 후 layout.json 자동 저장 (디바운스)

### layout.json 저장소

- 저장 경로: `~/.purple-terminal/layout.json`
- 디렉토리가 없으면 자동 생성
- 파일이 없거나 파싱 실패 시 빈 상태로 시작
- 쓰기 시 디바운스 적용 (300ms)
- 트리 저장 시 자동 정규화: 자식 1개인 내부 노드 → 자식 노드로 교체 (무효 상태 방지)

### tabs.json → layout.json 마이그레이션

- 서버 시작 시 layout.json이 없고 tabs.json이 존재하면 자동 변환:
  - tabs.json의 탭 배열 → 단일 Pane 레이아웃 트리로 래핑
  - activeTabId, 탭 목록을 그대로 보존
- 마이그레이션 후 tabs.json은 보존 (롤백용, 삭제하지 않음)
- layout.json이 존재하면 tabs.json은 완전히 무시

### 서버 시작 시 정합성 체크

- layout.json + `tmux -L purple ls` 크로스 체크:
  - layout.json의 탭 중 tmux 세션이 없는 탭 → 해당 탭 제거
  - tmux 세션(`pt-*`)이 있지만 layout.json에 없는 세션 → 첫 번째 Pane에 orphan 탭 추가
  - 모든 Pane의 탭이 비면 → 기본 탭 1개 자동 생성
  - Pane의 탭이 비면 (탭 전부 제거됨) → 단일 Pane이면 기본 탭 생성, 복수면 Pane 제거
- 정합성 체크 후 layout.json 갱신

### MAX_CONNECTIONS 상향

- `terminal-server.ts`의 MAX_CONNECTIONS를 10 → 30으로 상향
- Pane당 1개 WebSocket (활성 탭) × 최대 3개 Pane = 3개 동시 연결 + 여유분
- 기존 WebSocket 프로토콜 (0x00~0x04), detaching 플래그, close code 정책 변경 없음

### Phase 3 `/api/tabs` 호환

- `/api/layout` 안정화까지 `/api/tabs` API를 병행 유지
- 새 시스템에서는 `/api/layout`이 primary 데이터 소스
- `/api/tabs`는 layout.json의 첫 번째 Pane 탭을 반환하는 어댑터 역할 (하위 호환)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
