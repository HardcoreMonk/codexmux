---
page: tab-api
title: 탭 관리 API
route: /api/tabs
status: CONFIRMED
complexity: Medium
depends_on: []
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# 탭 관리 API

## 개요

탭 목록의 CRUD와 영속성을 관리하는 REST API. 탭 생성/삭제/이름 변경/순서 변경을 처리하고, `~/.purple-terminal/tabs.json`에 상태를 저장한다. 서버 시작 시 tabs.json과 tmux 세션 목록을 크로스 체크하여 정합성을 보장한다.

## 주요 기능

### 탭 목록 조회

- `GET /api/tabs` — 현재 탭 목록 반환
- 응답: 탭 배열 (순서대로 정렬)
  ```json
  {
    "tabs": [
      { "id": "tab-abc123", "sessionName": "pt-a1b2c3-d4e5f6-g7h8i9", "name": "Terminal 1", "order": 0 },
      { "id": "tab-def456", "sessionName": "pt-x1y2z3-u4v5w6-p7q8r9", "name": "build", "order": 1 }
    ],
    "activeTabId": "tab-abc123"
  }
  ```
- 서버 시작 시 자동 정합성 체크 (tabs.json ↔ tmux 세션 크로스 체크)
- 탭이 없으면 빈 배열 반환 → 클라이언트가 첫 탭 생성 트리거

### 탭 생성

- `POST /api/tabs` — 새 탭 생성
- 요청 body: `{ "name"?: string }` (선택, 미지정 시 "Terminal {N}")
- 서버 동작:
  1. 새 tmux 세션 생성 (`tmux -L purple new-session -d -s {name}`)
  2. 탭 항목 생성 (nanoid ID, 세션 이름, 기본 이름, 순서)
  3. tabs.json 저장
- 응답: 생성된 탭 정보 (id, sessionName, name, order)
- 클라이언트는 반환된 sessionName으로 WebSocket 연결

### 탭 삭제

- `DELETE /api/tabs/{tabId}` — 탭 삭제
- 서버 동작:
  1. 해당 탭의 tmux 세션 kill (`tmux -L purple kill-session -t {name}`)
  2. tabs.json에서 탭 제거
  3. tabs.json 저장
- 해당 세션에 활성 WebSocket이 있으면 close code 1000 전송 (세션 종료)
- 응답: 204 No Content

### 탭 이름 변경

- `PATCH /api/tabs/{tabId}` — 탭 속성 업데이트
- 요청 body: `{ "name": "new name" }`
- tabs.json 저장
- 응답: 업데이트된 탭 정보

### 탭 순서 변경

- `PATCH /api/tabs/order` — 전체 탭 순서 업데이트
- 요청 body: `{ "tabIds": ["tab-def456", "tab-abc123"] }` (새 순서대로 배열)
- tabs.json 저장
- 응답: 업데이트된 탭 목록

### 활성 탭 저장

- `PATCH /api/tabs/active` — 활성 탭 ID 업데이트
- 요청 body: `{ "activeTabId": "tab-abc123" }`
- 새로고침 시 마지막 활성 탭을 복원하기 위해 저장
- tabs.json 저장
- 응답: 200 OK

### tabs.json 저장소

- 저장 경로: `~/.purple-terminal/tabs.json`
- 디렉토리가 없으면 자동 생성 (`mkdir -p`)
- 파일이 없거나 파싱 실패 시 빈 상태로 시작
- 쓰기 시 디바운스 적용 (300ms) — 빈번한 디스크 I/O 방지
- JSON 구조:
  ```json
  {
    "tabs": [...],
    "activeTabId": "tab-abc123",
    "updatedAt": "2026-03-20T12:00:00Z"
  }
  ```

### 서버 시작 시 정합성 체크

서버 시작 시 `tabs.json`과 `tmux -L purple ls`를 크로스 체크:

- tabs.json에 있지만 tmux 세션이 없는 탭 → 탭에서 제거
- tmux 세션(`pt-*`)이 있지만 tabs.json에 없는 세션 → orphan 복구 (자동으로 탭 추가)
- 정합성 체크 후 tabs.json 갱신

### 탭 내 exit 시 자동 삭제

- WebSocket에서 close code 1000 (세션 종료) 수신 시 해당 세션의 탭을 자동 삭제
- tabs.json 갱신
- 클라이언트에 탭 삭제 이벤트를 알리는 메커니즘 필요 (polling 또는 WebSocket 기반)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
