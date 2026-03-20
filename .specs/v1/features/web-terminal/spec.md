---
page: web-terminal
title: 웹 터미널
route: /
status: DRAFT
complexity: High
depends_on:
  - docs/STYLE.md
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# 웹 터미널

## 개요

브라우저 전체 화면에서 동작하는 터미널. xterm.js 기반으로 로컬 쉘과 동일한 경험을 제공하며, WebSocket을 통해 서버의 PTY 프로세스와 실시간 통신한다. Phase 1의 유일한 사용자 대면 페이지로, 이후 Phase에서 추가될 Surface/Pane/Workspace의 기반이 된다.

## 주요 기능

### 터미널 렌더링

- xterm.js를 사용하여 터미널을 렌더링
- `@xterm/addon-fit`으로 컨테이너에 맞는 cols/rows 자동 계산
- `@xterm/addon-webgl`로 GPU 가속 렌더링 (미지원 환경은 canvas 폴백)
- `@xterm/addon-web-links`로 터미널 내 URL 클릭 지원
- 전체 화면 레이아웃 — 브라우저 뷰포트를 100% 사용, 스크롤바 없음
- 스크롤백 버퍼 5,000줄 (기본 1,000줄 대비 확장, 실무 사용 기준)

### 테마 및 폰트

- 프로젝트 Muted 팔레트 기반 다크 테마 적용
  - 배경: Zinc 계열 다크 (`oklch(0.21 0.006 286)` 수준)
  - 텍스트: Zinc 밝은 톤 (`oklch(0.87 0.006 286)` 수준)
  - ANSI 16색을 Muted 팔레트에 맞춰 커스텀 매핑
  - 커서: `ui-blue` 계열
  - 선택 영역: `ui-purple/30` 계열
- 모노스페이스 웹폰트 (JetBrains Mono 또는 시스템 폴백)
- `text-sm` 기준 폰트 사이즈 (14px 상당, Tailwind 유틸리티 기준)

### WebSocket 연결 관리

- 페이지 마운트 시 `/api/terminal`로 WebSocket 자동 연결
- 바이너리 모드(ArrayBuffer)로 통신 — ANSI 이스케이프, 컬러, 유니코드 완전 지원
- 연결 상태 머신: `connecting` → `connected` → `disconnected`
- 자동 재연결: 지수 백오프 (1초 → 2초 → 4초 → 8초 → 16초, 최대 5회)
- 재연결 불가 시 수동 재연결 버튼 표시

### 연결 상태 인디케이터

- 터미널 우상단에 최소한의 상태 표시 (터미널 영역을 침범하지 않는 오버레이)
- `connected`: 표시 없음 (정상 상태는 비표시가 최선)
- `connecting`: 연결 중 스피너 + "연결 중..." 텍스트
- `reconnecting`: 재연결 시도 중 표시 + 시도 횟수
- `disconnected`: 연결 끊김 알림 + 재연결 버튼
- 상태 전환 시 부드러운 fade 트랜지션 (150ms)

### 터미널 리사이즈

- `@xterm/addon-fit`의 `fitAddon.fit()`으로 리사이즈 처리
- `ResizeObserver`로 컨테이너 크기 변경 감지
- 리사이즈 이벤트 디바운스 (100ms) — 연속 리사이즈 시 과도한 메시지 전송 방지
- 변경된 cols/rows를 WebSocket으로 서버에 전달

### 입력 처리

- 키 입력을 WebSocket으로 실시간 전송
- 한글 IME 조합 중 상태를 올바르게 처리 (compositionstart/compositionend)
- 클립보드 붙여넣기 지원 (브라우저 Clipboard API 연동)
- 텍스트 선택 후 복사 지원 (xterm.js 선택 API)

### 대량 출력 처리

- 서버에서 수신한 데이터를 청크 단위로 xterm.js에 write
- `requestAnimationFrame` 기반 배치 쓰기로 브라우저 프레임 드롭 방지
- 출력 속도가 렌더링 속도를 초과할 경우 내부 큐잉 후 순차 처리

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
