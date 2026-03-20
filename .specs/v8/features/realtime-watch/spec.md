---
page: realtime-watch
title: 실시간 세션 감시
route: /api/timeline
status: DETAILED
complexity: High
depends_on:
  - .specs/v8/features/session-parser/spec.md
  - .specs/v8/features/session-detection/spec.md
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# 실시간 세션 감시

## 개요

`fs.watch`로 Claude Code 세션 JSONL 파일을 감시하고, 변경 사항을 증분 파싱하여 전용 WebSocket(`/api/timeline`)으로 클라이언트에 실시간 전송한다. 기존 터미널 WebSocket(`/api/terminal`)과 완전히 분리된 채널로 운영하여 관심사를 분리한다.

## 주요 기능

### 전용 WebSocket 엔드포인트

- `ws://localhost:{port}/api/timeline?session={sessionName}&workspace={workspaceId}` 엔드포인트 신설
- server.ts의 upgrade 핸들러에서 `/api/timeline` 경로를 분리 처리
- 기존 `/api/terminal` WebSocket과 독립적으로 운영 — 바이너리 프로토콜 간섭 없음
- 타임라인 WebSocket은 **JSON 메시지** 사용 (바이너리 아님)

### WebSocket 메시지 프로토콜

서버 → 클라이언트 메시지 타입:

- `timeline:init` — 초기 연결 시 전체 타임라인 데이터 전송 (파싱된 엔트리 배열)
- `timeline:append` — 새 엔트리 추가 시 증분 데이터 전송 (새 엔트리만)
- `timeline:session-changed` — 감시 대상 세션 파일이 변경됨 (새 세션 시작)
- `timeline:error` — 파싱 오류 등 에러 정보

클라이언트 → 서버 메시지 타입:

- `timeline:subscribe` — 특정 세션 파일 감시 시작 요청
- `timeline:unsubscribe` — 감시 중지 요청

### fs.watch 파일 감시

- 대상 JSONL 파일에 `fs.watch` 등록
- 변경 감지 시 마지막 byte offset부터 새 데이터 읽기 (증분)
- 새 줄을 세션 파서로 전달 → 타임라인 엔트리 변환
- 변환된 엔트리를 `timeline:append` 메시지로 연결된 클라이언트에 브로드캐스트
- **debounce 50ms**: Claude Code가 빠르게 연속 기록할 때 과도한 전송 방지
- watcher 에러 시 자동 재등록 (최대 3회 재시도)

### 감시 대상 전환

- 새 세션 시작 시 (session-detection에서 알림): 기존 watcher 해제 → 새 파일에 watcher 등록
- 전환 시 클라이언트에 `timeline:session-changed` 전송 → 클라이언트가 타임라인 초기화 후 재로드
- 전환 과정에서 이전 세션 데이터 유실 없음 (메모리에서 즉시 제거)

### 연결 관리

- 타임라인 WebSocket도 heartbeat 적용 (30초 간격 ping/pong)
- 클라이언트 연결 해제 시 해당 세션의 watcher 참조 카운트 감소 → 0이면 watcher 해제
- 동일 세션 파일을 여러 클라이언트가 감시할 때 watcher는 하나만 유지 (팬아웃)
- 최대 동시 감시 파일 수 제한 (10개) — 서버 리소스 보호

### 초기 로드 최적화

- 클라이언트 연결 시 전체 JSONL 파일을 파싱하여 `timeline:init`으로 전송
- 대용량 파일(1MB+): 최근 200개 엔트리만 초기 전송, 이전 데이터는 REST API로 페이지네이션 로드
- 초기 로드 중에도 실시간 감시는 병행 — 로드 완료 전에 새 엔트리가 생기면 큐잉 후 순서 보장

### 성능

- fs.watch 이벤트 → 증분 파싱 → WebSocket 전송까지 100ms 이내 목표
- debounce로 초당 최대 20회 전송으로 제한 (50ms 간격)
- 메모리: 세션당 파싱된 엔트리를 서버에 캐싱하지 않음 — 매번 증분 읽기 후 즉시 전송

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
