# 사용자 흐름

## 1. Claude Code Panel 초기화 흐름 (v9 확장)

```
1. PaneContainer에서 panelType === 'claude-code' 감지
2. ClaudeCodePanel 마운트
3. 병렬 초기화:
   a. 하단 TerminalContainer 마운트 → 터미널 WebSocket 연결
   b. GET /api/timeline/session → 활성 세션 정보 확보
4. 세션 정보 기반 분기:
   a. active → 타임라인 뷰 (Phase 8 동작 그대로)
   b. inactive → 타임라인 뷰 (읽기 전용) + 네비게이션 바 표시
   c. none/not-installed → 세션 목록 뷰로 전환
5. 세션 목록 뷰 전환 시:
   a. GET /api/timeline/sessions?tmuxSession={name} 호출
   b. 로딩 중: skeleton UI 3개 항목
   c. 응답 수신:
      - sessions.length > 0 → 세션 목록 렌더링
      - sessions.length === 0 → 빈 상태 뷰
      - 에러 → 에러 상태 + 재시도 버튼
```

## 2. 세션 목록 → 타임라인 전환 흐름

```
1. 세션 항목 클릭
2. 즉시 피드백:
   a. 클릭한 항목에 로딩 스피너 표시
   b. 나머지 항목 비활성화 (opacity-50)
3. session-resume 기능 호출 (WebSocket timeline:resume)
4. 응답 분기:
   a. resume-started → 타임라인 뷰로 전환
      - 타임라인 WebSocket subscribe
      - timeline:init 수신 → 렌더링
   b. resume-blocked → 토스트 경고 ("터미널에서 다른 프로세스가 실행 중입니다")
      - 세션 목록 상태 유지, 스피너 제거
   c. resume-error → 토스트 에러
      - 세션 목록 상태 유지, 스피너 제거
```

## 3. 타임라인 → 세션 목록 복귀 흐름

```
1. 타임라인 뷰에서 "← 세션 목록" 버튼 클릭
2. 타임라인 WebSocket unsubscribe
3. GET /api/timeline/sessions 재호출 (최신 목록 반영)
4. 세션 목록 뷰로 전환
5. 새로 로드된 목록 렌더링
```

## 4. 활성 세션 종료 → 세션 목록 자동 복귀 흐름

```
1. Claude Code 프로세스가 종료됨
2. session-detection에서 status 변경 감지: active → inactive
3. 클라이언트: useTimeline 훅에서 session status 변경 수신
4. 타임라인은 읽기 전용으로 유지 (즉시 세션 목록으로 전환하지 않음)
5. 사용자가 "← 세션 목록" 클릭 시 세션 목록으로 복귀
```

## 5. `claude` 명령어 직접 실행 → 타임라인 전환 흐름

```
1. 세션 목록 뷰 또는 빈 상태에서 하단 터미널에 `claude` 입력
2. Phase 8 claude 감지 로직 동작
3. session-detection: status → active, sessionId 획득
4. useTimeline 훅에서 상태 변경 감지
5. 자동으로 타임라인 뷰 전환 (세션 목록 건너뜀)
6. timeline WebSocket subscribe → 실시간 업데이트 시작
```

## 6. 새로고침 버튼 흐름

```
1. 세션 목록 헤더의 ↻ 버튼 클릭
2. 버튼 아이콘: animate-spin (1회전)
3. GET /api/timeline/sessions 재호출
4. 응답 수신 → 목록 교체 (기존 목록을 새 목록으로 대체)
5. 스크롤 위치 최상단으로 리셋
```

## 7. 스크롤 페이지네이션 흐름

```
1. 세션 목록에서 하단 도달 (scrollTop + clientHeight >= scrollHeight - 50px)
2. hasMore === true 확인
3. 하단에 로딩 스피너 표시
4. GET /api/timeline/sessions?tmuxSession={name}&offset={currentCount}&limit=50
5. 응답 수신 → 기존 목록 뒤에 append
6. hasMore === false → 더 이상 로드하지 않음
```

## 8. 엣지 케이스

### 세션 목록 로딩 중 탭 전환

```
세션 목록 API 요청 중 → 다른 탭으로 전환
├── ClaudeCodePanel 숨김
├── API 요청은 계속 진행
├── 응답 수신 → state 업데이트 (보이지 않지만 저장)
└── 탭 복귀 시 즉시 목록 표시 (재요청 불필요)
```

### resume 진행 중 탭 전환

```
resume 요청 전송 후 → 다른 탭으로 전환
├── WebSocket resume 응답은 계속 수신
├── resume-started 수신 → state에 타임라인 뷰 전환 기록
└── 탭 복귀 시 타임라인 뷰 표시
```

### 세션 목록과 타임라인 빠른 전환

```
세션 목록 → 항목 클릭 → resume 대기 → "← 세션 목록" 빠르게 클릭
├── resume 진행 중이면 뒤로가기 무시 (resume 완료까지 대기)
└── 또는 resume 취소 후 세션 목록 복귀 (구현 복잡도 고려)
```

### cwd 변경 후 세션 목록

```
터미널에서 cd /other/project 실행 → 세션 목록 새로고침
├── GET /api/timeline/sessions → 새 cwd 기반 조회
├── 다른 프로젝트의 세션 목록 표시
└── 이전 목록과 완전히 교체
```
