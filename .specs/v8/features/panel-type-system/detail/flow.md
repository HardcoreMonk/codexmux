# 사용자 흐름

## 1. panelType 변경 흐름

```
1. panelType 변경 트리거 발생 (수동 토글 또는 자동 감지)
2. updateTabPanelType(paneId, tabId, newPanelType) 호출
3. 로컬 state 즉시 업데이트 (optimistic)
   a. layout.root 트리에서 해당 탭의 panelType 변경
   b. PaneContainer 리렌더링 → 새 Panel 컴포넌트 마운트
4. PUT /api/layout → layout.json 저장 (비동기, debounce)
5. 새 Panel 컴포넌트 초기화
   a. terminal → claude-code: 타임라인 WebSocket 연결 + 데이터 로드
   b. claude-code → terminal: 타임라인 WebSocket 해제 + 터미널 전체 복원
```

### Optimistic UI

- panelType 변경은 로컬 state 즉시 반영 → 서버 저장은 비동기
- 저장 실패 시 롤백 불필요 (다음 저장 시 재시도, 브라우저 새로고침 시에만 영향)

## 2. 서버 재시작 → panelType 복원 흐름

```
1. 서버 시작 → layout.json 로드
2. 각 탭의 panelType 확인 (없으면 'terminal' 기본값)
3. 클라이언트에 layout 데이터 전달 (SSR 또는 API)
4. PaneContainer에서 panelType에 따라 올바른 Panel 렌더링
5. claude-code 타입 탭: 타임라인 WebSocket 자동 연결
```

## 3. Panel 전환 시 터미널 세션 유지 흐름

```
1. terminal 모드에서 프로세스 실행 중 (예: claude)
2. panelType을 claude-code로 변경
3. TerminalContainer 언마운트 — xterm.js 인스턴스 해제
4. ClaudeCodePanel 마운트
   a. 내부 TerminalContainer(축소)가 동일 sessionName으로 xterm.js 재생성
   b. WebSocket 재연결 → tmux 세션에 재attach
   c. 실행 중인 프로세스 출력 계속 수신
5. tmux 세션은 불변 — 프로세스 중단 없음
```

## 4. 엣지 케이스

### layout.json에 panelType 없는 기존 탭

```
서버 시작 → layout.json 로드
├── tab.panelType === undefined
├── 기본값 'terminal' 적용
└── TerminalContainer 렌더링 (기존과 동일)
```

### 동시에 여러 탭의 panelType 변경

```
탭 A panelType 변경 → debounce 타이머 시작
├── 100ms 이내 탭 B panelType 변경
├── debounce 리셋 → 두 변경 모두 포함한 layout 저장
└── API 1회 호출로 병합 저장
```

### panelType 변경 중 탭 전환

```
claude-code 탭에서 terminal 탭으로 전환
├── PaneContainer activeTabId 변경
├── 기존 ClaudeCodePanel 숨김 (Portal에서 display: none)
├── TerminalContainer 표시
└── 각 탭의 panelType 독립적으로 유지
```
