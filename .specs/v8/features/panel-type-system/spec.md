---
page: panel-type-system
title: Panel 타입 시스템
route: /
status: DETAILED
complexity: Low
depends_on:
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# Panel 타입 시스템

## 개요

Surface가 렌더링하는 Panel에 타입 개념을 도입한다. ITab 인터페이스에 `panelType` 필드를 추가하고, PaneContainer에서 타입에 따라 다른 Panel 컴포넌트를 분기 렌더링한다. 기본값 `'terminal'`로 기존 동작과 완전 호환하며, 마이그레이션 없이 점진적으로 확장 가능한 구조를 만든다.

## 주요 기능

### ITab 타입 확장

- `panelType` 필드 추가: `'terminal'` (기본값) | `'claude-code'`
- 기존 layout.json에 `panelType`이 없는 탭은 자동으로 `'terminal'`로 처리 (하위 호환)
- 향후 타입 확장을 고려한 union type 설계 (`'terminal' | 'claude-code'`로 시작, 필요 시 추가)

### PaneContainer 분기 렌더링

- `panelType === 'terminal'`: 기존 TerminalContainer 그대로 렌더링
- `panelType === 'claude-code'`: ClaudeCodePanel 컴포넌트 렌더링
- PaneContainer의 portal 기반 stableContainersRef 메커니즘 유지 — Panel 타입 변경 시에도 DOM 안정성 보장
- 타입 전환 시 이전 Panel을 언마운트하고 새 Panel을 마운트 — tmux 세션(sessionName)은 불변

### panelType 영속화

- `panelType` 변경 시 기존 layout.json 저장 로직(debounce) 활용하여 즉시 영속화
- 서버 재시작 → layout.json 로드 → `panelType` 복원 → 올바른 Panel 컴포넌트 렌더링
- API: 기존 `PUT /api/layout` 엔드포인트 활용 (별도 API 불필요)

### panelType 변경 API

- `updateTabPanelType(paneId, tabId, panelType)` 함수를 useLayout 훅에 추가
- 호출 시 해당 탭의 `panelType` 업데이트 → optimistic UI 반영 → layout.json 저장
- 타입 변경 시 기존 WebSocket 연결(터미널)은 유지 — Claude Code Panel 내부에서 동일 터미널 사용

### 로딩 상태 처리

- Panel 타입 전환 중 빈 화면 방지: 전환 즉시 새 Panel 마운트 (TerminalContainer는 이미 즉시 렌더링)
- ClaudeCodePanel 초기 로드 시 타임라인 데이터 fetch 중 스켈레톤 표시

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
