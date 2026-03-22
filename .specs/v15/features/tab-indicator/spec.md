---
page: tab-indicator
title: 탭 바 상태 인디케이터
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

# 탭 바 상태 인디케이터

## 개요

`pane-tab-bar.tsx`의 각 탭 항목에 Claude 실행 상태를 spinner / dot으로 표시하여, 현재 보고 있지 않은 탭의 상태를 탭 바만 보고 즉시 인지할 수 있게 한다.

## 주요 기능

### 상태별 시각 표현

| 상태 | 표현 | 위치 | 크기 |
|---|---|---|---|
| `busy` | spinner (회전 애니메이션) | 탭 이름 좌측 | 12px |
| `needs-attention` | dot (빨간 계열, muted) | 탭 이름 좌측 | 6~8px |
| `idle` | 표시 없음 | - | - |

- spinner: `lucide-react`의 `Loader2` + `animate-spin`, 기존 UI 톤과 일관된 `text-muted-foreground`
- dot: `bg-ui-red` 계열 (muted 톤, `docs/STYLE.md` 준수). "확인해보세요" 수준, 경고 아님
- 크기: 탭 바 텍스트(text-xs/text-sm)와 조화. 과도하게 눈에 띄지 않아야 함

### 활성 탭 예외 처리

- 현재 활성(포커스) 탭에는 `needs-attention` dot을 표시하지 않음
- 이미 보고 있으므로 즉시 dismiss — 탭 활성화 시 `status:tab-dismissed` 이벤트 전송
- `busy` spinner는 활성 탭에도 표시 (진행 중임을 알려주는 정보)

### 탭 전환 시 자동 dismiss

- 탭 클릭/전환 → `needs-attention` dot 즉시 제거 (로컬 UI 즉시 반영)
- 동시에 서버에 `status:tab-dismissed` 이벤트 전송 (다른 클라이언트 동기화)
- 전환 애니메이션 없음 — dot이 즉시 사라짐 (fade-out 불필요)

### 데이터 소스

- `useClaudeStatusStore`에서 각 탭의 상태를 selector로 구독
- `getTabStatus(tabId)` → `busy` | `needs-attention` | `idle`
- 해당 탭 상태만 구독하여 다른 탭 변경 시 불필요한 리렌더 방지

### 기존 탭 바 호환

- 기존 탭 이름, 드래그 정렬, 닫기 버튼 등 기능에 영향 없음
- Claude Code 패널이 아닌 일반 터미널 탭에서는 상태 인디케이터 미표시
- 탭 이름이 긴 경우에도 인디케이터가 잘리지 않음 (flex-shrink-0)

### 다크 모드

- spinner: `text-muted-foreground` (자동 다크 모드 대응)
- dot: `bg-ui-red` (라이트/다크 모드별 oklch 값 자동 전환)

### 모바일

- 모바일 뷰의 Surface 선택 트리에서도 동일한 spinner/dot 표시
- 터치 탭 시 동일하게 dismiss 처리

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-22 | 초안 작성 | DRAFT |
