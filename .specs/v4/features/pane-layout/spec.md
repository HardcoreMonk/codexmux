---
page: pane-layout
title: Pane 분할 레이아웃
route: /
status: CONFIRMED
complexity: High
depends_on:
  - docs/STYLE.md
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# Pane 분할 레이아웃

## 개요

Phase 3의 단일 Pane 탭 UI를 트리 기반 분할 레이아웃으로 확장한다. `react-resizable-panels` v4를 사용하여 화면을 수평/수직으로 분할하고, 각 Pane이 독립적인 탭 그룹과 xterm.js 인스턴스를 가진다. 최대 3개 Pane을 지원하며, Pane 간 탭 이동(드래그 앤 드롭)과 포커스 관리를 포함한다. 단일 Pane 상태에서는 Phase 3과 동일한 UX를 유지한다.

## 주요 기능

### 레이아웃 트리 렌더링

- 이진 트리를 `Group`/`Panel`/`Separator` (react-resizable-panels v4)로 재귀 렌더링
- 리프 노드 = Pane 컴포넌트 (탭 바 + 터미널), 내부 노드 = `Group` (orientation + 비율)
- 초기 상태: 단일 리프 (Phase 3과 동일한 전체 화면 탭 + 터미널)
- 페이지 로드 시 `/api/layout`에서 트리 데이터를 조회하여 렌더링
- 트리 데이터가 없으면 기본 단일 Pane 생성

### Pane 분할

- 탭 바 영역에 수평 분할(┃) / 수직 분할(━) 아이콘 버튼 배치
- 클릭 시 포커스된 Pane을 50:50 비율로 분할
- 분할 시 새 Pane은 원래 Pane의 현재 작업 디렉토리(CWD)를 유지
  - 서버에 CWD 조회 요청 → 새 탭 생성 시 CWD 파라미터 전달
- 새 Pane은 "Terminal 1" 탭 1개 + 새 tmux 세션으로 시작
- 새 Pane에 자동 포커스 이동
- 분할 결과 Pane이 최소 크기(200×120px) 미만이면 분할 거부 (버튼 비활성화)
- **최대 3개 Pane**: 리프 노드 3개 도달 시 분할 버튼 비활성화 + 시각적 표시 (아이콘 dimmed)
- 분할 애니메이션: 새 Pane이 0 → 50% 비율로 확장되는 부드러운 전환

### Pane별 독립 xterm.js

- Phase 3의 단일 인스턴스 재활용 → Pane당 독립 인스턴스로 전환
- 각 Pane이 자체 xterm.js (WebGL + Canvas 폴백) + FitAddon을 생성
- 각 Pane이 활성 탭의 WebSocket을 독립 관리 (`clientId` Pane별 고유)
- Pane 컨테이너의 ResizeObserver로 xterm.js `fit()` 자동 호출
- Pane 닫기 시: xterm.js `dispose()` + WebSocket close + 리소스 정리
- 최대 3개 인스턴스이므로 WebGL GPU 리소스는 문제없음

### Pane별 독립 탭 그룹

- 각 Pane에 독립적인 탭 바 렌더링 (Phase 3 `tab-bar.tsx`를 Pane 단위로 확장)
- 탭 생성/전환/삭제/순서 변경/이름 변경은 Phase 3 동작을 Pane 범위 내에서 수행
- 탭 전환: 해당 Pane의 WebSocket만 끊고 재연결 (다른 Pane 영향 없음)
- 탭 생성 시 서버에 Pane ID를 포함하여 요청 → `layout.json`에 탭이 올바른 Pane에 추가
- Pane의 마지막 탭에서 `exit` 시:
  - 단일 Pane: 새 탭 자동 생성 (Phase 3 동작 유지)
  - 복수 Pane: 해당 Pane 닫기 (트리 재구성)

### Pane 리사이즈

