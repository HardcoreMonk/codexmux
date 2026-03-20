# v9 요구사항 정리

## 출처

- `.specs/v9/requirements/overview.md` — 프로젝트 개요 및 로드맵
- `.specs/v9/requirements/phase9-session-explorer.md` — Phase 9 세션 탐색 PRD

## 페이지 목록 (도출)

v9는 새로운 페이지가 아닌, 기존 Claude Code Panel 내부의 뷰 전환 기능을 추가한다.

| 페이지/뷰 | 설명 | 우선순위 |
|---|---|---|
| 세션 목록 뷰 | 과거 세션을 시간순으로 탐색하는 목록 UI (타임라인 영역에 렌더링) | P0 |
| 타임라인 뷰 (기존) | 활성/선택 세션의 대화 흐름 표시 — 세션 목록 복귀 네비게이션 추가 | P0 |

---

## 주요 요구사항

### 세션 목록 조회 (서버)

- `~/.claude/projects/` 하위에서 현재 Workspace 프로젝트 디렉토리에 해당하는 `.jsonl` 파일들을 탐색
- 각 세션 파일에서 메타정보를 **경량 파싱**하여 목록 구성
  - 전체 JSONL을 로드하지 않음 — 파일의 첫 몇 줄 + stat 정보만 읽어 메타 추출
- 최신순(마지막 활동 시간 기준)으로 정렬하여 반환
- **API 엔드포인트**: REST (`GET /api/timeline/sessions?workspace={id}`) 방식으로 제공
  - 기존 `GET /api/timeline/session`(단수)은 현재 활성 세션 조회 — 별도 유지
- 기존 `session-detection.ts`의 `detectSession()`은 단일 활성 세션만 반환하므로, 프로젝트 디렉토리의 **전체 .jsonl 파일**을 스캔하는 새 함수 필요

### 세션 메타정보 (서버)

각 세션에 대해 다음 메타정보를 추출한다:

| 필드 | 추출 방식 |
|---|---|
| 세션 ID | 파일명에서 추출 |
| 세션 시작 시간 | JSONL 첫 번째 엔트리의 타임스탬프 또는 파일 생성 시간 |
| 마지막 활동 시간 | 파일 수정 시간 (fs.stat mtime) |
| 첫 사용자 메시지 | JSONL에서 첫 `human` 타입 메시지의 텍스트 (요약 역할) |
| 대화 턴 수 | JSONL에서 `human` 타입 엔트리 수 카운트 |

- 메타정보 추출은 JSONL 전체를 파싱하지 않고, **스트리밍 방식으로 필요한 부분만** 읽어야 한다
- 기존 `session-parser.ts`의 `parseJsonlIncremental()`을 참고하되, 메타 전용 경량 버전 구현

### 세션 목록 UI (클라이언트)

- Claude Code Panel의 타임라인 영역에 세션 목록을 렌더링
- 각 세션 항목에 표시할 정보:
  - 날짜/시간 (상대 시간 — "2시간 전", "어제" 등 + 절대 시간 툴팁)
  - 첫 사용자 메시지 (한 줄로 truncate)
  - 대화 턴 수
- 세션 항목 클릭 → 해당 세션으로 resume
- 세션이 많을 경우 스크롤 가능 (가상화 필요 시 적용)
- 빈 상태: 과거 세션이 없을 때 안내 메시지 표시

### 세션 목록 ↔ 타임라인 전환

Claude Code Panel 상단 영역의 두 가지 뷰를 상태에 따라 전환한다:

| 상태 | 표시 뷰 |
|---|---|
| 활성 세션 없음 + 과거 세션 있음 | 세션 목록 뷰 |
| 활성 세션 없음 + 과거 세션 없음 | 빈 상태 (안내 메시지) |
| 세션 선택 또는 `claude` 실행 | 타임라인 뷰 |
| 활성 세션 종료 | 세션 목록 뷰로 복귀 |

- 타임라인 뷰 상단에 **세션 목록 복귀 버튼** (`← 세션 목록`) 제공
- 기존 `useTimeline` 훅의 session status (`active`, `inactive`, `none`)를 활용하여 자동 전환
- `inactive` 상태에서도 타임라인은 읽기 전용으로 유지할 수 있음 — 세션 목록 복귀는 수동

### `--resume` 자동 연결

세션 항목 클릭 시 해당 세션으로 resume 연결한다:

1. 클라이언트 → 서버: resume 요청 (session_id, tmux 세션명)
2. 서버: `tmux send-keys`로 하단 터미널에 `claude --resume {session_id}` 전송
3. 서버: 해당 세션 파일에 대해 `fs.watch` 시작
4. 클라이언트: 타임라인 뷰로 전환 → 해당 세션의 타임라인 표시

- 터미널에 기존 프로세스가 실행 중이면 resume 전송 전 경고 표시
- resume 실패 시 (세션 파일 손상, Claude Code 미설치 등) 에러 메시지 표시
- WebSocket 기존 인프라(`timeline-server.ts`)를 활용하여 resume 메시지 타입 추가

### Surface별 세션 ID 영속화

Claude Code Panel이 연결된 세션 ID를 Surface 단위로 layout.json에 저장한다.

