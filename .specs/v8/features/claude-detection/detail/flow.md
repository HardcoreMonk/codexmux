# 사용자 흐름

## 1. claude 명령어 감지 기본 흐름

```
1. 서버 시작 시 감지 폴링 시작
2. 1~2초 간격으로 활성 탭의 tmux 세션 확인:
   a. tmux -L purple display-message -t {sessionName} -p '#{pane_current_command}'
   b. 반환값 확인
3. 반환값 === 'claude':
   a. 해당 탭의 panelType 확인
   b. panelType === 'terminal':
      - updateTabPanelType(paneId, tabId, 'claude-code') 호출
      - session-detection으로 활성 세션 매핑 시작
      - 클라이언트에 panelType 변경 알림
   c. panelType === 'claude-code':
      - 이미 전환됨 → 무시 (중복 전환 방지)
4. 반환값 !== 'claude':
   a. panelType 변경하지 않음 (자동 복귀 안 함)
   b. 다음 폴링 대기
```

## 2. 폴링 대상 관리 흐름

```
1. Workspace 전환 시:
   a. 이전 Workspace의 탭 폴링 중지
   b. 새 Workspace의 활성 탭들을 폴링 대상으로 등록
2. 탭 생성 시:
   a. 새 탭을 폴링 대상에 추가
3. 탭 삭제 시:
   a. 해당 탭을 폴링 대상에서 제거
4. 이미 panelType === 'claude-code'인 탭:
   a. 폴링 대상에서 제외 (불필요한 폴링 방지)
```

## 3. claude 종료 후 흐름

```
1. 폴링에서 반환값이 'claude'에서 다른 값으로 변경 (예: 'zsh')
2. panelType은 'claude-code' 유지 (자동 복귀 안 함)
3. 타임라인은 마지막 상태 유지 (정적 표시)
4. 사용자 선택:
   a. 타임라인 계속 확인 → 그대로 사용
   b. 터미널로 돌아가기 → 수동 토글 (panel-toggle)
   c. 다시 claude 실행 → 새 세션 감지 → 타임라인 갱신
```

## 4. 클라이언트 알림 흐름

```
1. 서버에서 panelType 변경 결정
2. 알림 방식:
   a. 기존 터미널 WebSocket이 있으면 → 커스텀 메시지로 알림
   b. 또는 클라이언트 폴링 → GET /api/layout 재조회
   c. 결정: 서버가 layout.json 저장 → 클라이언트가 폴링/SSE로 감지
3. 클라이언트:
   a. panelType 변경 감지
   b. PaneContainer 리렌더링 → ClaudeCodePanel 마운트
   c. 타임라인 WebSocket 연결 시작
```

## 5. 엣지 케이스

### tmux 세션이 아직 생성되지 않음

```
탭 생성 직후 (tmux 세션 생성 중)
├── tmux display-message 실패 → 무시
├── 다음 폴링에서 재시도
└── 세션 생성 완료 후 정상 감지
```

### claude가 아닌 유사 프로세스

```
사용자가 'claude-cli' 또는 'claude_runner' 등 실행
├── #{pane_current_command} === 'claude-cli'
├── 'claude'와 정확히 일치하지 않음
├── 감지하지 않음 → panelType 변경 없음
```

### 여러 Pane에서 동시에 claude 실행

```
Pane A: claude 실행 → panelType 자동 전환
Pane B: claude 실행 → panelType 자동 전환
├── 각 Pane 독립적으로 전환
├── 각 탭의 tmux 세션별로 개별 감지
└── 타임라인은 각각의 세션 매핑
```

### tmux 서버 미응답

```
tmux -L purple display-message 실행 → 타임아웃
├── 해당 폴링 사이클 스킵
├── 에러 로그 기록
├── 30초 후 폴링 재개
└── tmux 서버 복원 시 자동 정상화
```

### 수동 전환 후 자동 감지 재동작

```
사용자가 수동으로 claude-code → terminal 전환
├── panelType === 'terminal'로 변경
├── 해당 탭이 다시 폴링 대상에 포함
├── tmux 세션에서 claude가 아직 실행 중이면 → 다시 자동 전환
└── 무한 전환 방지: 수동 전환 후 일정 시간(10초) 동안 자동 전환 억제
```
