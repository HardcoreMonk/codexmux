---
page: session-resume
title: 세션 Resume 연결
route: /api/timeline
status: DRAFT
complexity: Medium
depends_on:
  - .specs/v9/features/session-list-api/spec.md
  - .specs/v9/features/session-persistence/spec.md
  - .specs/v8/features/realtime-watch/spec.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# 세션 Resume 연결

## 개요

세션 목록에서 과거 세션을 선택하면, 하단 터미널에 `claude --resume {session_id}` 명령어를 자동 전송하여 해당 세션을 이어서 작업할 수 있게 한다. tmux send-keys를 활용하며, 타임라인 뷰로의 자동 전환과 세션 ID 영속화를 포함한다.

## 주요 기능

### resume 요청 흐름

1. 클라이언트: 세션 항목 클릭 → WebSocket으로 `timeline:resume` 메시지 전송
   - 페이로드: `{ sessionId, tmuxSession }` (tmuxSession = 해당 Surface의 tmux 세션명)
2. 서버: 터미널 프로세스 상태 확인 (tmux에서 현재 포그라운드 프로세스 조회)
3. 서버: `tmux send-keys -t {tmuxSession} "claude --resume {sessionId}" Enter` 실행
4. 서버: 해당 세션의 JSONL 파일에 대해 `fs.watch` 시작
5. 서버: `claudeSessionId`를 layout.json에 저장 (session-persistence 위임)
6. 서버: `timeline:resume-started` 응답 전송
7. 클라이언트: 타임라인 뷰로 전환 → 해당 세션의 타임라인 표시

### 터미널 프로세스 상태 확인

resume 전에 하단 터미널에서 다른 프로세스가 실행 중인지 확인한다:

- `tmux list-panes -t {session} -F "#{pane_current_command}"` 로 현재 포그라운드 프로세스 조회
- 셸(`bash`, `zsh`, `fish`)이 포그라운드이면: 안전하게 send-keys 가능
- 다른 프로세스가 실행 중이면: 클라이언트에 `timeline:resume-blocked` 응답
  - 응답 페이로드: `{ reason: 'process-running', processName: 'node' }`
  - 클라이언트: "터미널에서 다른 프로세스가 실행 중입니다" 경고 토스트 표시

### resume 실패 처리

- Claude Code CLI가 설치되지 않은 경우: 터미널 출력에서 `command not found` 감지 → 사용자에게 안내
- 세션 파일이 손상/삭제된 경우: Claude Code CLI가 에러 출력 → 타임라인 뷰에 에러 상태 표시
- 네트워크/파일 에러: WebSocket 에러 메시지로 클라이언트에 전달

### 클라이언트 인터랙션

- 세션 항목 클릭 시 즉시 피드백: 클릭한 항목에 로딩 스피너 표시
- resume 성공: 스피너 제거 → 타임라인 뷰로 부드럽게 전환
- resume 차단 (프로세스 실행 중): sonner 토스트로 경고 표시, 목록 상태 유지
- 중복 클릭 방지: resume 진행 중에는 다른 세션 항목 클릭 비활성화

### WebSocket 메시지 타입 추가

기존 `/api/timeline` WebSocket에 메시지 타입을 추가한다:

| 방향 | 타입 | 페이로드 |
|---|---|---|
| 클라이언트 → 서버 | `timeline:resume` | `{ sessionId, tmuxSession }` |
| 서버 → 클라이언트 | `timeline:resume-started` | `{ sessionId, jsonlPath }` |
| 서버 → 클라이언트 | `timeline:resume-blocked` | `{ reason, processName? }` |
| 서버 → 클라이언트 | `timeline:resume-error` | `{ message }` |

### 기존 동작과의 조화

- resume으로 세션을 시작한 후의 동작은 Phase 8의 `claude` 명령어 자동 감지와 동일
- 세션 파일 실시간 감시, 타임라인 업데이트, 자동 스크롤 등 모두 기존 로직 재활용
- resume 후 새 세션이 시작되면 (`timeline:session-changed` 수신) 자연스럽게 새 세션 타임라인으로 전환

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
