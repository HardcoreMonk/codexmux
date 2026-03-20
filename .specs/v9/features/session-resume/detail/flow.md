# 사용자 흐름

## 1. 수동 resume 흐름 (세션 목록에서 클릭)

```
1. 사용자: 세션 목록에서 항목 클릭
2. 클라이언트:
   a. 클릭한 항목에 스피너 표시
   b. 나머지 항목 비활성화
   c. WebSocket timeline:resume 메시지 전송
      payload: { sessionId, tmuxSession }
3. 서버:
   a. tmux list-panes -t {tmuxSession} -F "#{pane_current_command}"
   b. 포그라운드 프로세스 확인:
      - bash/zsh/fish → 안전, 계속 진행
      - 기타 프로세스 → timeline:resume-blocked 전송, 중단
   c. tmux send-keys -t {tmuxSession} "claude --resume {sessionId}" Enter
   d. claudeSessionId를 layout.json에 저장
   e. 해당 세션 JSONL 파일 경로 확인
   f. timeline:resume-started 전송 { sessionId, jsonlPath }
4. 클라이언트:
   a. resume-started 수신
   b. timeline:subscribe 메시지 전송 (jsonlPath)
   c. 타임라인 뷰로 전환
   d. timeline:init 수신 → 타임라인 렌더링
```

## 2. resume 차단 흐름

```
1. 서버: 포그라운드 프로세스가 셸이 아님 (예: node, vim)
2. 서버 → 클라이언트: timeline:resume-blocked
   payload: { reason: 'process-running', processName: 'node' }
3. 클라이언트:
   a. sonner 토스트 경고 표시
   b. 스피너 제거
   c. 항목 재활성화
   d. 세션 목록 상태 유지
```

## 3. resume 에러 흐름

```
1. 서버: tmux send-keys 실패 또는 예외 발생
2. 서버 → 클라이언트: timeline:resume-error
   payload: { message: "tmux send-keys 실패" }
3. 클라이언트:
   a. sonner 토스트 에러 표시
   b. 스피너 제거
   c. 항목 재활성화
   d. 세션 목록 상태 유지
```

## 4. resume 후 세션 감지 흐름

```
1. resume-started 수신 후 타임라인 뷰 전환
2. Claude Code CLI가 시작되면:
   a. ~/.claude/sessions/{PID}.json 생성
   b. session-detection이 active 상태 감지
   c. JSONL 파일에 기록 시작
   d. fs.watch가 변경 감지 → timeline:append 전송
3. 기존 Phase 8 실시간 업데이트 흐름과 동일하게 진행
```

## 5. 엣지 케이스

### 중복 클릭 방지

```
항목 클릭 → resume 진행 중
├── 동일 항목 재클릭 → 무시 (pointer-events-none)
├── 다른 항목 클릭 → 무시 (pointer-events-none)
└── resume 완료/실패 후 재활성화
```

### resume 후 Claude Code가 바로 종료

```
claude --resume {id} 전송 → Claude Code가 에러로 즉시 종료
├── session-detection: active → inactive (빠르게 전환)
├── 타임라인: 짧은 에러 메시지만 표시
└── 사용자: "← 세션 목록"으로 복귀 가능
```

### WebSocket 연결이 끊긴 상태에서 resume 시도

```
WebSocket disconnected 상태
├── resume 메시지 전송 불가
├── 클라이언트: sonner 토스트 "연결이 끊어졌습니다. 재연결 중..."
├── 자동 재연결 후 재시도 가능
└── 재연결 실패 시 세션 목록에서 수동 재시도
```

### 동일 세션을 여러 탭에서 resume

```
Tab1: claude --resume abc123
Tab2: claude --resume abc123 (동일 세션)
├── 두 탭 모두 resume 성공
├── Claude Code CLI가 두 번째 인스턴스를 에러로 종료할 수 있음
└── 서버 단에서는 별도 제약 없음 (CLI 레벨 처리)
```
