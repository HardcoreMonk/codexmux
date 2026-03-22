---
page: sidebar-indicator
title: 사이드바 Workspace 상태 인디케이터
route: /
status: DRAFT
complexity: Medium
depends_on:
  - docs/STYLE.md
  - .specs/v15/features/status-server/spec.md
created: 2026-03-22
updated: 2026-03-22
assignee: ''
---

# 사이드바 Workspace 상태 인디케이터

## 개요

`sidebar.tsx`의 각 Workspace 항목에 해당 Workspace 내 모든 탭의 Claude 상태를 집계하여 spinner / 숫자 뱃지로 표시. 여러 Workspace를 동시에 관리할 때 어느 프로젝트에서 Claude가 동작 중이고, 어디에 확인이 필요한지 사이드바만 보고 파악할 수 있다.

## 주요 기능

### 집계 로직

Workspace 하위의 모든 Pane → 모든 탭의 상태를 집계한다.

| 조건 | 표시 |
|---|---|
| `busy` 탭 1개 이상 | Workspace 이름 옆 spinner |
| `needs-attention` 탭 1개 이상 | 숫자 뱃지 (예: `2`) |
| 양쪽 동시 존재 | spinner + 숫자 뱃지 모두 |
| 모두 `idle` | 표시 없음 |

- 집계 소스: `useClaudeStatusStore.getWorkspaceStatus(wsId)` → `{ busyCount, attentionCount }`
- 비활성 Workspace도 포함 (서버가 전체 감시)

### 시각 표현

**Spinner**:
- `lucide-react`의 `Loader2` + `animate-spin`
- 크기: 14px, `text-muted-foreground`
- 위치: Workspace 이름 우측, 뱃지 좌측

**숫자 뱃지**:
- 배경: `bg-ui-red/20`, 텍스트: `text-ui-red`
- 크기: `text-xs`, `min-w-4 h-4`, `rounded-full`
- 위치: Workspace 이름 우측 끝
- 숫자: `needs-attention` 탭 수 (1자리~2자리)
- 9개 초과 시: `9+` 표시

### Workspace 전환 시 동작

- 비활성 Workspace의 뱃지 클릭 → Workspace 전환
- 전환 후에도 `needs-attention` 탭의 dot은 유지 — 탭을 직접 방문해야 dismiss
- Workspace 전환만으로는 dismiss 처리하지 않음

### 현재 활성 Workspace

- 현재 보고 있는 Workspace에도 뱃지/spinner 표시
- 활성 Workspace 내에서도 비활성 탭에 `needs-attention`이 있을 수 있음

### 데이터 소스

- `useClaudeStatusStore`에서 Workspace별 집계 selector 구독
- Workspace별로 독립 구독 → 한 Workspace 상태 변경이 다른 Workspace 리렌더를 유발하지 않음

### 다크 모드

- spinner: `text-muted-foreground` (자동 대응)
- 뱃지: `bg-ui-red/20 text-ui-red` (oklch 자동 전환)

### 모바일

- 모바일 뷰의 햄버거 메뉴 → Workspace 목록에서 동일한 spinner/뱃지 표시
- Workspace 내 Pane/Surface 트리 탐색 시에도 각 Surface에 탭 인디케이터 표시

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-22 | 초안 작성 | DRAFT |
