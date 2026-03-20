# 사용자 흐름

## 1. 세션 ID 저장 흐름 (자동 감지)

```
1. Phase 8 로직: 터미널에서 claude 명령어 실행 감지
2. session-detection에서 활성 세션 정보 획득:
   - PID 파일에서 sessionId 추출
3. 해당 Surface의 claudeSessionId 필드 업데이트
4. 기존 debounce 저장 메커니즘으로 layout.json 반영
```

## 2. 세션 ID 저장 흐름 (수동 resume)

```
1. 세션 목록에서 항목 클릭 → session-resume 실행
2. resume-started 응답에 sessionId 포함
3. 서버: 해당 Surface의 claudeSessionId 업데이트
4. layout.json 저장
```

## 3. 세션 ID 클리어 흐름

```
1. 사용자: Panel 타입을 terminal로 수동 전환 (토글 버튼)
2. 해당 Surface의 panelType → 'terminal'
3. claudeSessionId → null
4. layout.json 저장
(참고: 세션 종료 시에는 클리어하지 않음)
```

## 4. 서버 재시작 시 자동 resume 흐름

```
1. 서버 시작 → layout.json 로드
2. 전체 Surface 스캔:
   a. panelType === 'claude-code' + claudeSessionId !== null인 Surface 목록 추출
   b. 목록이 비어있으면 → 종료 (자동 resume 대상 없음)
3. 각 Surface에 대해 순차 처리 (간격 2초):
   a. tmux 세션 존재 확인
      - 없으면 → 새 tmux 세션 생성 (Phase 2 복원 로직)
   b. tmux 포그라운드 프로세스 확인
      - claude 실행 중 → 타임라인만 복원 (skip resume)
      - 셸 대기 중 → 계속 진행
   c. 딜레이 1초 (셸 준비 대기)
   d. tmux send-keys -t {session} "claude --resume {sessionId}" Enter
   e. 세션 JSONL 파일 경로 매핑 → fs.watch 시작
4. 클라이언트 연결 시:
   a. Claude Code Panel 마운트
   b. GET /api/timeline/session → active 상태 감지
   c. 타임라인 WebSocket subscribe → 실시간 업데이트
```

## 5. 자동 resume 실패 → 세션 목록 fallback 흐름

```
1. 서버: claude --resume {sessionId} 전송
2. 10초 타이머 시작
3. 10초 내에 session-detection에서 active 감지 안 됨
4. fallback:
   a. claudeSessionId는 유지 (layout.json 변경 없음)
   b. 클라이언트 연결 시: session status → none/inactive
   c. 세션 목록 뷰로 전환 (session-list-ui 로직)
   d. 사용자가 수동으로 다른 세션 선택 가능
```

## 6. 복수 Surface 순차 resume 흐름

```
layout.json에 3개 Surface가 claude-code + sessionId:

Surface A (tab-1): sessionId = "abc123"
Surface B (tab-2): sessionId = "def456"
Surface C (tab-3): sessionId = "ghi789"

실행 순서:
1. [0초] Surface A: tmux send-keys → claude --resume abc123
2. [2초] Surface B: tmux send-keys → claude --resume def456
3. [4초] Surface C: tmux send-keys → claude --resume ghi789

각각 독립적인 tmux 세션이므로 병렬 실행 가능하지만,
서버 부하 분산을 위해 2초 간격 순차 실행
```

## 7. 엣지 케이스

### 저장된 sessionId의 JSONL 파일이 삭제됨

```
서버 재시작 → claude --resume {id} 전송
├── Claude Code CLI가 "session not found" 에러 출력
├── 프로세스 즉시 종료
├── session-detection: status 변경 없음 (active 안 됨)
├── 10초 타임아웃 → fallback
└── 세션 목록 뷰에서 다른 세션 선택 가능
    (claudeSessionId는 유지, 세션 목록에서 해당 세션은 표시 안 됨)
```

### 기존 layout.json에 claudeSessionId 필드 없음 (마이그레이션)

```
v8 → v9 업데이트 후 첫 서버 시작
├── layout.json의 Surface에 claudeSessionId 필드 없음
├── undefined → null로 처리
├── 자동 resume 대상에서 제외
└── 이후 세션 연결 시 정상적으로 claudeSessionId 저장
```

### 서버 재시작 중 사용자가 브라우저 접속

```
서버 시작 → 자동 resume 진행 중 → 클라이언트 연결
├── Surface의 claude 프로세스가 아직 시작 안 됨
├── GET /api/timeline/session → none
├── 세션 목록 뷰 표시
├── 1~2초 후 claude 프로세스 시작
├── session-detection: active 감지
└── 자동으로 타임라인 뷰 전환
```

### tmux 세션이 완전히 초기화됨 (tmux 서버 재시작)

```
서버 재시작 + tmux도 재시작 (세션 없음)
├── tmux 세션 없음 → Phase 2 복원 로직으로 새 세션 생성
├── 새 셸이 시작됨 (cwd는 기본 디렉토리)
├── claude --resume {sessionId} 전송
├── cwd가 원래 프로젝트와 다를 수 있음
└── Claude Code CLI가 cwd 무관하게 sessionId로 resume 가능
```
