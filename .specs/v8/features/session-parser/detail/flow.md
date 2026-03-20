# 사용자 흐름

## 1. 전체 파일 파싱 흐름 (초기 로드)

```
1. 대상 JSONL 파일 경로 수신 (session-detection에서 제공)
2. 파일 크기 확인
   a. 1MB 미만 → 전체 파싱 모드
   b. 1MB 이상 → tail 모드 (마지막 200 엔트리)
3. 파일 읽기 (fs.readFile 또는 스트림)
4. 줄 단위 분리 → 빈 줄 필터링
5. 각 줄 파싱:
   a. JSON.parse() → 성공 → Zod safeParse()
   b. JSON.parse() 실패 → 무시 (해당 줄 스킵)
   c. Zod 검증 실패 → 무시 (해당 줄 스킵)
6. 엔트리 타입 필터링:
   a. type === 'assistant' || type === 'user' → 대상
   b. isSidechain === true → 서브에이전트 그룹으로 분류
   c. 기타 → 제외
7. 타임라인 엔트리 변환:
   a. assistant text → ITimelineAssistantMessage
   b. assistant tool_use → ITimelineToolCall (요약 생성)
   c. user tool_result → ITimelineToolResult (요약 생성)
   d. user text (비 tool_result) → ITimelineUserMessage
   e. 연속 sidechain 엔트리 → ITimelineAgentGroup
8. 변환된 배열 반환 + 마지막 byte offset 기록
```

### Optimistic UI 해당 없음

파싱은 서버 측 동작이므로 optimistic UI 적용 대상 아님.

## 2. 증분 파싱 흐름 (실시간 업데이트)

```
1. fs.watch에서 파일 변경 감지 (realtime-watch에서 호출)
2. 마지막 byte offset부터 파일 끝까지 읽기
   a. fd = fs.open(filePath, 'r')
   b. fs.read(fd, buffer, 0, size - lastOffset, lastOffset)
3. 새 데이터를 줄 단위로 분리
4. 마지막 줄이 불완전하면 (줄바꿈 없음) → 버퍼에 보관, 다음 읽기에 합치기
5. 완전한 줄만 파싱 (위 전체 파싱의 5~7단계와 동일)
6. 새 타임라인 엔트리 배열 반환
7. byte offset 갱신
```

## 3. 도구 호출 요약 생성 흐름

```
1. tool_use 블록 수신: { type: "tool_use", name, input }
2. name 기반 분기:
   a. "Read" → input.file_path 추출 → "Read {path}"
   b. "Edit" → input.file_path + old_string/new_string 줄 수 계산
                → "Edit {path} (+{added}, -{removed})"
   c. "Write" → input.file_path → "Write {path}"
   d. "Bash" → input.command 첫 줄 → "$ {command}"
   e. "Grep" → input.pattern + 결과 건수 → "Grep \"{pattern}\" → {n}건"
   f. 기타 → "{name} {input의 첫 번째 키값}"
3. 해당 tool_result에서 상태 추출:
   a. is_error === true → status: 'error'
   b. 아직 결과 없음 → status: 'pending'
   c. 정상 결과 → status: 'success'
```

## 4. 서브에이전트 그룹화 흐름

```
1. 엔트리 순회 중 isSidechain === true 발견
2. 연속된 sidechain 엔트리를 그룹으로 수집
3. 그룹의 첫 번째 엔트리에서 agentType 추출 (가능하면)
4. 메인 타임라인의 해당 위치에 직전 assistant의 tool_use 중
   Agent 관련 도구 호출과 매칭
5. ITimelineAgentGroup 생성:
   - agentType: 추출된 타입 또는 'Unknown'
   - description: 첫 user 메시지 또는 도구 설명
   - entryCount: 그룹 내 엔트리 수
```

## 5. 엣지 케이스

### 빈 JSONL 파일

```
파일 크기 0 → 빈 배열 반환
└── 클라이언트에서 빈 상태 UI 표시
```

### JSON.parse 실패 (손상된 줄)

```
줄 파싱 실패
├── 해당 줄 무시
├── 다음 줄 계속 파싱
└── 전체 파싱 실패하지 않음 (graceful degradation)
```

### 증분 읽기 중 파일이 교체됨 (새 세션)

```
이전 세션의 offset으로 새 파일 읽기 시도
├── 새 파일 크기 < 이전 offset → offset 리셋 (0부터 전체 재파싱)
└── realtime-watch에서 session-changed 이벤트 발생 시 offset 리셋
```

### 불완전한 마지막 줄

```
파일 끝이 줄바꿈으로 끝나지 않음 (기록 진행 중)
├── 마지막 불완전한 줄은 pendingBuffer에 보관
├── 다음 증분 읽기에서 pendingBuffer + 새 데이터 합치기
└── 합쳐진 데이터에서 완전한 줄만 파싱
```

### 매우 긴 단일 줄 (대용량 tool_result)

```
한 줄이 수 MB (예: 큰 파일 읽기 결과)
├── JSON.parse는 정상 처리
├── 요약 생성 시 content 앞부분만 사용
└── 전체 content를 클라이언트에 전송하지 않음 (요약만)
```
