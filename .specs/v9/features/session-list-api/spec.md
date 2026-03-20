---
page: session-list-api
title: 세션 목록 조회 API
route: /api/timeline/sessions
status: DRAFT
complexity: Medium
depends_on:
  - .specs/v8/features/session-detection/spec.md
  - .specs/v8/features/session-parser/spec.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# 세션 목록 조회 API

## 개요

프로젝트별 Claude Code 과거 세션 목록을 조회하는 서버 API. `~/.claude/projects/` 하위에서 현재 Workspace에 해당하는 `.jsonl` 파일들을 탐색하고, 각 파일에서 메타정보를 경량 파싱하여 최신순으로 반환한다.

기존 `GET /api/timeline/session`(단수)은 현재 활성 세션 1건을 반환하는 API로 유지하고, 이 기능은 별도 엔드포인트 `GET /api/timeline/sessions`(복수)로 제공한다.

## 주요 기능

### 세션 파일 탐색

- Workspace의 프로젝트 디렉토리를 기반으로 `~/.claude/projects/{변환된 경로}/` 하위 `.jsonl` 파일을 스캔
- 경로 변환 규칙은 기존 `session-detection.ts`의 로직을 재활용: `/` → `-` 치환
- `agent-*.jsonl` 패턴은 제외 (서브에이전트 파일 필터링)
- 파일 목록 조회는 `fs.readdir`로 수행 — glob 불필요

### 메타정보 경량 파싱

각 세션 파일에서 전체 JSONL을 읽지 않고, 필요한 메타정보만 추출한다.

| 필드 | 추출 방식 |
|---|---|
| `sessionId` | 파일명에서 추출 (`.jsonl` 확장자 제거) |
| `startedAt` | JSONL 첫 번째 라인의 타임스탬프, 또는 파일 생성 시간 (`fs.stat` birthtime) |
| `lastActivityAt` | 파일 수정 시간 (`fs.stat` mtime) |
| `firstMessage` | JSONL에서 첫 `human` 타입 메시지의 텍스트 내용 |
| `turnCount` | JSONL 전체에서 `human` 타입 엔트리 수 |

파싱 전략:

- `firstMessage`: readline 인터페이스로 라인 단위 스트리밍 → 첫 `human` 메시지 발견 시 즉시 중단
- `turnCount`: 전체 파일을 스트리밍하며 `"type":"human"` 패턴 카운트 — 정규식 매칭으로 JSON 파싱 없이 처리
- `startedAt`: 첫 라인만 JSON 파싱하여 타임스탬프 추출
- 파싱 실패한 파일은 건너뜀 (목록에서 제외, 에러 로그만 남김)

### 응답 정렬 및 페이지네이션

- `lastActivityAt` 기준 내림차순 (최신순)
- 기본 limit: 50건, offset 기반 페이지네이션
- 쿼리 파라미터: `?workspace={id}&limit={n}&offset={n}`

### 병렬 처리

- 여러 세션 파일의 메타 파싱을 `Promise.allSettled`로 병렬 실행
- 동시 파일 읽기 제한: 최대 10개 (concurrency limiter)
- 100개 세션 기준 500ms 이내 응답 목표

### 에러 처리

- 프로젝트 디렉토리에 해당하는 Claude 경로가 없음 → 빈 배열 반환 (에러 아님)
- 개별 파일 파싱 실패 → 해당 세션만 건너뜀, 나머지는 정상 반환
- Workspace를 찾을 수 없음 → 404 응답

### 캐싱

- 세션 목록은 매 요청마다 파일 시스템에서 조회 (캐싱하지 않음)
- `fs.stat`은 가벼운 시스템콜이므로 매번 호출해도 성능 영향 미미
- 메타 파싱(firstMessage, turnCount)은 비용이 있으므로, 동일 세션에 대해 단기 메모리 캐시 고려 (TTL 30초)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
