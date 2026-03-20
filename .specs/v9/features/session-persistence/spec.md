---
page: session-persistence
title: 세션 ID 영속화 및 자동 Resume
route: /
status: DRAFT
complexity: Medium
depends_on:
  - .specs/v9/features/session-resume/spec.md
  - .specs/v8/features/session-detection/spec.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# 세션 ID 영속화 및 자동 Resume

## 개요

Claude Code Panel이 연결된 세션 ID를 Surface 단위로 layout.json에 저장한다. 서버 재시작 시, 이전에 Claude Code를 실행 중이던 Surface를 식별하고, Claude 프로세스가 없으면 자동으로 `--resume`을 실행하여 작업을 이어간다.

## 주요 기능

### Surface 데이터 확장

기존 Surface 타입에 `claudeSessionId` 필드를 추가한다:

- 타입: `string | null`
- 기본값: `null`
- 위치: layout.json 내 각 Surface 객체
- 저장 시점:
  - `claude` 명령어 자동 감지 시 (Phase 8 session-detection에서 sessionId 획득)
  - 세션 목록에서 수동 resume 시
- 클리어 시점: 사용자가 수동으로 Panel 타입을 `terminal`로 전환했을 때만 클리어
- 세션 종료(Claude Code 프로세스 종료) 시에는 **클리어하지 않음** — 마지막 세션 ID를 유지하여 자동 resume에 활용

### layout.json 저장

- 기존 레이아웃 영속성(Phase 6) 흐름에 자연스럽게 통합
- `claudeSessionId` 변경 시 기존 debounce 저장 메커니즘을 통해 layout.json에 반영
- 저장 포맷 예시:

```json
{
  "tabs": [
    {
      "id": "tab-1",
      "name": "claude",
      "panelType": "claude-code",
      "claudeSessionId": "abc123-def456",
      "tmuxSession": "pt-workspace1-tab1"
    }
  ]
}
```

### 서버 재시작 시 자동 resume

서버 시작 → layout.json 로드 후 다음 프로세스를 실행한다:

1. **Surface 식별**: `panelType === 'claude-code'` && `claudeSessionId !== null`인 Surface 목록 추출
2. **tmux 세션 확인**: 해당 Surface의 tmux 세션이 살아있는지 확인
   - tmux 세션 없음 → 새 세션 생성 (기존 Phase 2 복원 로직)
3. **프로세스 확인**: tmux 세션 내 Claude Code 프로세스 실행 여부 확인
   - `tmux list-panes -t {session} -F "#{pane_current_command}"`
   - `claude` 프로세스가 실행 중 → 타임라인만 복원 (Phase 8 동작)
   - 셸만 실행 중 → 자동 resume 진행
4. **셸 준비 대기**: tmux 세션 재연결 후 셸이 준비될 때까지 대기
   - 전략: `tmux send-keys` 전에 짧은 딜레이 (1초) 적용
   - tmux 세션이 이미 존재하는 경우(서버만 재시작) 셸은 이미 준비 상태이므로 딜레이 최소화
5. **resume 전송**: `tmux send-keys -t {session} "claude --resume {sessionId}" Enter`
6. **fs.watch 시작**: 해당 세션의 JSONL 파일 감시 시작

### 자동 resume 실패 처리

- **세션 파일 없음**: JSONL 파일이 삭제되었거나 경로가 변경됨 → `claudeSessionId`는 유지, 세션 목록 뷰로 fallback
- **CLI 에러**: Claude Code가 에러를 출력하고 종료 → 터미널에 에러가 표시됨, 세션 목록 뷰로 전환
- **타임아웃**: resume 전송 후 10초 내에 세션 활성화가 감지되지 않으면 → 세션 목록 뷰로 전환
- 모든 실패 케이스에서 `claudeSessionId`는 유지 — 사용자가 수동으로 다시 시도할 수 있도록

### 복수 Surface 동시 resume

- 여러 Surface가 `claude-code` + `claudeSessionId`를 가지고 있을 수 있음
- 각 Surface에 대해 순차적으로 resume 실행 (동시 tmux send-keys는 레이스 컨디션 가능)
- 순차 실행 간격: 2초 (각 resume 완료를 기다리지 않고 일정 간격으로 전송)

### 기존 기능과의 호환

- `claudeSessionId` 필드가 없는 기존 layout.json과 호환: 필드가 없으면 `null`로 처리
- Phase 8의 자동 감지(`claude` 명령어 실행 감지) 시에도 `claudeSessionId`를 저장하도록 기존 로직 확장
- Panel 타입 수동 전환(Terminal ↔ Claude Code)은 기존과 동일하게 동작

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
