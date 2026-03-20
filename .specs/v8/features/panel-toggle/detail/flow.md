# 사용자 흐름

## 1. Terminal → Claude Code 수동 전환 흐름

```
1. 사용자가 탭 바의 Panel 전환 버튼 클릭
2. 현재 panelType === 'terminal' 확인
3. updateTabPanelType(paneId, tabId, 'claude-code') 호출
4. UI 즉시 반영 (optimistic):
   a. 아이콘 변경: BotMessageSquare → Terminal
   b. 탭 이름 옆 인디케이터 추가 (● ui-purple)
   c. 전환 애니메이션 시작 (150ms)
5. ClaudeCodePanel 마운트:
   a. 타임라인 영역 슬라이드 인
   b. 터미널 영역 축소
   c. 타임라인 WebSocket 연결 시작
6. layout.json 비동기 저장 (debounce)
```

### Optimistic UI

- panelType 변경은 로컬 state 즉시 반영
- layout.json 저장 실패해도 UI는 전환된 상태 유지
- 브라우저 새로고침 시에만 저장 실패 영향 (이전 상태로 복원)

## 2. Claude Code → Terminal 수동 전환 흐름

```
1. 사용자가 탭 바의 Panel 전환 버튼 클릭
2. 현재 panelType === 'claude-code' 확인
3. updateTabPanelType(paneId, tabId, 'terminal') 호출
4. UI 즉시 반영:
   a. 아이콘 변경: Terminal → BotMessageSquare
   b. 탭 인디케이터 제거
   c. 전환 애니메이션 시작 (150ms)
5. ClaudeCodePanel 언마운트:
   a. 타임라인 WebSocket 해제 (unsubscribe)
   b. 타임라인 영역 슬라이드 아웃
   c. 터미널 영역 전체 확장
6. TerminalContainer 마운트:
   a. 동일 sessionName으로 xterm.js 재생성
   b. 터미널 WebSocket 재연결
7. layout.json 비동기 저장
```

## 3. 빈 세션 상태에서 전환 흐름

```
1. Terminal 모드, claude 실행 전
2. 사용자가 Panel 전환 클릭 → Claude Code 모드
3. GET /api/timeline/session → status: "none"
4. 빈 상태 UI 표시 ("Claude Code 세션 없음")
5. 이후 사용자가 터미널에서 claude 실행:
   a. session-detection이 새 세션 감지
   b. 타임라인 WebSocket 연결
   c. 빈 상태 → 타임라인 표시로 전환
```

## 4. 엣지 케이스

### 전환 중 탭 전환

```
Panel 전환 애니메이션 중 (150ms)
├── 다른 탭 클릭
├── 현재 탭: 전환 애니메이션 완료 후 숨김 (Portal display: none)
├── 새 탭: 해당 탭의 panelType에 맞게 표시
└── 각 탭의 panelType은 독립적으로 유지
```

### 수동 전환 후 자동 감지 재동작

```
Claude Code 모드에서 수동으로 Terminal 전환
├── panelType === 'terminal'로 변경
├── claude가 아직 실행 중 → claude-detection 폴링 대상 복귀
├── 1.5초 이내 다시 자동 전환 시도
├── 무한 전환 방지: 수동 전환 후 10초간 자동 전환 억제
└── 10초 후 자동 전환 억제 해제
```

### 빠른 연속 전환 (토글 연타)

```
Terminal → Claude Code (150ms 애니메이션 시작)
├── 애니메이션 진행 중 재클릭 시도
├── 버튼 비활성 (disabled) → 클릭 무시
├── 150ms 후 버튼 재활성화
└── 재클릭 → Claude Code → Terminal 전환
```

### Pane 간 포커스 이동 후 전환

```
Pane A (Terminal) 포커스 → 전환 버튼 클릭
├── 현재 포커스된 Pane의 활성 탭 panelType 변경
├── Pane B로 포커스 이동 (⌥⌘→)
├── Pane B의 전환 버튼은 Pane B의 활성 탭 panelType 기준
└── 각 Pane 독립적으로 전환
```
