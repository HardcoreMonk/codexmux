---
page: global-status
title: 글로벌 상태 요약 + 브라우저 탭 title
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

# 글로벌 상태 요약 + 브라우저 탭 title

## 개요

`app-header.tsx` 상단 바에 전체 시스템의 Claude 상태를 한 줄로 요약하고, 클릭 시 드롭다운으로 세션 목록을 표시하여 원클릭으로 해당 탭으로 이동하는 글로벌 네비게이션. 추가로 브라우저 탭 title에 `needs-attention` 카운트를 표시하여, 브라우저 탭을 전환하지 않고도 확인 필요 여부를 인지할 수 있다.

## 주요 기능

### 상단 바 요약 텍스트

- 표시 형태: `3 실행 중 · 2 확인 필요`
- `busy`만 있으면: `3 실행 중`
- `needs-attention`만 있으면: `2 확인 필요`
- 모두 `idle`: 표시 없음 (DOM에서 제거, 공간 미점유)
- 위치: `app-header.tsx`에서 로고와 우측 버튼 사이 영역
- 텍스트 스타일: `text-xs text-muted-foreground`, 과도하게 눈에 띄지 않게
- `실행 중` 옆 작은 spinner, `확인 필요` 옆 작은 dot으로 시각적 구분

### 세션 목록 드롭다운

상단 요약 텍스트 클릭 시 드롭다운으로 세션 목록 표시.

- shadcn/ui `Popover` 또는 `DropdownMenu` 사용
- 각 항목 구성:
  - 상태 아이콘 (spinner 또는 dot)
  - Workspace 이름 (`text-muted-foreground`, `text-xs`)
  - 탭 이름 (주 텍스트)
- 정렬: `needs-attention` 먼저, `busy` 다음
- `idle` 탭은 목록에 포함하지 않음

**항목 클릭 시**:
- 해당 Workspace로 즉시 전환
- 해당 탭 즉시 활성화
- 드롭다운 닫힘
- `needs-attention` 탭 클릭 시 자동 dismiss
- 전환 지연 없음 — 즉각 반응 필수 (지연 시 "클릭이 안 됐나" 착각)

**빈 상태**:
- 모든 탭이 `idle`이면 드롭다운 자체가 뜨지 않음 (요약 텍스트가 없으므로)

### 브라우저 탭 title 반영

`document.title`에 `needs-attention` 카운트를 반영한다.

- 형태: `(2) Purple Terminal` — 숫자는 전체 `needs-attention` 탭 수
- 전부 확인 시: `Purple Terminal` (카운트 제거)
- `busy`는 카운트에 포함하지 않음 — 사용자 액션이 필요한 것만 카운트
- 업데이트: `useClaudeStatusStore`의 `attentionCount` 변경 시 `useEffect`로 반영
- 기존 페이지별 title이 있으면 카운트만 prepend: `(2) 기존 타이틀`

### 데이터 소스

- `useClaudeStatusStore.getGlobalStatus()` → `{ busyCount, attentionCount }`
- 전체 집계 selector 1개만 구독
- 카운트가 변경될 때만 리렌더

### 다크 모드

- 요약 텍스트: `text-muted-foreground` (자동 대응)
- 드롭다운: shadcn/ui 컴포넌트 기본 다크 모드
- dot/spinner: 탭 인디케이터와 동일 토큰

### 모바일

- 모바일 뷰에서는 상단 바 공간이 제한적
- 요약 텍스트 대신 아이콘 + 숫자 뱃지로 축약 표시 (예: spinner 아이콘 + `2`)
- 터치 시 동일 드롭다운 표시
- 브라우저 탭 title은 데스크톱과 동일 동작

### 접근성

- 드롭다운: 키보드 네비게이션 (↑↓ 이동, Enter 선택, Esc 닫기)
- 요약 텍스트: `role="button"`, `aria-haspopup="true"`
- 스크린 리더: "3개 실행 중, 2개 확인 필요" 읽기

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-22 | 초안 작성 | DRAFT |
