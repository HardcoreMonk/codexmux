# v8 요구사항 정리

## 출처

- `.specs/v8/requirements/overview.md` — 프로젝트 개요, 기술 스택, 완료 사항, 로드맵
- `.specs/v8/requirements/phase8-claude-code-panel.md` — Phase 8 Claude Code Panel 상세 요구사항
- [d-kimuson/claude-code-viewer](https://github.com/d-kimuson/claude-code-viewer) — JSONL 파싱 참고 프로젝트

## 페이지 목록 (도출)

v8은 새로운 페이지 추가가 아닌, 기존 터미널 탭에 Claude Code 타임라인 뷰를 결합하는 작업이다.

| 페이지/모듈 | 설명 | 우선순위 |
|---|---|---|
| Panel 타입 시스템 | ITab에 `panelType` 필드 추가, 타입별 컴포넌트 분기 렌더링 | P0 |
| Claude Code Panel 컴포넌트 | 상단 타임라인 + 하단 터미널(축소) 분할 레이아웃 | P0 |
| 세션 파일 파싱 엔진 | JSONL 파싱 → 타임라인 항목 추출 (메시지, 도구 호출, 응답) | P0 |
| 활성 세션 감지 및 매핑 | `~/.claude/sessions/` PID 파일 기반 활성 세션 탐색 + JSONL 매핑 | P0 |
| 실시간 세션 감시 | `fs.watch` + 전용 WebSocket으로 타임라인 실시간 업데이트 | P0 |
| `claude` 명령어 감지 | tmux 세션 내 `claude` 프로세스 실행 감지 → Panel 타입 자동 전환 | P1 |
| Panel 타입 수동 전환 UI | 탭 바 또는 Panel 내 토글로 Terminal ↔ Claude Code 전환 | P1 |

## 주요 요구사항

### Panel 타입 시스템

- 현재 ITab 인터페이스에 `panelType` 필드 추가: `'terminal'` (기본값) | `'claude-code'`
- PaneContainer에서 `panelType`에 따라 TerminalContainer 또는 ClaudeCodePanel을 렌더링
- 기본값 `'terminal'`로 기존 동작과 완전 호환 (마이그레이션 불필요)
- `panelType` 변경 시 layout.json에 즉시 영속화 (기존 debounce 저장 로직 활용)
- Panel 타입 전환 시 tmux 세션은 불변 — 동일 sessionName 유지

### Claude Code Panel 컴포넌트

- **상단**: 타임라인 영역 (대부분의 공간 차지, 스크롤 가능)
- **하단**: xterm.js 터미널을 축소 표시 (scale 50%, 터미널 크기 80 컬럼 기준)
  - 하단 터미널은 기존 TerminalContainer와 동일한 tmux 기반 터미널
  - 축소된 터미널에서도 입출력은 정상 동작
- 상하 영역 간 리사이즈 가능 (드래그 핸들)
- 타임라인 영역의 렌더링 항목:
  - **사용자 메시지** — `type: "user"` 중 `tool_result`가 아닌 실제 사용자 입력
  - **어시스턴트 응답** — `type: "assistant"`, `content[].type === "text"` → **마크다운으로 렌더링** (코드 블록, 리스트 등)
  - **도구 호출** — `type: "assistant"`, `content[].type === "tool_use"` (도구 이름 + 요약 표시)
  - **도구 결과** — `type: "user"`, `content[].type === "tool_result"` → **요약만 표시** (성공/실패 상태)
- 각 항목에 타임스탬프 표시 (dayjs 포맷)
- 파일 변경 도구 호출(Edit, Write 등)은 diff 뷰로 펼쳐볼 수 있음 (접기/펼치기, 상태는 영속화하지 않음)
- 새 항목 추가 시 자동 스크롤 (하단 고정, 사용자가 위로 스크롤한 상태면 고정 해제 + "최신으로 이동" 버튼)
- `progress`, `system`, `file-history-snapshot`, `queue-operation` 등 메타 항목은 타임라인에 표시하지 않음
- **서브에이전트**: 메인 세션 타임라인에 접힌 그룹으로 힌트만 표시 (펼쳐서 상세 보기는 Phase 9+)

### 세션 파일 파싱 엔진 (claude-code-viewer 참고)

[d-kimuson/claude-code-viewer](https://github.com/d-kimuson/claude-code-viewer) 프로젝트의 파싱 로직을 참고한다.

- Claude Code 세션 파일 형식: **JSONL** (한 줄에 하나의 JSON 객체)
- 파싱 방식: 줄 단위로 분리 → 빈 줄 필터링 → 개별 JSON.parse → Zod 등으로 유효성 검증
- 유효하지 않은 줄은 무시 (에러 엔트리로 처리, 전체 파싱 실패하지 않음)
- 파싱 대상 엔트리 타입: `assistant`, `user`
- 제외 대상: `progress`, `system`, `file-history-snapshot`, `queue-operation`, `summary`, `custom-title`, `agent-name`
- 엔트리 구조:
  - **공통 필드**: `uuid`, `parentUuid`, `timestamp`, `sessionId`, `cwd`, `isSidechain`, `type`
  - **assistant 엔트리**: `message.content[]` 배열에 `text`, `tool_use`, `thinking` 블록 포함
  - **user 엔트리**: `message.content[]` 배열에 `text`, `tool_result`, `image`, `document` 블록 포함
  - **tool_use 블록**: `{ type: "tool_use", id, name, input }` — name은 Read, Edit, Bash 등
  - **tool_result 블록**: `{ type: "tool_result", tool_use_id, content, is_error? }`
- 서브에이전트 엔트리는 `isSidechain: true`로 구분, 메인 타임라인에서는 그룹 힌트만 표시
- 대용량 세션 파일 (1MB+) 처리: 증분 읽기 적용 (마지막 읽은 byte offset 기록, 새 줄만 파싱)

### 활성 세션 감지 및 매핑

현재 실행 중인 Claude Code의 세션 파일을 정확히 찾는다.

- **PID 파일 기반 감지**: `~/.claude/sessions/{PID}.json` 파일 스캔
  - 파일 형식: `{ pid, sessionId, cwd, startedAt }`
  - `cwd`가 현재 Workspace의 `directories[0]`과 일치하는 세션 탐색
  - `ps -p {PID}`로 프로세스가 실제 실행 중인지 검증
- **JSONL 파일 매핑**: 활성 세션의 `sessionId`로 JSONL 파일 경로 도출
  - 경로: `~/.claude/projects/{프로젝트 디렉토리 이름}/{sessionId}.jsonl`
  - 프로젝트 디렉토리 이름 변환 규칙: 경로의 `/` → `-` 치환
  - 예: `/Users/subicura/Workspace/github.com/subicura/pt` → `-Users-subicura-Workspace-github-com-subicura-pt`
- **활성 세션이 없는 경우**: 가장 최근 수정된 JSONL 파일을 표시 (Phase 9 세션 탐색의 기반)
- **새 세션 시작 감지**: `~/.claude/sessions/` 디렉토리를 `fs.watch`로 감시하여 새 PID 파일 생성 시 자동 매핑

### 실시간 세션 감시

- **전용 WebSocket 엔드포인트**: `/api/timeline` — 기존 터미널 WebSocket(`/api/terminal`)과 분리
- 서버: `fs.watch`로 대상 JSONL 파일 변경 감지
- 변경 감지 시 마지막 읽은 byte offset부터 새 줄만 읽어 증분 파싱 (전체 재파싱 방지)
- 파싱된 새 항목을 타임라인 WebSocket으로 클라이언트에 전송
- 클라이언트: 수신 즉시 타임라인 React state에 append → UI 업데이트
- debounce 적용 (50~100ms)하여 빈번한 파일 변경 시 과도한 전송 방지
- 감시 대상 파일이 교체되면 (새 세션 시작) watcher 재설정

### `claude` 명령어 감지

- tmux 세션 내에서 `claude` 프로세스 실행을 감지하여 `panelType`을 자동 전환
- 감지 방식: `tmux -L purple display-message -t {sessionName} -p '#{pane_current_command}'`로 포그라운드 프로세스 확인
- `claude` 감지 시: `panelType`을 `claude-code`로 전환 + 활성 세션 매핑 시작
- **`claude` 프로세스 종료 시: `claude-code` 타입 유지** (타임라인을 다시 보고 싶을 수 있음)
- 폴링 주기: 1~2초 (성능과 반응성 균형)
- 이미 `claude-code` 타입인 탭에서는 중복 전환하지 않음

### Panel 타입 수동 전환 UI

- 탭 바 영역 또는 Panel 상단에 전환 토글 버튼 제공
- Terminal 모드: 전체 영역이 터미널 (기존과 동일)
- Claude Code 모드: 상단 타임라인 + 하단 터미널 (축소)
- 전환 시 tmux 세션 유지 (WebSocket 연결 불변)
- 전환 상태는 layout.json에 영속화

## 제약 조건 / 참고 사항

- **기존 아키텍처 호환**: PaneContainer의 portal 기반 렌더링 구조를 유지해야 함. ClaudeCodePanel도 동일한 stableContainersRef 메커니즘으로 관리
- **터미널 축소 표시**: 하단 터미널은 CSS `transform: scale(0.5)` 등으로 축소 표시. 80 컬럼 기준으로 터미널 크기를 설정하고 시각적으로 축소. xterm.js의 실제 cols/rows는 축소 전 값 유지, 축소 비율에 맞게 컨테이너 크기 역산 필요
- **WebSocket 분리**: 타임라인 전용 WebSocket 엔드포인트(`/api/timeline`)를 신설. 기존 터미널 통신(`/api/terminal`, 바이너리 프로토콜 0x00~0x04)에 영향 없음. 타임라인 WebSocket은 JSON 메시지 사용
- **세션 파일 크기**: 실측 기준 2KB~1.4MB 범위. 대용량 파일의 초기 로드 시 전체 파싱이 느릴 수 있으므로, 초기 로드는 tail 방식(마지막 N줄)으로 시작하고 스크롤 시 추가 로드하는 가상화 고려
- **타임라인 렌더링 성능**: 한 세션에 200+ 엔트리가 존재할 수 있음. React 가상 스크롤 (예: `@tanstack/react-virtual`) 적용하여 대량 항목 렌더링 최적화
- **마크다운 렌더링**: Claude 응답 텍스트를 마크다운으로 렌더링. `react-markdown` 또는 프로젝트에서 이미 사용 중인 마크다운 라이브러리 활용. 코드 블록 구문 강조 포함
- **도구 호출 결과 요약**: Bash stdout/stderr 등 긴 출력은 요약만 표시 (첫 몇 줄 또는 "N줄 출력" 형태). diff 뷰는 접기/펼치기 토글로 제공하되, 접기/펼치기 상태는 영속화하지 않음
- **서브에이전트 표시**: 메인 세션 타임라인에서 서브에이전트 호출은 접힌 그룹으로 힌트만 표시 (예: "Agent: Explore — 코드베이스 탐색"). 상세 내용은 Phase 9+에서 확장
- **자동 스크롤 UX**: 사용자가 타임라인을 위로 스크롤하여 과거 내용을 보는 중에는 자동 스크롤을 중단하고, 하단에 "최신으로 이동" 버튼을 표시 (채팅 앱 패턴)
- **활성 세션 감지 신뢰성**: PID 파일 기반 감지는 프로세스 종료 후 PID 파일이 잔존할 수 있으므로, 반드시 `ps -p {PID}` 검증을 병행. 좀비 PID 파일은 무시

## 확인 완료 사항

- [x] Claude Code 세션 파일 형식 → **JSONL** (한 줄 = 하나의 JSON 객체)
- [x] 세션 파일 경로 매핑 규칙 → 디렉토리 경로의 `/` → `-` 치환 (예: `-Users-subicura-Workspace-github-com-subicura-pt`)
- [x] 세션 파일 엔트리 타입 → `assistant`, `user`, `progress`, `system`, `file-history-snapshot`, `queue-operation`, `summary`, `custom-title`, `agent-name`
- [x] 도구 호출 구조 → assistant 엔트리의 `message.content[].type === "tool_use"`, 결과는 다음 user 엔트리의 `tool_result`
- [x] 현재 ITab 인터페이스 → `{ id, sessionName, name, order, title? }` — `panelType` 필드 추가 필요
- [x] 기존 WebSocket 프로토콜 → 바이너리, 메시지 타입 0x00~0x04 사용 중
- [x] 레이아웃 영속성 → layout.json에 즉시 저장 (debounce), 서버 시작 시 복원
- [x] 활성 세션 감지 방법 → `~/.claude/sessions/{PID}.json`의 `cwd` + `ps -p {PID}` 검증
- [x] JSONL 파싱 참고 → claude-code-viewer 프로젝트의 Zod 기반 스키마 + graceful error handling
- [x] 서브에이전트 타임라인 표시 → 접힌 그룹으로 힌트만 표시
- [x] `claude` 종료 시 Panel 타입 → `claude-code` 유지 (자동 복귀하지 않음)
- [x] 복수 세션 파일 처리 → 현재 실행 중인 claude의 세션을 PID 파일 기반으로 특정
- [x] 타임라인-터미널 영역 비율 → 하단 터미널 축소 표시 (scale 50%, 80 컬럼 기준)
- [x] 접기/펼치기 상태 영속화 → 하지 않음 (세션 내에서만 유지)
- [x] WebSocket 채널 전략 → 분리 (`/api/timeline` 별도 엔드포인트)
- [x] 마크다운 렌더링 → 마크다운으로 렌더링
- [x] 도구 호출 결과 표시 → 요약만 표시
