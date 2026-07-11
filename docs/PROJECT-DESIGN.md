# 프로젝트 설계 요약

codexmux는 Codex CLI 전용 웹 세션 매니저입니다. 범용 터미널 대시보드가 아니라
여러 Codex 세션을 브라우저에서 실행, 재개, 모니터링, 검토하기 위한 도구입니다.
터미널 접근은 runtime adapter 경계 뒤에 두고, Codex 작업은 status badge와
timeline 중심으로 보여줍니다.

## 구현 상태

- 서비스 이름과 실행 파일은 `codexmux`, 짧은 별칭은 `cmux`입니다.
- 데이터 디렉터리는 `~/.codexmux`, tmux socket은 `codexmux`, CLI header는 `x-cmux-token`입니다.
- provider registry에는 `codex` panel type만 등록합니다.
- Codex 실행은 `codex`, 재개는 `codex resume <sessionId>`를 사용하며 hook event는 inline TOML override로 `status-hook.sh`에 연결합니다.
- process detection은 tmux pane 아래의 `codex` process를 찾고 session id, process start time, live process cwd fallback 순서로 JSONL path를 연결합니다.
- timeline, history, stats, daily report는 `~/.codex/sessions/**/*.jsonl`을 읽어 구성합니다.
- session list는 `~/.codexmux/session-index.json` snapshot을 먼저 읽고, cold refresh 중이면 현재 snapshot을 표시한 뒤 재조회합니다.
- `~/.codex`는 Codex CLI 소유 데이터이며 codexmux는 읽기 전용으로만 접근합니다.
- terminal과 Codex 입력 포커스의 `Ctrl+D`는 앱 단축키가 아니라 EOF/EOT로 전달합니다. Codex 입력 바 제출은 bracketed paste + Enter frame과 후속 Enter로 처리합니다.
- 모바일 foreground 복귀 시 terminal/status/timeline/sync WebSocket은 stale `OPEN` 상태를 신뢰하지 않고 재연결할 수 있습니다.
- 성능 최적화는 `/api/debug/perf` snapshot으로 계측한 뒤 좁게 적용합니다. timeline append/render, diff, stats는 기준 데이터를 바꾸지 않는 batch/memo/short cache를 우선합니다.
- 최초 setup process는 저장된 network access나 `HOST`보다 먼저 loopback에만 bind합니다. Setup claim이 끝나도 listener 확대는 restart 뒤 적용합니다.
- `config.json`의 malformed JSON, I/O 오류, hash-only 인증 상태는 setup으로 downgrade하지 않고 startup/request를 fail closed합니다.
- setup POST는 startup claim latch, loopback Host, same-authority Origin, JSON media type을 요구합니다. `/api/install`은 generic WebSocket 예외가 아니라 setup-local lease 또는 session admission을 사용합니다.
- `/api/upload-image`와 `/api/upload-file`은 Next proxy/Pages route가 아니라 outer custom server가 소유합니다. Image/file limit은 10MiB/50MiB이고, successful publish는 same-directory hard link의 no-replace commit입니다.
- Production dependency baseline은 Next `16.2.6`, next-intl `4.9.2`, ws `8.21.0`, js-yaml `4.2.0`과 제한된 PostCSS/Babel override이며 `pnpm audit --prod` 0건을 유지합니다.

## 주요 구성

| 영역 | 파일 | 역할 |
| --- | --- | --- |
| provider | `src/lib/providers/codex/` | Codex adapter와 provider contract 구현 |
| command | `src/lib/codex-command.ts` | Codex launch/resume command 생성 |
| detection | `src/lib/codex-session-detection.ts` | process tree와 JSONL session 연결 |
| parser | `src/lib/codex-session-parser.ts` | Codex JSONL을 timeline entry로 변환 |
| stats | `src/lib/stats/` | token, cost, session, daily report 집계 |
| status | `src/lib/status-manager.ts` | tab state, polling, Web Push, WebSocket broadcast |
| bootstrap security | `src/lib/server-bootstrap.ts`, `src/lib/request-authority.ts` | strict auth state, startup exposure, Host/Origin admission |
| install admission | `src/lib/install-request-auth.ts`, `src/lib/install-server.ts` | typed install auth, atomic PTY slot, setup lease, bounded I/O |
| upload contract/auth | `src/lib/upload-request-contract.ts`, `src/lib/upload-request-auth.ts` | raw target/header, session/CLI, Host/Origin/framing 계약 |
| upload admission/server | `src/lib/upload-admission.ts`, `src/lib/upload-server.ts` | active/reserved budget, timeout, Expect, shutdown ownership |
| upload storage | `src/lib/uploads-store.ts` | staged streaming, no-replace publish, committed/staged cleanup |
| outer HTTP composition | `src/lib/server-http-dispatcher.ts`, `server.ts` | dev/prod upload 선점, Next fallback, signal drain |
| performance | `src/lib/perf-metrics.ts` | runtime metric, duration/counter, 인증된 성능 스냅샷 |
| docs | `docs/ARCHITECTURE-LOGIC.md` | 서버와 서비스 로직의 최신 구현 기준 |

## 데이터 모델

새 layout과 status payload는 다음 neutral field를 사용합니다.

- `panelType: "codex"`
- `agentSessionId`
- `agentJsonlPath`
- `agentSummary`

Workspace 이름과 group은 `workspaces.json`이 기준 데이터이며, rename/group
변경은 sync event로 모든 client에 전파합니다.

오래된 provider alias는 runtime에서 허용하지 않습니다. 새 기능도
provider-neutral boundary 또는 Codex provider 내부에 추가합니다.

## 리스크

- Codex JSONL 형식은 CLI 버전에 따라 바뀔 수 있습니다. parser는 permissive하게 두고 fixture를 계속 보강합니다.
- Codex CLI가 process 시작 후 JSONL을 늦게 쓰는 경우가 있어 process start time 매칭은 여유를 두고, cwd fallback은 live Codex process가 확인된 경우에만 씁니다.
- `~/.codex`에는 auth와 local history가 들어갈 수 있으므로 원본 config/auth 파일을 브라우저에 노출하지 않습니다.
- process detection은 플랫폼 의존성이 큽니다. Linux `/proc`, `pgrep`, `ps` fallback은 helper에 격리합니다.
- foreground reconnect 중 timeline init/append가 겹칠 수 있으므로 stable id와 near-duplicate 제거가 UI 중복 방지의 핵심입니다.
- timeline virtualization과 adaptive status polling은 scroll anchoring, notification, unknown 복구 지연 리스크가 있어 성능 스냅샷 수치가 쌓인 뒤 단계적으로 검증합니다.
- Codex app-server protocol은 안정화 전까지 post-MVP 후보로 둡니다.
- setup-local install은 사용자 권한의 arbitrary PTY stdin을 허용하는 legacy adapter입니다. Elevated/multi-user service와 Windows host-owned install action은 별도 capability/host boundary가 필요합니다.
- Upload directory validation은 user-scoped data directory와 동일 UID local process를 신뢰합니다. Windows hard-link/delete와 packaged kill-switch는 fresh Windows runner evidence 전까지 ADR verification 조건으로 남습니다.

## MVP 이후 방향

- app-server adapter가 안정화되면 approval/status event만 단계적으로 도입합니다.
- 전체 세션의 pending approval을 모아 보는 approval queue를 만듭니다.
- fork/sub-agent 관계를 UI에 표시합니다.
- Codex CLI 버전별 JSONL fixture와 smoke test를 확장합니다.
