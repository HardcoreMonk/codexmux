---
step: build
timestamp: 2026-04-04 12:01
elapsed: 8분 12초
status: completed
---
구현 완료. 생성/수정된 파일 요약:

### 새로 생성된 파일 (9개)

| 파일 | 설명 |
|------|------|
| `src/types/agent.ts` | 에이전트 관련 타입 정의 (상태, 메시지, API req/res, WebSocket 메시지) |
| `src/lib/agent-chat.ts` | JSONL 기반 채팅 메시지 읽기/쓰기, 세션 관리, 디렉토리 유틸리티 |
| `src/lib/agent-manager.ts` | 에이전트 라이프사이클 싱글턴 — CRUD, tmux 세션 관리, 상태 폴링, 메시지 큐잉, 자동 재시작 |
| `src/lib/agent-status-server.ts` | `/api/agent-status` WebSocket 핸들러 — 연결 시 sync, 상태 변경 broadcast |
| `src/pages/api/agent/index.ts` | `GET` 목록 / `POST` 생성 |
| `src/pages/api/agent/[agentId]/index.ts` | `GET` 상세 / `PATCH` 수정 / `DELETE` 삭제 |
| `src/pages/api/agent/[agentId]/send.ts` | `POST` 사용자 → 에이전트 메시지 전송 |
| `src/pages/api/agent/[agentId]/chat.ts` | `GET` 채팅 이력 조회 |
| `src/pages/api/agent/message.ts` | `POST` 에이전트 → 사용자 메시지 수신 (curl 엔드포인트) |

### 수정된 파일 (1개)

| 파일 | 변경 내용 |
|------|------|
| `server.ts` | import 추가, WS_PATHS에 `/api/agent-status` 등록, WebSocket 서버 생성/라우팅/셧다운, `getAgentManager().init()` 호출 |

### 주요 구현 포인트

- **기존 인프라 재사용**: `tmux.ts`의 `createSession`/`killSession`/`sendKeys`/`hasSession`, `session-detection.ts`의 `detectActiveSession` 호출
- **상태 산출**: 5초 간격 폴링으로 tmux 세션 + Claude JSONL 기반 idle/working/blocked/offline 판별
- **메시지 큐잉**: busy 상태에서 수신한 메시지를 인메모리 배열(최대 10개)에 저장, idle 전환 시 순차 전달
- **자동 재시작**: 세션 죽음 감지 시 최대 3회 재시작 시도
- **서버 시작 시 복구**: `scanExistingAgents()`로 `~/.purplemux/agents/` 스캔 → config.md가 있는 에이전트 재등록
- **영속화**: `~/.purplemux/agents/{id}/config.md` (YAML frontmatter) + `chat/index.json` + `{sessionId}.jsonl` (append-only)

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
