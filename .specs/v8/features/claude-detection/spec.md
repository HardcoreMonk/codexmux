---
page: claude-detection
title: claude 명령어 감지
route: /
status: DETAILED
complexity: Medium
depends_on:
  - .specs/v8/features/panel-type-system/spec.md
  - .specs/v8/features/session-detection/spec.md
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# claude 명령어 감지

## 개요

tmux 세션 내에서 `claude` 프로세스 실행을 자동 감지하여 Panel 타입을 `terminal`에서 `claude-code`로 전환한다. 사용자가 터미널에서 `claude` 명령어를 실행하면 별도 조작 없이 타임라인 뷰가 자동으로 활성화된다.

## 주요 기능

### tmux 포그라운드 프로세스 감지

- `tmux -L purple display-message -t {sessionName} -p '#{pane_current_command}'` 명령으로 현재 실행 중인 포그라운드 프로세스 확인
- 반환값이 `claude`이면 Claude Code 실행 중으로 판정
- 서버에서 주기적 폴링 (1~2초 간격)

### 감지 대상 범위

- 모든 활성 탭의 tmux 세션을 폴링 대상으로 등록
- 현재 활성 Workspace의 탭만 폴링 (비활성 Workspace는 폴링하지 않음)
- Workspace 전환 시 폴링 대상 재설정

### 자동 전환 로직

- `claude` 감지 시:
  1. 해당 탭의 `panelType`을 `claude-code`로 변경 (updateTabPanelType 호출)
  2. session-detection을 통해 활성 세션 JSONL 파일 매핑
  3. 타임라인 WebSocket 연결 자동 시작
- 이미 `claude-code` 타입인 탭에서는 중복 전환하지 않음
- `claude` 프로세스가 아닌 다른 프로세스로 전환되어도 `claude-code` 타입 유지 (자동 복귀하지 않음)

### 폴링 최적화

- 불필요한 폴링 방지: `panelType === 'claude-code'`인 탭은 폴링 스킵
- tmux 명령 실행 비용 최소화: 배치 호출 또는 병렬 실행으로 여러 세션 동시 확인
- 서버 프로세스 부하 모니터링: 폴링 주기를 동적 조절 (부하 높으면 간격 확대)

### 에러 처리

- tmux 세션이 존재하지 않는 경우 → 해당 탭 폴링 제외
- tmux 명령 실행 실패 → 로그 기록, 다음 폴링에서 재시도
- tmux 서버 미응답 → 폴링 일시 중단 (30초 후 재개)

### 클라이언트 알림

- 자동 전환 시 터미널 WebSocket을 통해 클라이언트에 `panelType` 변경 알림
- 클라이언트는 알림 수신 → Panel 컴포넌트 전환 + 타임라인 WebSocket 연결

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
