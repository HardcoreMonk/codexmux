---
page: agent-relay-server
title: 에이전트 중계 서버
route: /api/agent/*
status: DRAFT
complexity: High
depends_on:
  - docs/TMUX.md
  - docs/STATUS.md
created: 2026-04-04
updated: 2026-04-04
assignee: ''
---

# 에이전트 중계 서버

## 개요

에이전트와 사용자 사이의 메시지 전달, 상태 관리, 세션 복구를 담당하는 얇은 중계 레이어. 터미널 기본 코드에 에이전트 분기를 넣지 않고, purplemux 기본 로직(tmux 제어, 상태 감지)을 호출하는 독립 모듈로 설계한다.

## 주요 기능

### 에이전트 세션 라이프사이클

- 에이전트 생성 시 전용 tmux 세션 시작 (Claude Code `--dangerously-skip-permissions` 모드)
- 에이전트 CLAUDE.md를 세션 작업 디렉토리에 주입 — 역할, 도구 사용법, 보고 규칙(`POST /api/agent/message`로 curl) 정의
- 세션 죽으면 자동 재시작 — 기존 상태 감지 로직으로 세션 생존 감시
- 에이전트 삭제 시 tmux 세션 kill + 관련 파일 정리

### 사용자 → 에이전트 메시지 전달

- 기존 상태 감지 로직으로 에이전트 idle 확인 후 `tmux send-keys`로 메시지 전달
- 에이전트가 busy면 메시지 큐잉 — idle 전환 감지 시 순차 전달
- 턴 기반: 한 번에 하나의 메시지, 응답 대기 후 다음

### 에이전트 → 사용자 메시지 수신

- `POST /api/agent/message` API 엔드포인트
  - body: `{ agentId, type, content, metadata? }`
  - type: `report` | `question` | `done` | `error` | `approval`
- 수신 즉시 WebSocket으로 채팅 UI에 push
- 양방향 메시지를 JSONL 파일에 append — 에이전트는 저장 신경 안 씀

### 태스크 탭 상태 감시 (Phase 2 대비)

- 에이전트가 생성한 태스크 탭 목록 관리
- 기존 상태 감지 로직으로 각 탭 모니터링
- 완료/실패 감지 시 에이전트 세션에 `tmux send-keys`로 알림 전달
- 에이전트는 폴링 없이 이벤트 수신만 함

### 결과 읽기

- 기본: 태스크 탭의 `.task-result.md` 파일 읽기
- 보조: Claude Code 세션 jsonl 파싱 (실패/상세 확인 시)
- 최후: `tmux capture-pane`으로 버퍼 읽기

### 채팅 메시지 영속화

- 세션별 JSONL (append-only)
  ```
  ~/.purplemux/agents/{agent}/chat/
  ├── index.json          # 세션 목록 (메타데이터)
  └── {sessionId}.jsonl   # 메시지 한 줄씩 append
  ```
- 메시지 스키마: `{ id, timestamp, role, type, content, metadata? }`
- `role`: `user` | `agent`
- index.json: `{ sessions: [{ id, agentId, createdAt, lastMessageAt, missionId? }] }`

### 에이전트 상태 관리

- 에이전트 config 파일 (`~/.purplemux/agents/{agent}/config.md`) CRUD
- 상태 산출: idle(세션 존재 + 입력 대기) / working(실행 중) / blocked(사용자 응답 대기) / offline(세션 없음)
- 상태 변경 시 WebSocket broadcast

### 성능

- 상태 감지는 기존 로직 재사용 — 추가 폴링 없음
- 메시지 큐잉은 인메모리 배열 + JSONL 동기화
- WebSocket 연결은 기존 purplemux 인프라 활용

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-04-04 | 초안 작성 | DRAFT |