- `Separator` 컴포넌트가 분할선 역할 — 드래그, 터치, 키보드 인터랙션 자동 처리
- `<Panel minSize={200}>` (수평) / `<Panel minSize={120}>` (수직)으로 최소 크기 보장
- 리사이즈 시 `onResize` 콜백 (`{ asPercentage, inPixels }`)으로 비율 감지
- xterm.js `fit()` + tmux `resize-window`를 `requestAnimationFrame` 스로틀로 호출
- 비율 변경 후 서버에 레이아웃 업데이트 (디바운스 300ms)
- 분할선 디자인: Muted 팔레트 oklch 기반, 시각 1~2px, 호버 시 밝기 변화
- 분할선 히트 영역은 라이브러리가 자동 처리 (시각보다 넓은 클릭 영역)

### Pane 닫기

- 각 Pane 탭 바에 닫기(×) 버튼 — Pane이 2개 이상일 때만 표시
- 닫기 시:
  1. 해당 Pane의 모든 탭의 tmux 세션 kill (서버 API 호출)
  2. xterm.js 인스턴스 + WebSocket 연결 정리
  3. 트리 재구성: 형제 Pane이 부모 영역 전체를 차지
  4. 닫힌 Pane이 포커스였으면 형제 Pane으로 포커스 이동
- 마지막 Pane은 닫기 버튼 미표시 (빈 화면 방지)
- 닫기 시 Pane이 축소 → 소멸되는 부드러운 전환

### Pane 포커스

- Pane 영역(터미널 또는 탭 바) 클릭 시 해당 Pane에 포커스
- 포커스된 Pane만 키 입력 수신 — 비포커스 Pane의 터미널은 출력만 표시
- 포커스 시각 표시: Muted 팔레트 `ui-purple` 또는 `ui-blue` 계열 보더(1~2px)
- 비포커스 Pane: 보더 없음 또는 매우 연한 보더
- 새 Pane 생성 / 형제 Pane 닫기 시 자동 포커스 이동
- 포커스 전환 시 대상 Pane의 xterm.js에 `focus()` 호출
- 포커스 이동 단축키는 Phase 7로 보류 (클릭으로만 이동)

### Pane 간 탭 이동 (드래그 앤 드롭)

- 탭을 드래그하여 다른 Pane의 탭 바에 드롭하면 탭이 이동
- tmux 세션은 유지 — `layout.json`에서 소속 Pane만 변경
- 드래그 UX:
  - **반투명 탭 고스트**: 드래그 중 커서 근처에 원본 탭의 축소 복제본 표시
  - **탭 바 하이라이트**: 드롭 대상 Pane의 탭 바 전체가 하이라이트
  - **삽입 위치 인디케이터**: 탭 바 내 드롭 위치에 수직 라인 표시
- 이동 후 원래 Pane 탭이 비면:
  - 단일 Pane: 새 탭 자동 생성
  - 복수 Pane: 빈 Pane 닫기 → Pane 수가 줄어 분할이 다시 가능해지는 자연스러운 순환
- 같은 Pane 내 드래그는 기존 순서 변경 동작 (Phase 3 탭 드래그 재정렬)

### 레이아웃 복원 (페이지 로드 / 새로고침)

- 페이지 로드 시 `/api/layout` 조회 → 트리 렌더링
- 각 Pane이 자신의 활성 탭 세션에 WebSocket 연결
- 포커스된 Pane ID 복원 → 해당 Pane에 포커스 설정
- 레이아웃 조회 실패 시: 기본 단일 Pane으로 폴백 + 에러 표시
- 조회 중 로딩 상태: 터미널 영역에 스켈레톤 또는 미세한 로딩 인디케이터

### 브라우저 리사이즈 대응

- 브라우저 창 크기 변경 시 모든 Pane의 xterm.js가 올바르게 리사이즈
- `react-resizable-panels`가 비율 기반으로 자동 재배치
- 각 Pane의 ResizeObserver → `fit()` → tmux `resize-window` (스로틀 적용)
- 최소 Pane 크기(200×120px) 이하로 축소되지 않음 (`minSize` prop 보장)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
