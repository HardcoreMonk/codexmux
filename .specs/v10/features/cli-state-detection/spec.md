---
page: cli-state-detection
title: Claude Code CLI 상태 감지
route: /api/timeline
status: DETAILED
complexity: Medium
depends_on:
  - .specs/v8/features/realtime-watch/spec.md
  - .specs/v8/features/session-parser/spec.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# Claude Code CLI 상태 감지

## 개요

Claude Code CLI의 현재 상태(입력 대기 / 처리 중 / 비활성)를 JSONL 세션 파일의 마지막 엔트리 타입으로 감지한다. 이미 Phase 8에서 구축된 fs.watch + 세션 파서 인프라를 확장하여, 입력창의 모드 전환에 필요한 상태 정보를 실시간으로 클라이언트에 전달한다.

## 주요 기능

### 상태 정의

| CLI 상태 | 감지 기준 | 입력창 모드 |
|---|---|---|
| `idle` (입력 대기) | 마지막 엔트리가 `assistant-message` 또는 `tool-result` | 입력 모드 |
| `busy` (처리 중) | 마지막 엔트리가 `user-message` 또는 `tool-call` | 중단 모드 |
| `inactive` (비활성) | 세션 status가 `inactive` 또는 `none` | 비활성 모드 |

판단 로직:
- `user-message` → Claude에게 입력이 전달됨 → 처리 중 (`busy`)
- `tool-call` → Claude가 도구를 실행 중 → 처리 중 (`busy`)
- `tool-result` → 도구 실행 완료 → 아직 처리 중이지만 다음 응답 대기 → 처리 중 (`busy`)
- `assistant-message` → Claude가 응답 완료 → 입력 대기 (`idle`)
- 세션이 inactive/none → CLI가 실행 중이 아님 (`inactive`)

### 기존 인프라 활용

- **fs.watch**: Phase 8의 `timeline-server.ts`에서 이미 JSONL 파일을 감시 중
- **세션 파서**: `session-parser.ts`에서 이미 엔트리 타입을 파싱 중
- **WebSocket**: `timeline:append` 메시지로 새 엔트리를 실시간 전송 중
- 추가 파일 감시나 별도 API 없이, **기존 timeline:append 수신 시 마지막 엔트리 타입으로 상태 결정**

### 상태 전달 방식

두 가지 방식 중 택 1:

**방식 A: 클라이언트 측 계산 (권장)**
- 서버 변경 없음
- 클라이언트가 `timeline:append`로 수신한 엔트리 목록의 마지막 항목 타입을 확인
- `useTimeline` 훅에서 `cliState` 파생 상태로 제공

**방식 B: 서버 측 전달**
- `timeline:append` 메시지에 `cliState` 필드 추가
- 서버에서 마지막 엔트리 타입을 보고 상태 계산 후 포함

→ 방식 A가 서버 변경 없이 구현 가능하므로 권장

### 상태 전환 타이밍

- `timeline:append` 수신 즉시 상태 재계산 — 체감 지연 없음
- 초기 로드(`timeline:init`) 시에도 마지막 엔트리로 초기 상태 결정
- 세션 전환(`timeline:session-changed`) 시 상태 리셋

### 엣지 케이스 처리

- **세션 파일이 비어있음**: `idle` (새 세션 시작, 첫 입력 대기)
- **`agent-group` 엔트리가 마지막**: `busy` (서브에이전트 작업 중)
- **빠른 연속 엔트리**: debounce 없이 마지막 수신 엔트리 기준으로 즉시 갱신
- **WebSocket 재연결**: `timeline:init`으로 전체 재로드 → 마지막 엔트리로 상태 복원

### 성능

- 상태 계산은 O(1) — 마지막 엔트리 타입만 확인
- 추가 API 호출, 파일 읽기, 프로세스 조회 없음
- 기존 데이터 흐름에 얹는 순수 파생 상태

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
