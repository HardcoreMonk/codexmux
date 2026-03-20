---
page: session-parser
title: 세션 파일 파싱 엔진
route: /api/timeline
status: DETAILED
complexity: High
depends_on:
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# 세션 파일 파싱 엔진

## 개요

Claude Code 세션 파일(JSONL)을 파싱하여 타임라인 렌더링에 필요한 구조화된 데이터로 변환한다. [d-kimuson/claude-code-viewer](https://github.com/d-kimuson/claude-code-viewer)의 파싱 아키텍처를 참고하여, Zod 기반 스키마 검증과 graceful error handling을 적용한다. 대용량 세션(1MB+)을 위한 증분 읽기를 지원한다.

## 주요 기능

### JSONL 파싱 코어

- 줄 단위 분리 → 빈 줄 필터링 → 개별 `JSON.parse` → Zod 스키마 검증
- 유효하지 않은 줄은 무시 (전체 파싱이 실패하지 않음, graceful degradation)
- 파싱 결과를 타임라인 표시용 중간 타입(`ITimelineEntry`)으로 변환

### 엔트리 타입 필터링

- **파싱 대상**: `assistant`, `user` (메인 대화만)
- **제외 대상**: `progress`, `system`, `file-history-snapshot`, `queue-operation`, `summary`, `custom-title`, `agent-name`
- **서브에이전트**: `isSidechain: true` 엔트리는 별도 분류 → 접힌 그룹 힌트 데이터로 변환

### Zod 스키마 정의

- `BaseEntrySchema`: 공통 필드 (`uuid`, `parentUuid`, `timestamp`, `sessionId`, `cwd`, `isSidechain`, `type`)
- `AssistantEntrySchema`: `message.content[]`에 `text`, `tool_use`, `thinking` 블록
- `UserEntrySchema`: `message.content[]`에 `text`, `tool_result`, `image`, `document` 블록
- `ToolUseContentSchema`: `{ type: "tool_use", id, name, input }`
- `ToolResultContentSchema`: `{ type: "tool_result", tool_use_id, content, is_error? }`
- `safeParse()` 사용으로 런타임 에러 없이 검증

### 타임라인 엔트리 변환

assistant/user 엔트리를 타임라인 표시용 항목으로 변환한다:

- **사용자 메시지**: `type: "user"` 중 `tool_result`가 아닌 실제 텍스트 입력 → `ITimelineUserMessage`
- **어시스턴트 텍스트**: `content[].type === "text"` → `ITimelineAssistantMessage` (마크다운 원문 보존)
- **도구 호출**: `content[].type === "tool_use"` → `ITimelineToolCall` (name, 요약된 input)
- **도구 결과**: `content[].type === "tool_result"` → `ITimelineToolResult` (성공/실패 + 요약)
- **서브에이전트 그룹**: 연속된 `isSidechain: true` 엔트리 → `ITimelineAgentGroup` (에이전트 타입, 설명)

### 도구 호출 요약 생성

도구 결과의 전체 내용 대신 요약만 추출한다:

- **Read**: 파일 경로만 표시 (예: `Read src/lib/tmux.ts`)
- **Edit**: 파일 경로 + 변경 줄 수 (예: `Edit src/lib/tmux.ts (+3, -1)`)
- **Write**: 파일 경로 표시 (예: `Write src/types/terminal.ts`)
- **Bash**: 명령어 첫 줄 표시, 결과는 "N줄 출력" (예: `$ pnpm build → 12줄 출력`)
- **Grep/Glob**: 패턴 + 결과 건수 (예: `Grep "panelType" → 5건`)
- 기타 도구: 도구 이름 + input의 첫 번째 필드 값

### diff 데이터 추출

Edit/Write 도구 호출에서 diff 렌더링용 데이터를 추출한다:

- Edit: `input.old_string` / `input.new_string` → 인라인 diff 데이터
- Write: `input.content` → 전체 파일 내용 (신규 파일)
- diff 데이터는 타임라인 엔트리에 포함하되, 클라이언트에서 접기/펼치기로 제어

### 증분 읽기

- 마지막 읽은 byte offset을 기록하고, 파일 변경 감지 시 새 줄만 읽어 파싱
- 초기 로드: 전체 파일 파싱 (작은 파일) 또는 마지막 N줄부터 파싱 (대용량)
- 대용량 판단 기준: 1MB 이상 시 tail 모드 적용
- 이전 데이터 요청 시 offset 역방향으로 추가 로드 (역방향 가상 스크롤 대비)

### 성능

- JSONL 파싱은 서버(Node.js)에서 수행 — 클라이언트에 파싱 부하를 주지 않음
- 1MB 파일 기준 전체 파싱 100ms 이내 목표
- 증분 파싱은 새 줄 수에 비례하는 O(n) 처리 — 실시간 업데이트 지연 최소화

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
