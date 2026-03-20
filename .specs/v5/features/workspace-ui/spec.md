---
page: workspace-ui
title: Workspace 사이드바 & 전환 UI
route: /
status: DRAFT
complexity: High
depends_on:
  - docs/STYLE.md
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# Workspace 사이드바 & 전환 UI

## 개요

Phase 4의 전역 단일 레이아웃에 좌측 사이드바를 추가하여 Workspace(프로젝트) 단위로 작업 환경을 전환한다. 각 Workspace는 프로젝트 디렉토리와 1:1 매핑되며, 사이드바를 통해 Workspace를 생성/전환/삭제/이름 변경할 수 있다. 전환 시 현재 레이아웃을 저장하고, 대상 Workspace의 Pane 트리를 렌더링하여 독립적인 작업 환경을 복원한다. 사이드바는 접기/펼치기를 지원하며, 접힌 상태에서는 완전히 숨겨 Phase 4와 동일한 UX를 유지한다.

## 주요 기능

### 사이드바 레이아웃

- 화면 좌측에 사이드바, 나머지 영역에 활성 Workspace의 Pane 레이아웃 배치
- 사이드바 너비: 기본 200px, 최대 320px, 드래그로 조절 가능
- 사이드바와 메인 영역 사이에 리사이즈 핸들 (react-resizable-panels v4 또는 별도 드래그 구현)
- 사이드바 리사이즈 시 메인 영역의 모든 Pane xterm.js `fit()` 호출 (스로틀)
- 사이드바 디자인: Muted 팔레트 다크 테마, 터미널 배경보다 약간 어두운 톤, STYLE.md 준수
- 사이드바 상단: 접기 토글 버튼 (chevron 아이콘)
- 사이드바 중앙: Workspace 목록 (스크롤 가능)
- 사이드바 하단: + 추가 버튼, 설정(⚙)/정보(ℹ) 아이콘 mock

### 사이드바 접기/펼치기

- 토글 버튼 클릭 시 사이드바 접기/펼치기 전환
- 접힌 상태: 사이드바 완전히 숨김 (0px), 터미널 영역이 전체 너비를 사용
- 접기/펼치기 시 200ms ease 애니메이션
- 접힌 상태에서 펼치기 버튼: 메인 영역 좌측 상단에 작은 chevron 또는 hover 시 나타나는 핸들
- 접기/펼치기 상태 + 사이드바 너비를 서버에 저장 (새로고침/재시작 후 복원)
- 접기/펼치기 시 메인 영역의 모든 Pane이 리사이즈 (xterm.js `fit()`)

### Workspace 목록

- 사이드바에 Workspace를 세로로 나열
- 각 항목: 프로젝트 이름 (디렉토리명에서 추출)
- 활성 Workspace: 좌측 `ui-purple` 보더(2px) + 배경색 변화
- 비활성 Workspace: hover 시 미세한 배경 밝기 변화
- Workspace가 많아지면 사이드바 내 세로 스크롤
- 페이지 로드 시 `GET /api/workspace`로 목록 조회 → 렌더링

### Workspace 생성

- 사이드바 하단 + 버튼 클릭 → 생성 다이얼로그 (shadcn/ui Dialog)
- 다이얼로그: 디렉토리 경로 입력 필드 (Input) + 확인/취소 버튼
- 입력 중 실시간 유효성 검증 (디바운스 300ms → `GET /api/workspace/validate`)
  - 디렉토리 미존재: 입력 필드 하단 에러 메시지 (빨간 텍스트)
  - 중복 디렉토리: "이미 등록된 디렉토리입니다" 에러
  - 유효: 자동으로 디렉토리명을 Workspace 이름으로 미리 표시
- 확인 클릭 → `POST /api/workspace` → 성공 시 사이드바에 추가 + 자동 활성화
- 생성 중 확인 버튼 로딩 피드백 (disabled + 스피너)
- 실패 시 toast 에러, 다이얼로그 유지

### Workspace 전환

- 사이드바에서 비활성 Workspace 클릭
- 전환 흐름:
  1. 클릭한 Workspace를 사이드바에서 즉시 활성 표시 (optimistic)
  2. 현재 레이아웃 저장 비동기 전송 (fire-and-forget)
  3. 현재 Workspace의 모든 xterm.js `dispose()` + WebSocket close (detach)
  4. 메인 영역에 미세한 로딩 인디케이터
  5. 대상 Workspace 레이아웃 로드 (`GET /api/layout?workspace={id}`)
  6. Pane 트리 렌더링 → 각 Pane의 xterm.js 생성 + WebSocket 연결 (병렬)
  7. 모든 WebSocket 연결 완료 후 포커스 Pane에 xterm.js `focus()`
  8. `PATCH /api/workspace/active` (디바운스)
- 전환 실패 시 이전 Workspace로 롤백 + toast 에러

### Workspace 삭제

- 사이드바 Workspace 항목 우클릭 → 컨텍스트 메뉴 (shadcn/ui ContextMenu) → "삭제"
- 확인 다이얼로그: "Workspace '{name}'을 닫으시겠습니까?"
- 확인 시:
  1. `DELETE /api/workspace/{id}` → 서버: 모든 tmux 세션 kill + 데이터 삭제
  2. 사이드바에서 제거 (fade out)
  3. 활성 Workspace였으면 인접 Workspace로 자동 전환
  4. 마지막 Workspace였으면 새 기본 Workspace 자동 생성
- 삭제 중 해당 항목 로딩 피드백 (opacity 감소)

### Workspace 이름 변경

- 사이드바 Workspace 항목 더블클릭 → 인라인 편집 모드
- 또는 우클릭 컨텍스트 메뉴 → "이름 변경"
- 인라인 input: 기존 이름이 선택된 상태, 탭 이름 편집과 동일한 UX
- Enter/blur → 확정 + `PATCH /api/workspace/{id}` 저장
- Escape → 취소 (이전 이름 복원)
- 빈 이름 → 디렉토리명으로 복원

### 사이드바 하단 (설정/정보 mock)

- 설정(⚙) 아이콘 버튼: 클릭 시 toast "추후 구현 예정"
- 정보(ℹ) 아이콘 버튼: 클릭 시 toast "추후 구현 예정"
- lucide-react 아이콘 사용 (`Settings`, `Info`)
- hover 시 미세한 배경 변화, 실제 기능 없는 placeholder

### 레이아웃 복원 (페이지 로드)

- 페이지 로드 시:
  1. `GET /api/workspace` → Workspace 목록 + 활성 Workspace ID + 사이드바 상태
  2. 사이드바 렌더링 (접기/펼치기 상태 복원, 너비 복원)
  3. 활성 Workspace의 레이아웃 로드 → Pane 트리 렌더링
  4. 각 Pane WebSocket 연결 (병렬)
  5. 포커스 Pane 복원
- Workspace 목록이 비면 기본 Workspace 자동 생성
- 조회 실패 시 에러 표시 + 재시도

### Workspace 전환 시 리소스 관리

- 비활성 Workspace 전환 시 현재 Workspace의 모든 클라이언트 리소스 해제:
  - xterm.js: `dispose()` → WebGL 컨텍스트, DOM 노드, addon 정리
  - WebSocket: close (서버: detaching=true → tmux detach, 세션 유지)
- 대상 Workspace 활성화 시 모든 리소스 새로 생성
- tmux 세션은 비활성 Workspace에서도 백그라운드 유지 (프로세스 중단 없음)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
