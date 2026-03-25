---
page: message-history-ui
title: 메시지 히스토리 UI
route: /
status: DETAILED
complexity: High
depends_on:
  - .specs/v16/features/message-history-server/spec.md
  - .specs/v10/features/web-input/spec.md
  - docs/STYLE.md
created: 2026-03-25
updated: 2026-03-25
assignee: ''
---

# 메시지 히스토리 UI

## 개요

입력창 왼쪽에 시계 아이콘을 배치하고, 클릭 시 이전 전송 메시지 목록을 Popover(데스크톱)/Drawer(모바일)로 표시한다. 검색 필터, 개별 삭제, 항목 선택 시 입력창 채움 기능을 제공한다. 터미널의 `history` 명령어와 유사한 UX를 목표로 한다.

## 주요 기능

### 클라이언트 훅 (`hooks/use-message-history.ts`)

- `GET /api/message-history?wsId=...`로 목록 fetch
- Popover/Drawer 열릴 때 최신 데이터 로드 (매번 fetch, 캐시 없음)
- `addHistory(message)`: POST 호출 → 로컬 상태 낙관적 업데이트 (즉시 목록 반영, 실패 시 롤백)
- `deleteHistory(id)`: DELETE 호출 → 로컬 상태에서 즉시 제거 (낙관적 업데이트)
- 검색 필터: 클라이언트 측 문자열 매칭 (500개 이하이므로 서버 필터 불필요)
- 로딩 상태: fetch 중 스켈레톤 또는 스피너 표시
- 에러 상태: fetch 실패 시 "불러오기 실패" 안내 + 재시도 가능

### send() 통합 (`hooks/use-web-input.ts` 수정)

- `send()` 함수 내에서 메시지 전송 성공 후 `addHistory(message)` 호출
- 제외 조건: `RESTART_COMMANDS`에 해당하는 커맨드는 저장하지 않음
- 빈 문자열, 공백만 있는 메시지는 저장하지 않음 (기존 early return 이후이므로 자연스럽게 처리)
- 히스토리 저장 실패가 메시지 전송을 블로킹하지 않음 (fire-and-forget)

### 시계 아이콘 (`components/features/web-input-bar.tsx` 수정)

- textarea 왼쪽에 `Clock` 아이콘 (lucide-react) 배치
- 레이아웃: `[Clock] [Textarea] [Send]`
- 히스토리가 비어있을 때 아이콘 disabled 처리 (`opacity-50`, `pointer-events-none`)
- 전체 disabled 모드일 때 아이콘도 비활성화
- 아이콘 hover 시 subtle한 배경 변화 (기존 버튼 스타일 준수)
- 아이콘 클릭 시 Popover/Drawer 토글

### Popover + Command (데스크톱)

- shadcn `Popover` + `Command` 조합
- 최대 높이 300~400px, 스크롤 처리
- 검색 입력 필드 상단 배치 (Command의 기본 검색)
- 각 항목 구성:
  - 메시지 텍스트: 한 줄 truncate (멀티라인 메시지는 첫 줄만 표시)
  - 상대 시간: `dayjs.fromNow()` (오른쪽 정렬, muted 색상)
  - X 버튼: 항목 오른쪽, 개별 삭제 (클릭 시 이벤트 전파 차단)
- 항목 클릭 동작:
  1. 입력창(textarea)에 메시지 채움 (기존 내용 덮어쓰기)
  2. Popover 닫힘
  3. textarea 포커스 이동
  4. 즉시 전송하지 않음 — 사용자가 확인/수정 후 Enter
- 빈 상태: "히스토리가 없습니다" 안내 문구 (Command.Empty)
- 검색 결과 없음: "검색 결과가 없습니다" 안내 문구

### Drawer + Command (모바일)

- `useIsMobileDevice` 훅으로 분기
- shadcn `Drawer` + `Command` 조합
- 데스크톱과 동일한 항목 구성 및 동작
- Drawer 하단에서 올라오는 형태
- 검색 입력 필드 + 스크롤 가능한 목록

### 다크 모드

- 모든 UI 요소는 기존 shadcn 토큰 사용 (자동 다크 모드 대응)
- 시계 아이콘: `text-muted-foreground`
- 항목 hover: 기존 Command 스타일 준수

### 인터랙션 피드백

- 삭제 시 항목 즉시 제거 (낙관적 업데이트, 애니메이션 불필요)
- 항목 클릭 시 Popover/Drawer 즉시 닫힘
- 검색 입력 시 실시간 필터링 (debounce 불필요, 500개 이하)

### 접근성

- 시계 아이콘에 `aria-label="메시지 히스토리"` 설정
- Command 컴포넌트의 키보드 네비게이션 기본 지원 (화살표 키, Enter)
- Popover/Drawer 열릴 때 검색 입력에 자동 포커스

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-25 | 초안 작성 | DRAFT |
