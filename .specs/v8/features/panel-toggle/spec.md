---
page: panel-toggle
title: Panel 타입 수동 전환 UI
route: /
status: DETAILED
complexity: Low
depends_on:
  - .specs/v8/features/panel-type-system/spec.md
  - .specs/v8/features/claude-code-panel/spec.md
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# Panel 타입 수동 전환 UI

## 개요

사용자가 탭 바에서 Panel 타입을 수동으로 전환할 수 있는 UI를 제공한다. Terminal ↔ Claude Code 간 토글하며, 전환 시 tmux 세션은 유지되어 터미널 상태가 보존된다.

## 주요 기능

### 전환 토글 버튼

- 탭 바 영역에 Panel 타입 전환 아이콘 버튼 배치
- Terminal 모드일 때: `BotMessageSquare` 아이콘 (Claude Code로 전환)
- Claude Code 모드일 때: `Terminal` 아이콘 (Terminal로 전환)
- 아이콘 크기: 탭 바의 기존 아이콘(분할 버튼 등)과 동일
- 호버 시 툴팁: "Claude Code 패널 전환" / "터미널 전환"

### 전환 동작

- 클릭 시 `updateTabPanelType()` 호출 → `panelType` 토글
- Terminal → Claude Code: 타임라인 영역 표시 + 터미널 축소 + 세션 매핑 시작
- Claude Code → Terminal: 타임라인 영역 제거 + 터미널 전체 화면 복원
- 전환 즉시 반영 (optimistic update) — layout.json 저장은 비동기

### tmux 세션 유지

- Panel 타입 변경 시 `sessionName` 불변 — 동일 tmux 세션 유지
- Terminal → Claude Code: 기존 터미널 WebSocket 연결 유지 + 타임라인 WebSocket 추가 연결
- Claude Code → Terminal: 타임라인 WebSocket 해제 + 터미널 WebSocket 유지
- 터미널 내 실행 중인 프로세스에 영향 없음

### 전환 시 터미널 리사이즈

- Terminal → Claude Code: 터미널 영역이 축소되므로 xterm.js에 resize 이벤트 발생
  - 축소 전 크기를 기반으로 실제 cols/rows 유지 (scale 변환이므로 논리적 크기 불변)
- Claude Code → Terminal: 터미널 영역이 전체로 복원되므로 정상 resize 처리
  - 컨테이너 크기에 맞게 cols/rows 재계산 (기존 ResizeObserver 로직)

### 비활성 상태

- Claude Code 세션이 없는 상태에서 전환 → 빈 타임라인 표시 (세션 대기 상태)
- 토글 버튼은 항상 표시 (세션 유무와 무관하게 수동 전환 가능)

### 시각적 피드백

- 현재 Panel 타입에 따라 탭 바에 미세한 시각적 힌트 (Claude Code 모드일 때 탭 이름 옆에 작은 indicator)
- 전환 애니메이션: 타임라인 영역이 위에서 슬라이드 인/아웃 (150ms ease-out)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
