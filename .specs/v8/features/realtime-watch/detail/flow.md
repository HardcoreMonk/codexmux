# 사용자 흐름

## 1. 타임라인 WebSocket 연결 흐름

```
1. Claude Code Panel 마운트
2. GET /api/timeline/session → jsonlPath 확보
3. WebSocket 연결: ws://localhost:{port}/api/timeline?session={sessionName}&workspace={wsId}
4. 서버:
   a. jsonlPath 기반 JSONL 파일 전체 파싱 (session-parser)
   b. timeline:init 메시지로 전체 타임라인 전송
   c. fs.watch 등록 → 실시간 감시 시작
5. 클라이언트:
   a. timeline:init 수신 → 타임라인 state 초기화 + 렌더링
   b. 이후 timeline:append 수신 대기
```

### Optimistic UI

해당 없음. 타임라인은 읽기 전용 데이터이므로 optimistic update 적용 대상 아님.

## 2. 실시간 업데이트 흐름

```
1. Claude Code가 JSONL 파일에 새 줄 기록
2. fs.watch 이벤트 발생
3. debounce 50ms 적용 (빠른 연속 기록 병합)
4. 서버:
   a. 마지막 offset부터 증분 읽기 (session-parser.parseIncremental)
   b. 새 타임라인 엔트리 변환
   c. timeline:append 메시지로 전송
5. 클라이언트:
   a. timeline:append 수신
   b. 타임라인 state에 새 엔트리 append
   c. 자동 스크롤 활성 시 하단으로 스크롤
   d. 새 엔트리에 fadeIn 애니메이션
```

## 3. 세션 전환 흐름

```
1. session-detection에서 새 활성 세션 감지
2. 서버:
   a. 기존 fs.watch 해제
   b. 새 JSONL 파일에 fs.watch 등록
   c. 새 파일 전체 파싱
   d. timeline:session-changed 메시지 전송
   e. timeline:init 메시지 전송 (새 데이터)
3. 클라이언트:
   a. timeline:session-changed 수신 → 타임라인 state 초기화
   b. timeline:init 수신 → 새 타임라인 렌더링
```

## 4. 재연결 흐름

```
1. WebSocket 연결 끊김 감지
2. 클라이언트 상태 → 'reconnecting'
3. 지수 백오프 재연결 (1s, 2s, 4s, 8s, 최대 16s)
4. 재연결 성공:
   a. timeline:init 수신 → 전체 타임라인 재동기화
   b. 연결 끊김 동안 누락된 데이터 자동 보충
   c. 상태 → 'connected', 재연결 배너 제거
5. 재연결 실패 (최대 5회):
   a. 상태 → 'disconnected'
   b. 에러 배너 + "다시 시도" 버튼
   c. 기존 타임라인 데이터 유지
```

## 5. Panel 언마운트 흐름

```
1. Claude Code Panel 언마운트 (탭 전환, Panel 타입 변경, Pane 닫기)
2. 클라이언트:
   a. timeline:unsubscribe 메시지 전송
   b. WebSocket 연결 해제
3. 서버:
   a. 해당 연결의 구독 해제
   b. 다른 클라이언트가 동일 파일 감시 중이면 watcher 유지
   c. 마지막 구독자 해제 시 fs.watch 해제
```

## 6. 엣지 케이스

### 초기 로드 중 새 엔트리 도착

```
timeline:init 전송 중 (또는 직후)
├── fs.watch 이벤트 발생
├── 서버 큐에 새 엔트리 저장
├── init 전송 완료 후 큐의 엔트리를 timeline:append로 전송
└── 데이터 누락 없이 순서 보장
```

### JSONL 파일 삭제/이동

```
감시 중인 파일이 삭제됨
├── fs.watch 에러 이벤트 수신
├── watcher 해제
├── session-detection에 재탐색 요청
├── 새 파일 발견 → watcher 재등록
└── 파일 없음 → 빈 상태 표시
```

### 서버 재시작 시 감시 복원

```
서버 재시작
├── 클라이언트 WebSocket 연결 끊김 → 재연결 시도
├── 재연결 성공 → timeline:init으로 전체 재동기화
└── 감시 상태는 자동 복원 (연결 시 subscribe 처리)
```

### 동시 접속 클라이언트

```
클라이언트 A, B가 동일 세션 감시
├── fs.watch는 1개만 유지
├── 새 엔트리 → 두 클라이언트에 팬아웃 전송
├── 클라이언트 A 연결 해제 → 참조 카운트 1
├── 클라이언트 B 연결 해제 → 참조 카운트 0 → watcher 해제
```
