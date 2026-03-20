---
page: session-list-ui
title: 세션 목록 UI 및 뷰 전환
route: /
status: DETAILED
complexity: High
depends_on:
  - .specs/v9/features/session-list-api/spec.md
  - .specs/v9/features/session-resume/spec.md
  - .specs/v8/features/claude-code-panel/spec.md
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# 세션 목록 UI 및 뷰 전환

## 개요

Claude Code Panel 상단 영역에서 활성 세션 유무에 따라 **세션 목록 뷰**와 **타임라인 뷰**를 자동 전환한다. 세션 목록은 과거 세션의 메타정보를 시간순으로 표시하며, 항목 클릭으로 해당 세션을 resume한다.

## 주요 기능

### 뷰 전환 상태 머신

Claude Code Panel 상단 영역은 세 가지 상태 중 하나를 표시한다:

| 상태 | 조건 | 표시 뷰 |
|---|---|---|
| `list` | 활성 세션 없음 + 과거 세션 있음 | 세션 목록 |
| `empty` | 활성 세션 없음 + 과거 세션 없음 | 빈 상태 안내 |
| `timeline` | 활성 세션 있거나, 사용자가 세션을 선택함 | 타임라인 (Phase 8) |

전환 트리거:

- `claude` 명령어 감지 → `timeline`
- 세션 항목 클릭 (resume) → `timeline`
- 활성 세션 종료 → `list` (과거 세션 있으면) 또는 `empty`
- `← 세션 목록` 버튼 클릭 → `list`
- 기존 `useTimeline` 훅의 session status(`active`, `inactive`, `none`)를 활용

### 세션 목록 뷰

```
┌─────────────────────────────────────────┐
│  Claude Code 세션                    ↻  │
│─────────────────────────────────────────│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ ● 03/21 14:30           2시간 전   ││
│  │   "버그 수정해줘"              12턴  ││
│  ├─────────────────────────────────────┤│
│  │   03/21 10:15           6시간 전   ││
│  │   "테스트 추가해줘"             8턴  ││
│  ├─────────────────────────────────────┤│
│  │   03/20 16:45              어제    ││
│  │   "리팩토링 해줘"              5턴  ││
│  └─────────────────────────────────────┘│
│                                         │
└─────────────────────────────────────────┘
```

- 헤더: "Claude Code 세션" 타이틀 + 새로고침 버튼 (↻)
- 각 항목 구성:
  - 1행: 절대 시간 (`MM/DD HH:mm`) + 상대 시간 (`fromNow`)
  - 2행: 첫 사용자 메시지 (1줄 truncate, 호버 시 전체 표시 — Tooltip)
  - 우측: 대화 턴 수 배지
- 현재 Surface의 `claudeSessionId`와 일치하는 세션은 `●` 마커 + `ui-purple` 액센트로 하이라이트
- 스크롤 가능한 목록 — 세션이 50건 초과 시 하단 도달 시 추가 로드
- 항목 호버: `bg-muted` 배경 + 커서 pointer
- 항목 클릭: resume 실행 (session-resume 기능으로 위임)

### 빈 상태 뷰

- Claude Code 아이콘 + "아직 세션이 없습니다" 메시지
- "터미널에서 `claude`를 실행하여 시작하세요" 부가 설명
- muted 톤 (`text-muted-foreground`)

### 타임라인 뷰 네비게이션

기존 Phase 8 타임라인 뷰 상단에 네비게이션을 추가한다:

- 좌측: `← 세션 목록` 버튼 (ChevronLeft 아이콘 + 텍스트)
- 클릭 시 세션 목록 뷰로 전환
- 활성 세션이 실행 중일 때도 세션 목록으로 돌아갈 수 있음
- 버튼 스타일: `variant="ghost"`, `text-muted-foreground`, 호버 시 `text-foreground`

### 로딩 상태

- 세션 목록 최초 로딩: skeleton UI (3~4개 항목 형태의 pulse 애니메이션)
- 추가 로드 (스크롤 페이지네이션): 목록 하단에 스피너
- 새로고침 버튼 클릭: 버튼 아이콘 회전 애니메이션 + 목록 갱신

### 에러 상태

- API 실패 시: "세션 목록을 불러올 수 없습니다" + 재시도 버튼
- 재시도 버튼 클릭 → API 재요청
- 에러 메시지는 `text-muted-foreground`, 재시도 버튼은 `variant="outline"`

### 다크 모드

- 세션 목록은 기존 Claude Code Panel의 다크 모드 테마를 따름
- 호버 배경: `bg-muted` (다크 모드에서도 동일 토큰)
- 하이라이트 액센트: `ui-purple` muted 팔레트 값

### 데이터 페칭

- 컴포넌트 마운트 시 `GET /api/timeline/sessions?tmuxSession={name}` 호출 (Panel의 tmux 세션명 전달 → 서버에서 cwd 조회)
- 응답을 상태로 관리 (`useState` 또는 `useSWR` 등)
- 새로고침 버튼: 수동 refetch
- 뷰 전환 시 (타임라인 → 목록): 자동 refetch (최신 목록 반영)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