- Surface 데이터에 `claudeSessionId` 필드 추가
- 세션 연결 시점(자동 감지 또는 수동 resume)에 해당 Surface의 `claudeSessionId`를 layout.json에 저장
- 세션 종료 시에도 `claudeSessionId`를 클리어하지 않음 (마지막 연결 세션 ID를 유지)
- 이를 통해 서버 재시작 시 자동 resume, 세션 목록에서 "마지막 세션" 하이라이트 등에 활용

### 서버 재시작 시 자동 resume

서버 재시작 후, Claude Code Panel 상태였던 Surface가 이전 세션을 자동으로 resume한다.

- 서버 시작 → layout.json 로드 → `panelType: 'claude-code'` + `claudeSessionId`가 있는 Surface 식별
- 해당 Surface의 tmux 세션 재연결 후, Claude Code 프로세스 실행 여부 확인:
  - **실행 중**: 타임라인만 복원 (기존 Phase 8 동작과 동일)
  - **미실행**: `claude --resume {claudeSessionId}`를 tmux send-keys로 자동 전송
- 자동 resume는 tmux 세션 재연결 후 **셸 프롬프트가 준비된 시점**에 실행
  - 셸 준비 감지: tmux 출력 또는 짧은 대기 후 전송
- 자동 resume 실패 시 (세션 파일 없음, CLI 에러 등) → 세션 목록 뷰로 fallback

```
서버 재시작 흐름
├── layout.json 로드
├── Surface별 panelType + claudeSessionId 확인
├── tmux 세션 재연결
├── Claude Code 프로세스 실행 여부 확인
│   ├── 실행 중 → 타임라인 복원 (Phase 8)
│   └── 미실행 → claude --resume {sessionId} 자동 전송
│       ├── 성공 → 타임라인 뷰 표시
│       └── 실패 → 세션 목록 뷰 fallback
└── fs.watch 시작 → 실시간 타임라인 업데이트
```

---

## 제약 조건 / 참고 사항

### 기술적 제약

- **세션 파일은 Claude Code CLI가 소유**: 읽기 전용으로만 접근. 수정/삭제하지 않음
- **JSONL 파일 크기**: 장시간 세션은 수십 MB가 될 수 있음 → 메타정보 추출 시 전체 파일을 메모리에 올리면 안 됨
- **파일 시스템 경로 매핑**: `~/.claude/projects/` 하위 디렉토리 구조가 Claude Code 버전에 따라 달라질 수 있음 → 기존 `session-detection.ts`의 매핑 로직을 재활용
- **tmux send-keys**: 터미널에 명령어를 전송하는 방식이므로, 이미 다른 명령어가 실행 중이면 의도치 않은 동작 가능
- **자동 resume 타이밍**: 서버 재시작 후 tmux 세션이 재연결되고 셸이 준비된 시점에 send-keys를 보내야 함. 셸 준비 전에 전송하면 명령어가 유실됨

### UX 고려사항

- **세션 목록 로딩**: 첫 진입 시 세션 목록이 즉시 표시되어야 함. 로딩 중 skeleton UI 적용
- **시간 표시**: dayjs의 상대 시간(`fromNow`)을 사용하되, 호버 시 절대 시간 툴팁
- **세션 요약**: 첫 사용자 메시지가 길 경우 1~2줄로 truncate. 호버 시 전체 표시
- **터미널 상태 확인**: resume 시 하단 터미널에 프로세스가 실행 중인지 확인 필요

### 성능

- 세션 파일이 100개 이상인 프로젝트에서도 목록 로딩이 500ms 이내여야 함
- 메타정보 파싱은 병렬로 처리 (Promise.all)
- 필요시 초기 N개만 로드하고 스크롤 시 추가 로드 (lazy loading)

---

## 미확인 사항

- [ ] `~/.claude/projects/` 하위 디렉토리 구조의 정확한 경로 규칙 — 프로젝트 경로가 어떻게 인코딩되는지 (슬래시 → 하이픈 등) 확인 필요. 기존 `session-detection.ts`에 이미 구현된 매핑 로직이 있으므로 이를 검증
- [ ] 세션 파일(JSONL) 내 첫 `human` 메시지까지 도달하기 위해 읽어야 하는 바이트 수 — 경량 파싱의 실질적 비용 측정 필요
- [ ] `inactive` 세션(Claude Code가 종료되었지만 타임라인은 남아있는 상태)에서 세션 목록으로 자동 복귀할지, 타임라인을 유지할지 — UX 판단 필요
- [ ] 세션 목록에 현재 활성 세션도 표시할지, 활성 세션은 제외하고 과거 세션만 표시할지
- [ ] resume 시 터미널에 이미 프로세스가 실행 중인 경우의 처리 방식 — 경고 후 중단 vs 새 탭 생성 vs 프로세스 종료 후 전송
- [ ] 세션 목록의 페이지네이션 전략 — 전체 로드 vs 초기 N개 + 스크롤 로드. 프로젝트당 평균 세션 수에 따라 결정
- [ ] 세션 목록에서 세션 미리보기(마지막 몇 개 메시지 프리뷰) 기능 — 세션을 선택하기 전에 내용을 빠르게 확인할 수 있으면 탐색 효율이 크게 향상됨
- [ ] 자동 resume 시 셸 준비 감지 방식 — tmux 출력 패턴 매칭 vs 고정 딜레이 vs tmux wait-for 활용. 안정성과 속도의 트레이드오프
