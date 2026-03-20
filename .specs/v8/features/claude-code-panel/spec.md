---
page: claude-code-panel
title: Claude Code Panel 컴포넌트
route: /
status: DETAILED
complexity: High
depends_on:
  - .specs/v8/features/panel-type-system/spec.md
  - .specs/v8/features/session-parser/spec.md
  - .specs/v8/features/session-detection/spec.md
  - .specs/v8/features/realtime-watch/spec.md
  - docs/STYLE.md
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# Claude Code Panel 컴포넌트

## 개요

Terminal Panel과 동일한 tmux 기반 터미널에 **타임라인 뷰**가 결합된 패널. 상단에 Claude Code 대화 흐름을 시각화하고, 하단에 축소된 터미널을 배치한다. 실시간 WebSocket을 통해 Claude Code 세션 진행 상황이 즉시 반영된다.

## 주요 기능

### 레이아웃 구성

```
┌─ Claude Code Panel ──────────────────────┐
│                                          │
│  [타임라인 영역] (대부분의 공간)           │
│  ├─ 14:30 사용자: "버그 수정해줘"         │
│  ├─ 14:30 Read src/main.ts              │
│  ├─ 14:31 Edit src/main.ts (+3, -1)     │
│  │         ▸ diff 보기                   │
│  ├─ 14:31 Agent: Explore (접힌 그룹)     │
│  └─ 14:32 "수정 완료했습니다"             │
│                                          │
│  ═══════════════════════════════════════ │
│  [터미널 영역] (축소 50%, 80 컬럼 기준)   │
│  $ claude                               │
│  ╭──────────────────────────────╮        │
│  │ >                           │        │
│  ╰──────────────────────────────╯        │
└──────────────────────────────────────────┘
```

- 상단 타임라인이 대부분의 공간 차지
- 하단 터미널은 CSS `transform: scale(0.5)` 등으로 축소 표시
- 터미널 크기는 80 컬럼 기준, 축소 비율에 맞게 컨테이너 크기 역산
- 상하 영역 간 드래그 핸들로 리사이즈 가능 (`react-resizable-panels` 활용)

### 타임라인 뷰

#### 사용자 메시지

- 말풍선 또는 구분된 블록으로 표시
- 타임스탬프 (dayjs `HH:mm` 포맷)
- muted 팔레트의 `ui-blue` 계열 액센트

#### 어시스턴트 응답

- **마크다운 렌더링**: `react-markdown` + 코드 블록 구문 강조
- 긴 응답은 초기 접기 + "더 보기" 확장
- muted 팔레트의 `ui-purple` 계열 액센트

#### 도구 호출

- 도구 아이콘 (lucide-react) + 도구 이름 + 요약 한 줄
  - Read: `FileText` 아이콘 + 파일 경로
  - Edit: `FilePen` 아이콘 + 파일 경로 + 변경 줄 수
  - Write: `FilePlus` 아이콘 + 파일 경로
  - Bash: `Terminal` 아이콘 + 명령어 첫 줄 + "N줄 출력"
  - Grep/Glob: `Search` 아이콘 + 패턴 + 결과 건수
- 성공/실패 상태: `ui-teal` (성공) / `ui-red` (실패, `is_error: true`)
- 도구 결과는 요약만 표시 (전체 내용 숨김)

#### diff 뷰

- Edit 도구 호출에 접기/펼치기 토글: "▸ diff 보기" / "▾ diff 숨기기"
- 펼침 시 `old_string` → `new_string` 인라인 diff 렌더링
  - 삭제된 줄: `bg-ui-red/10` 배경
  - 추가된 줄: `bg-ui-teal/10` 배경
- 접기/펼치기 상태는 세션 내에서만 유지 (영속화하지 않음)

#### 서브에이전트 그룹

- 접힌 그룹으로 표시: `▸ Agent: {타입} — {설명}` (예: `▸ Agent: Explore — 코드베이스 탐색`)
- muted `ui-gray` 계열로 메인 타임라인과 시각적 구분
- v8에서는 펼치기 불가 (Phase 9+에서 확장)

### 자동 스크롤

- 새 엔트리 추가 시 자동으로 하단 스크롤 (채팅 앱 패턴)
- 사용자가 위로 스크롤하여 과거 내용을 보는 중 → 자동 스크롤 중단
- 자동 스크롤 중단 시 하단에 "최신으로 이동" 플로팅 버튼 표시
- "최신으로 이동" 클릭 → 부드러운 스크롤로 하단 이동 + 자동 스크롤 재개

### 터미널 축소 영역

- 기존 TerminalContainer와 동일한 xterm.js + tmux 터미널
- CSS transform으로 시각적 축소 — xterm.js 내부 cols/rows는 변경하지 않음
- 축소 상태에서도 키보드 입력/출력 정상 동작
- 터미널 클릭 시 포커스 이동 (xterm.js focus())
- 축소 비율은 고정 (scale 50%)

### 빈 상태 처리

- 세션 파일이 없는 경우: "Claude Code 세션이 없습니다" 빈 상태 UI
- 세션 감지 대기 중: 스켈레톤 로딩 표시
- Claude Code 미설치: "Claude Code를 설치하세요" 안내 메시지

### 가상 스크롤

- 200+ 엔트리 세션에서도 부드러운 스크롤 유지
- `@tanstack/react-virtual`로 뷰포트 내 항목만 렌더링
- 동적 높이 항목 지원 (사용자 메시지, 도구 호출 등 높이가 다름)

### 타임라인 WebSocket 연동

- Claude Code Panel 마운트 시 `/api/timeline` WebSocket 연결
- `timeline:init` 수신 → 전체 타임라인 렌더링
- `timeline:append` 수신 → 새 엔트리 append + 자동 스크롤
- `timeline:session-changed` 수신 → 타임라인 초기화 + 재로드
- Panel 언마운트 시 WebSocket 연결 해제

### 다크 모드 대응

- 타임라인 영역: 기존 다크 모드 테마(Zinc 기반) 적용
- diff 뷰: 다크 모드에서도 가독성 확보 (삭제/추가 배경색 조정)
- 구분선/아이콘: muted 팔레트의 다크 모드 값 사용

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
