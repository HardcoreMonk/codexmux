# 사용자 흐름

## 1. 활성 세션 탐색 흐름

```
1. Claude Code Panel 마운트 (또는 claude 명령어 감지)
2. 서버에 활성 세션 조회 요청 (workspace 디렉토리 전달)
3. 서버: ~/.claude/sessions/ 디렉토리 스캔
   a. *.json 파일 목록 조회
   b. 각 파일 읽기 → { pid, sessionId, cwd, startedAt }
   c. cwd === workspace.directories[0] 필터링
   d. 매칭된 PID에 대해 ps -p {PID} 실행
      - 프로세스 실행 중 → 활성 세션
      - 프로세스 종료됨 → 무시
   e. 여러 활성 세션 → startedAt 최신 선택
4. 활성 세션 발견 시:
   a. sessionId → JSONL 파일 경로 도출
   b. ~/.claude/projects/{프로젝트명}/{sessionId}.jsonl
   c. 파일 존재 확인 → 경로 반환
5. 활성 세션 없을 시:
   a. ~/.claude/projects/{프로젝트명}/*.jsonl 스캔
   b. agent-*.jsonl 제외
   c. 수정 시간 최신순 정렬
   d. 첫 번째 파일 경로 반환 (또는 null)
```

## 2. 프로젝트 디렉토리 → 경로 변환 흐름

```
1. workspace.directories[0] = "/Users/subicura/Workspace/github.com/subicura/pt"
2. 경로 변환: "/" → "-" 치환
   → "-Users-subicura-Workspace-github-com-subicura-pt"
3. 프로젝트 디렉토리: ~/.claude/projects/-Users-subicura-Workspace-github-com-subicura-pt/
4. 디렉토리 존재 확인
   a. 존재 → 세션 파일 탐색
   b. 미존재 → null 반환 (Claude Code 미사용 프로젝트)
```

## 3. 새 세션 시작 감지 흐름

```
1. ~/.claude/sessions/ 디렉토리에 fs.watch 등록
2. 파일 변경 감지 (새 PID.json 생성)
3. debounce 200ms 적용 (파일 생성 직후 내용 미완성 방지)
4. 새 PID 파일 읽기 → { pid, sessionId, cwd }
5. cwd가 현재 Workspace와 일치?
   a. 일치 → 새 활성 세션으로 전환
      - 기존 watcher 해제
      - 새 JSONL 파일 경로 도출
      - realtime-watch에 파일 교체 알림
      - 클라이언트에 session-changed 전송
   b. 불일치 → 무시
```

## 4. 세션 종료 감지 흐름

```
1. 현재 감시 중인 PID를 10초 간격으로 검증
2. ps -p {PID} 실행
   a. 프로세스 실행 중 → 계속 감시
   b. 프로세스 종료됨:
      - 세션 상태를 'ended'로 표시
      - JSONL 파일 watcher는 유지 (마지막 기록 반영)
      - Panel 타입은 claude-code 유지 (자동 복귀 않음)
      - 새 세션 시작 감지는 계속 작동
```

## 5. 엣지 케이스

### PID 파일은 있으나 프로세스 종료됨

```
PID 파일 읽기 → pid: 12345
ps -p 12345 → 종료됨
├── 해당 PID 파일 무시
└── 다음 PID 파일 확인 또는 폴백 (최근 JSONL)
```

### 동일 프로젝트에 여러 활성 Claude 세션

```
PID 파일 A: { pid: 100, cwd: "/project", startedAt: 1000 }
PID 파일 B: { pid: 200, cwd: "/project", startedAt: 2000 }
├── 둘 다 ps -p 통과 (실행 중)
├── startedAt 최신 → PID B 선택
└── PID B의 sessionId로 JSONL 매핑
```

### JSONL 파일이 아직 생성되지 않음

```
PID 파일에서 sessionId 확보 → JSONL 경로 도출
├── 파일 미존재 (Claude Code가 아직 첫 엔트리를 기록하지 않음)
├── 빈 타임라인 표시 + fs.watch로 파일 생성 대기
└── 파일 생성 감지 → 즉시 파싱 시작
```

### ~/.claude/sessions/ 디렉토리 미존재

```
fs.watch 등록 실패
├── Claude Code 미설치로 판단
├── 클라이언트에 '미설치' 상태 전달
└── 주기적 재확인 (60초 간격) — 설치 후 자동 감지
```

### Workspace에 directories가 빈 배열

```
workspace.directories.length === 0
├── cwd 매칭 불가
├── null 반환 (세션 매핑 불가)
└── 빈 상태 UI 표시
```
