# 사용자 흐름

## 1. 세션 목록 조회 흐름

```
1. 클라이언트: GET /api/timeline/sessions?tmuxSession={name} 요청
2. 서버: tmux에서 cwd 조회
   a. tmux display-message -t {name} -p "#{pane_current_path}"
   b. 실패 시 → 404 응답
3. 서버: cwd → Claude 프로젝트 경로 변환
   a. /Users/foo/project → -Users-foo-project
   b. ~/.claude/projects/{변환된 경로}/ 디렉토리 확인
   c. 디렉토리 없음 → { sessions: [], total: 0 } 응답
4. 서버: 디렉토리 내 .jsonl 파일 목록 조회
   a. fs.readdir
   b. agent-*.jsonl 패턴 필터링 제외
5. 서버: 각 파일 메타정보 병렬 파싱
   a. fs.stat → startedAt (birthtime), lastActivityAt (mtime)
   b. readline → 첫 번째 라인 JSON 파싱 → startedAt (타임스탬프)
   c. readline → 첫 human 메시지 발견 시 중단 → firstMessage
   d. 전체 스트리밍 → "type":"human" 카운트 → turnCount
   e. 파싱 실패 → 해당 파일 건너뜀 (에러 로그)
6. 서버: lastActivityAt 내림차순 정렬
7. 서버: offset/limit 적용 → 응답 전송
```

## 2. 캐시 히트 흐름

```
1. 클라이언트: 동일 tmuxSession으로 30초 내 재요청
2. 서버: 메모리 캐시에서 조회
   a. 캐시 키: 변환된 프로젝트 경로
   b. 캐시 히트 → fs.stat만 재조회 (mtime 변경 확인)
   c. mtime 변경 없음 → 캐시 응답 반환
   d. mtime 변경 있음 → 해당 파일만 재파싱
3. 서버: 정렬 + 페이지네이션 → 응답
```

## 3. 페이지네이션 흐름

```
1. 클라이언트: ?tmuxSession={name}&limit=50&offset=0 (초기 로드)
2. 서버: 전체 목록 파싱 → 50건 반환 + total 포함
3. 클라이언트: 스크롤 하단 도달 → ?tmuxSession={name}&limit=50&offset=50
4. 서버: 동일 목록에서 offset 적용 → 다음 50건 반환
```

## 4. 엣지 케이스

### tmux 세션이 존재하지 않음

```
요청: GET /api/timeline/sessions?tmuxSession=pt-invalid
├── tmux display-message 실패
└── 응답: 404 { error: 'tmux session not found' }
```

### 프로젝트에 Claude 세션 기록 없음

```
cwd 변환 → ~/.claude/projects/{path}/ 디렉토리 없음
└── 응답: 200 { sessions: [], total: 0 }
    → 클라이언트: 빈 상태 뷰
```

### 대량 세션 (100+)

```
파일 100개 이상
├── Promise.allSettled로 병렬 파싱 (최대 10개 동시)
├── 파싱 실패 파일 건너뜀
├── 500ms 이내 응답 목표
└── 초과 시: limit 기본값 50으로 초기 응답 빠르게 반환
```

### 파일 파싱 중 JSONL 형식 오류

```
세션 파일 중 일부가 손상됨
├── 해당 파일만 sessions 목록에서 제외
├── 나머지 정상 파일은 모두 반환
└── 서버 로그에 경고 기록 (console.warn)
```
