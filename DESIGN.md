# codexmux 설계 문서

codexmux는 Codex CLI 전용 웹 세션 매니저다. 범용 터미널 대시보드가 아니라 여러 Codex 세션을 브라우저에서 실행, 재개, 모니터링, 검토하기 위한 도구다. 터미널 접근은 tmux 위에 남겨 두고, Codex 작업은 상태 badge와 timeline 중심으로 보여준다.

## 구현 상태

- 서비스 이름과 실행 파일은 `codexmux`, 짧은 별칭은 `cmux`다.
- 데이터 디렉터리는 `~/.codexmux`, tmux socket은 `codexmux`, CLI header는 `x-cmux-token`이다.
- provider registry에는 `codex` panel type만 등록한다.
- Codex 실행은 `codex`, 재개는 `codex resume <sessionId>`를 사용한다.
- process detection은 tmux pane 아래의 `codex` process를 찾고 cwd와 JSONL path를 연결한다.
- timeline, history, stats, daily report는 `~/.codex/sessions/**/*.jsonl`을 읽어 구성한다.
- `~/.codex`는 Codex CLI 소유 데이터이며 codexmux는 읽기 전용으로만 접근한다.

## 주요 구성

| 영역 | 파일 | 역할 |
|---|---|---|
| provider | `src/lib/providers/codex/` | Codex adapter와 provider contract 구현 |
| command | `src/lib/codex-command.ts` | Codex launch/resume command 생성 |
| detection | `src/lib/codex-session-detection.ts` | process tree와 JSONL session 연결 |
| parser | `src/lib/codex-session-parser.ts` | Codex JSONL을 timeline entry로 변환 |
| stats | `src/lib/stats/` | token, cost, session, daily report 집계 |
| status | `src/lib/status-manager.ts` | tab state, polling, Web Push, WebSocket broadcast |

## 데이터 모델

새 layout과 status payload는 다음 neutral field를 사용한다.

- `panelType: "codex"`
- `agentSessionId`
- `agentJsonlPath`
- `agentSummary`

오래된 provider alias는 runtime에서 허용하지 않는다. 새 기능도 provider-neutral boundary 또는 Codex provider 내부에 추가한다.

## 리스크

- Codex JSONL 형식은 CLI 버전에 따라 바뀔 수 있다. parser는 permissive하게 두고 fixture를 계속 보강한다.
- `~/.codex`에는 auth와 local history가 들어갈 수 있으므로 원본 config/auth 파일을 브라우저에 노출하지 않는다.
- process detection은 플랫폼 의존성이 크다. Linux `/proc`, `pgrep`, `ps` fallback은 helper에 격리한다.
- Codex app-server protocol은 안정화 전까지 post-MVP 후보로 둔다.

## post-MVP 방향

- app-server adapter가 안정화되면 approval/status event만 단계적으로 도입한다.
- 전체 세션의 pending approval을 모아 보는 approval queue를 만든다.
- fork/sub-agent 관계를 UI에 표시한다.
- Codex CLI 버전별 JSONL fixture와 smoke test를 확장한다.
