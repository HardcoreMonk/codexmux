---
page: terminal-session
title: 터미널 세션 (다중 세션)
route: /api/terminal
status: CONFIRMED
complexity: Medium
depends_on: []
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# 터미널 세션 (다중 세션)

## 개요

Phase 2의 단일 세션 WebSocket 백엔드를 다중 세션으로 확장한다. 클라이언트가 URL 쿼리 파라미터로 세션 ID를 지정하여 특정 tmux 세션에 연결하고, 탭 전환 시 WebSocket을 끊고 재연결하는 방식을 지원한다. 기존 바이너리 프로토콜과 Phase 2 정책(detaching, close code)은 그대로 유지한다.

## 주요 기능

### 세션 ID 파라미터 파싱

- `server.ts` upgrade 핸들러에서 `request.url`의 `session` 쿼리 파라미터를 파싱
- `/api/terminal?session=pt-a1b2c3-d4e5f6-g7h8i9` → 해당 세션에 attach
- `/api/terminal` (파라미터 없음) → 새 tmux 세션 생성 + attach
- 파라미터 파싱: `new URL(request.url, 'http://localhost').searchParams.get('session')`

### 세션 매칭 로직 변경

Phase 2 대비 변경:

```
Phase 2: 첫 번째 pt-* 세션에 attach (또는 새 세션)
Phase 3:
  - session 파라미터 있음 → 해당 세션 존재 여부 확인 → 있으면 attach, 없으면 1011 에러
  - session 파라미터 없음 → 새 세션 생성 + attach (Phase 2 하위 호환)
```

- 존재하지 않는 세션 ID 요청 시 close code 1011 ("Session not found") 전송
- 새 세션 생성 시 세션 이름(nanoid)을 클라이언트에 알려줘야 함 → 첫 번째 메시지 또는 tabs API 경유

### 탭 전환 시 연결 흐름

```
탭 전환 클릭
→ 클라이언트: 현재 WebSocket close
→ 서버: detaching=true → pty.kill() → tmux detach (세션 유지)
→ 클라이언트: 새 WebSocket 연결 (/api/terminal?session={newId})
→ 서버: 해당 세션에 pty.spawn(tmux attach)
→ tmux 자동 redraw → 클라이언트 화면 복원
```

- 탭 전환은 "의도적 detach"이므로 session-ended UI가 표시되면 안 됨
- 클라이언트가 WebSocket을 닫는 시점에는 close code를 보내지 않거나, 서버가 클라이언트 측 close를 detach로 처리

### 다중 세션 동시 관리

- connections Map에 여러 세션이 동시에 존재할 수 있음
- 각 WebSocket 연결은 하나의 tmux 세션에 1:1 매핑
- 같은 세션에 여러 WebSocket이 attach 가능 (다중 브라우저 탭)
- MAX_CONNECTIONS 제한은 전체 WebSocket 수 기준 (세션 수 아님)

### 바이너리 프로토콜 유지

- 0x00 stdin, 0x01 stdout, 0x02 resize, 0x03 heartbeat — 변경 없음
- backpressure (1MB/256KB) — 변경 없음
- heartbeat (30초/90초 타임아웃) — 변경 없음

### Phase 2 정책 호환

- `detaching` 플래그: 탭 전환/새로고침/서버 종료 시 true
- close code 1000: 세션 종료 (exit/kill)
- close code 1001: 서버 종료 (자동 재연결)
- close code 1011: 세션 생성/attach 실패 (+ 세션 미존재)
- close code 1013: 동시 접속 초과

### graceful shutdown 확장

- 서버 종료 시 모든 활성 WebSocket에 1001 전송
- 모든 attach PTY를 detaching=true로 정리
- 모든 tmux 세션은 유지 (재시작 시 복원)
- tabs.json은 서버 종료 전 최종 상태 저장

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
