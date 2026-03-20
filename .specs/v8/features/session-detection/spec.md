---
page: session-detection
title: 활성 세션 감지 및 매핑
route: /api/timeline
status: DETAILED
complexity: Medium
depends_on:
  - .specs/v8/features/session-parser/spec.md
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# 활성 세션 감지 및 매핑

## 개요

현재 실행 중인 Claude Code 프로세스를 탐지하고, 해당 프로세스의 JSONL 세션 파일을 정확히 매핑한다. `~/.claude/sessions/` 하위 PID 파일을 기반으로 활성 세션을 식별하며, Workspace 디렉토리와의 경로 매칭으로 올바른 프로젝트의 세션을 연결한다.

## 주요 기능

### PID 파일 기반 활성 세션 탐색

- `~/.claude/sessions/` 디렉토리의 `{PID}.json` 파일을 스캔
- 각 PID 파일 형식: `{ pid, sessionId, cwd, startedAt }`
- `cwd`가 현재 Workspace의 `directories[0]`과 일치하는 세션을 필터링
- `ps -p {PID}`로 프로세스가 실제 실행 중인지 검증 — 좀비 PID 파일 제거
- 여러 활성 세션이 일치하면 `startedAt`이 가장 최근인 세션 선택

### 프로젝트 디렉토리 → JSONL 파일 경로 매핑

- 디렉토리 경로 변환 규칙: 모든 `/` → `-` 치환
  - 예: `/Users/subicura/Workspace/github.com/subicura/pt` → `-Users-subicura-Workspace-github-com-subicura-pt`
- JSONL 파일 경로: `~/.claude/projects/{변환된 경로}/{sessionId}.jsonl`
- 파일 존재 여부 확인 후 반환 — 파일이 아직 생성되지 않았으면 null 반환 + 대기

### 비활성 상태 폴백

- 활성 세션이 없는 경우: `~/.claude/projects/{변환된 경로}/` 하위의 `*.jsonl` 파일 중 최근 수정된 파일 선택
- 세션 파일이 하나도 없는 경우: null 반환 (타임라인 비어 있음 표시)
- 세션 파일 목록은 `agent-*.jsonl` 패턴을 제외 (서브에이전트 파일 필터링)

### 새 세션 시작 감지

- `~/.claude/sessions/` 디렉토리를 `fs.watch`로 감시
- 새 PID 파일 생성 → 즉시 읽어서 `cwd` 매칭 → 현재 Workspace와 일치하면 감시 대상 전환
- 기존 watcher 해제 → 새 세션 파일로 watcher 재설정
- debounce 적용 (200ms) — 파일 생성 직후 내용이 아직 쓰이지 않은 상태 방지

### 세션 종료 감지

- 감시 중인 PID의 프로세스 종료를 주기적으로 확인 (10초 간격 폴링)
- 프로세스 종료 감지 시: watcher는 유지 (세션 파일은 남아 있음), 상태만 "종료됨"으로 표시
- Panel 타입은 `claude-code` 유지 — 사용자가 수동 전환하기 전까지 타임라인 표시 계속

### 에러 처리

- PID 파일 읽기 실패 → 해당 PID 무시, 다음 파일 시도
- 프로세스 검증(`ps -p`) 타임아웃 → 해당 세션 일시 제외, 다음 폴링에서 재시도
- JSONL 파일 경로 존재하지 않음 → 빈 타임라인 표시 + `fs.watch`로 파일 생성 대기
- `~/.claude/sessions/` 디렉토리 자체가 없음 → Claude Code 미설치 안내 표시

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
