# 아키텍처 결정 기록

이 문서는 codexmux의 오래가는 설계 결정을 모읍니다. 세부 실행 흐름은 `ARCHITECTURE-LOGIC.md`, 상태 감지는 `STATUS.md`, terminal/runtime 경계는 `TMUX.md`와 Windows 전환 문서에 둡니다.

## 작성 기준

다음 변경은 ADR을 함께 갱신합니다.

- framework, router, custom server boundary 변경
- terminal runtime, process inspector, Codex session detection 변경
- provider model 또는 `agent*` metadata 의미 변경
- `~/.codexmux/` 저장 구조, auth, security 동작 변경
- Electron/Android 같은 platform shell 동작 변경
- 알림, locale, 모바일 UX, 터미널 입력, 재연결, 중복 제거 같은 cross-surface 정책 변경
- Windows-only 제품 타깃, packaging, installer, updater, host operation 변경

작은 copy, 단일 컴포넌트 styling, 기존 결정과 충돌하지 않는 버그 수정은 새 ADR이 필요하지 않습니다.

## ADR-001: Next.js Pages Router와 custom server 유지

- 상태: 승인
- 결정: App Router를 도입하지 않고 Pages Router와 `server.ts` custom Node server를 유지합니다.
- 이유: terminal WebSocket, runtime worker, CLI bridge, status manager가 한 process 안에서 낮은 지연으로 협력해야 합니다.
- 영향: `"use client"`를 추가하지 않습니다. 인증 middleware 경로는 현재 Next.js 버전에 맞춰 `src/proxy.ts`를 사용합니다.

## ADR-002: 터미널 런타임은 adapter 경계 뒤에 둔다

- 상태: 승인
- 결정: 기존 tmux 경로는 legacy infrastructure adapter로 취급하고, runtime v2는 `ITerminalRuntimeAdapter` 경계 뒤에서 terminal create, attach, write, resize, detach, kill을 처리합니다.
- 이유: Windows-only 제품 전환에서 tmux 자체를 domain API로 보면 ConPTY/node-pty runtime, process inspection, packaged smoke를 안전하게 도입할 수 없습니다.
- 영향: `src/lib/tmux.ts`를 새 코드의 domain API처럼 직접 확장하지 않습니다. Windows adapter와 tmux adapter는 같은 worker service 계약을 만족해야 합니다.

## ADR-003: Codex provider 중심 모델

- 상태: 승인
- 결정: 현재 provider는 Codex이며, client/store field는 migration 범위를 줄이기 위해 `agent*` 이름을 유지합니다.
- 이유: UI와 저장 데이터가 provider-neutral 모양을 갖고 있어야 이후 변경 비용을 줄일 수 있습니다.
- 영향: `TCliState`, `ITabState`, `StatusManager`, provider detection, `agentSessionId`, `agentSummary`를 바꾸면 `STATUS.md`도 갱신합니다. 새 provider는 registry contract를 통과해야 하며 provider id와 panel type은 중복될 수 없습니다. JSONL watch 유지와 stop hook 지연 같은 provider별 status 동작은 `statusBehavior` contract로 명시합니다.

## ADR-004: 공유 상태는 `globalThis` singleton에 둔다

- 상태: 승인
- 결정: custom server와 Next.js API route가 공유해야 하는 singleton state는 `globalThis`에 저장하고 재초기화를 guard합니다.
- 이유: 하나의 Node process 안에서도 server bundle과 API route module graph가 분리될 수 있습니다.
- 영향: 새 key는 일반적으로 `__pt` plus PascalCase를 사용합니다. 기존 `__codexmux*`, `__cmux*` key는 주변 코드와 맞춰 유지합니다.

## ADR-005: 앱 상태와 Codex 원본 상태를 분리한다

- 상태: 승인
- 결정: codexmux 영속 상태는 `~/.codexmux/`에 저장하고, Codex CLI JSONL은 `~/.codex/sessions/`에서 읽기 전용으로 참조합니다.
- 이유: codexmux 설정과 Codex CLI 소유 데이터를 분리해야 안전한 초기화와 migration이 가능합니다.
- 영향: 비밀번호만 초기화하려면 `authPassword`, `authSecret`만 제거합니다. `config.json` 전체 삭제는 locale/theme/network/Codex option까지 초기화합니다.

## ADR-006: 한국어 기본, 영어 UI 병행

- 상태: 승인
- 결정: 지원 locale은 `ko`, `en`이며 기본 locale은 `ko`입니다. 기준 문서는 한국어를 canonical 언어로 사용합니다.
- 이유: 현재 운영 언어는 한국어이고, 제품 UI는 영어 사용자도 배제하지 않아야 합니다.
- 영향: SSR page는 저장된 locale로 message bundle과 `html lang`을 맞춥니다. 사용자-facing copy는 Korean/English message file을 함께 갱신합니다.

## ADR-007: Electron과 Android는 클라이언트 shell이다

- 상태: 승인
- 결정: Electron과 Android는 Codex runtime을 재구현하지 않고 codexmux server에 연결하는 shell로 유지합니다.
- 이유: Codex와 terminal execution은 server/runtime 계층에 두고, platform shell은 packaging, reconnect, notification, native bridge에 집중해야 합니다.
- 영향: Windows 전환에서는 Electron이 primary desktop shell입니다. Android는 legacy/mobile reference surface로 취급합니다.

## ADR-008: 알림 사운드는 공통 설정으로 제어한다

- 상태: 승인
- 결정: 작업 완료 사운드는 `soundOnCompleteEnabled` 하나로 toast, native notification, Web Push를 함께 제어합니다.
- 이유: 사용자는 foreground/background나 shell 종류와 관계없이 동일한 알림 정책을 기대합니다.
- 영향: `soundOnCompleteEnabled=false`이면 completion sound를 재생하지 않고 system notification도 silent로 요청합니다.

## ADR-009: terminal 제어 입력은 앱 단축키보다 우선한다

- 상태: 승인
- 결정: xterm, Codex web input, mobile surface에 focus가 있으면 `Ctrl+D`는 앱 단축키가 아니라 EOF/EOT(`0x04`)로 pty에 전달합니다.
- 이유: codexmux는 Codex CLI를 감싸는 제품이므로 shell/Codex CLI의 기본 제어 키가 유지되어야 합니다.
- 영향: Linux/Windows의 오른쪽 pane split 기본 단축키는 `Ctrl+Alt+D`입니다. macOS legacy path는 `Cmd+D`를 유지합니다.

## ADR-010: 상태와 타임라인 정책은 순수 모듈로 분리한다

- 상태: 승인
- 결정: 완료 판정, 알림 판정, session id mapping, timeline merge/dedupe, stable id 생성은 순수 helper 모듈에서 처리합니다.
- 이유: polling, JSONL watcher, hook, live pane capture가 같은 turn을 여러 경로로 관측하므로 부수효과 클래스에 정책을 숨기면 중복 알림과 중복 timeline이 생깁니다.
- 영향: `StatusManager`, `timeline-server`, React hook은 신호 수집과 송신을 담당하고, 정책은 단위 테스트를 동반합니다.

## ADR-011: DIFF 패널은 제한된 Git snapshot으로 렌더링한다

- 상태: 승인
- 결정: DIFF 패널은 현재 workspace cwd의 Git snapshot을 보여주되 tracked diff, untracked 수, 파일 크기, 전체 diff 크기, client fetch 시간을 제한합니다.
- 이유: 빌드 산출물이나 screenshot 같은 untracked 파일이 대량으로 생기면 API와 browser render가 함께 멈출 수 있습니다.
- 영향: 제한 초과 파일은 생략 안내를 표시하고, 큰 hunk는 기본 접힘으로 렌더링합니다.

## ADR-012: 성능 계측은 인증된 snapshot API로 노출한다

- 상태: 승인
- 결정: 성능 최적화는 `globalThis.__ptPerfStore`와 인증된 `/api/debug/perf` snapshot으로 관측한 뒤 좁게 진행합니다.
- 이유: 병목 후보가 Node server, WebSocket, terminal, JSONL parsing, React render에 분산되어 있습니다.
- 영향: perf snapshot은 숫자와 duration/counter만 반환합니다. session id, cwd, JSONL path, prompt, terminal output 본문은 노출하지 않습니다.

## ADR-013: Windows companion integration은 제거 상태를 유지한다

- 상태: 승인
- 결정: 이전 원격 Windows JSONL sync, remote terminal sidecar, remote session filter, 관련 page/API/helper script는 제품 surface에서 제거된 상태를 유지합니다.
- 이유: 별도 remote source model은 lifecycle, auth, token 배포, test surface를 넓히지만 핵심 session 안정성에 직접 기여하지 않았습니다.
- 영향: 이전 빌드의 `~/.codexmux/remote/codex/` 데이터는 읽지 않습니다. 새 Windows 기능은 companion 복구가 아니라 Windows-only runtime/host 전환으로 다룹니다.

## ADR-014: 세션 목록은 백그라운드 인덱스를 사용한다

- 상태: 승인
- 결정: `/api/timeline/sessions`는 요청마다 JSONL을 재귀 scan하지 않고 `SessionIndexService` snapshot을 읽습니다. Cold index refresh가 진행 중이면 현재 snapshot과 `refreshing` 상태를 즉시 반환하고, client가 짧게 재조회합니다.
- 이유: session 수가 늘어나면 request path에서 전체 JSONL parsing과 정렬이 반복되어 비용이 커집니다.
- 영향: 인덱스는 `~/.codexmux/session-index.json`에 persist하고 mtime/size가 바뀐 파일만 다시 파싱합니다. 저장 인덱스가 비어 있어도 session list request가 전체 refresh 완료를 기다리지 않습니다.

## ADR-015: approval queue metadata는 sanitized projection으로 유지한다

- 상태: 승인
- 결정: Codex permission/input prompt metadata는 live pane capture에서 계산한 non-durable projection으로 유지합니다.
- 이유: 실제 prompt source는 Codex CLI이며, codexmux가 별도 approval database를 만들면 CLI 상태와 drift가 생깁니다.
- 영향: raw command, cwd, session name, JSONL path, prompt body, assistant text, terminal output, token-like 값은 metadata/status/push payload에 넣지 않습니다.

## ADR-016: external trace forwarding은 환경 변수로 제한한 local feed만 사용한다

- 상태: 승인
- 결정: `CODEXMUX_BRIDGE_TRACE_URL`과 `CODEXMUX_BRIDGE_TRACE_TOKEN`이 설정된 경우에만 status summary를 codex-ai-bridge loopback ingress로 best-effort POST합니다.
- 이유: Discord token, channel routing, trace preference는 bridge가 소유합니다.
- 영향: 실패는 status broadcast를 막지 않습니다. payload는 summary-only shape로 제한합니다.

## ADR-017: approval audit은 sanitized action log로 제한한다

- 상태: 승인
- 결정: approval queue의 durable history는 `~/.codexmux/approval-audit.jsonl` append-only action log로 제한합니다.
- 이유: 운영자는 표시/선택/fallback 여부를 알아야 하지만 prompt 원문이나 terminal output을 장기 저장하면 안 됩니다.
- 영향: 저장 필드는 event type, workspace id, tab id, prompt/risk/approval enum, option count, selected option index, fallback reason으로 제한합니다. Web Push outcome도 `push-sent`, `push-failed`, `push-skipped-empty`, `push-skipped-visible` 같은 enum event로만 기록하며 raw push payload나 subscription endpoint는 저장하지 않습니다.

## ADR-018: lifecycle action은 allowlist와 sanitized audit으로 제한한다

- 상태: 승인
- 결정: `/experimental/runtime`에서 실행 가능한 action은 서버 allowlist id로 제한합니다. 현재 action은 `phase6-gate`, `restart-service`, `deploy-local`입니다.
- 이유: 운영 UI가 일반 원격 shell이 되면 command injection과 정보 유출 위험이 큽니다.
- 영향: 실행 기록은 sanitized failure label과 duration 중심으로 남기며 stdout/stderr, env, cwd, token, prompt, terminal output은 저장하지 않습니다.

## ADR-019: 런타임 v2 Supervisor와 worker runtime을 도입한다

- 상태: 제안, 단계적 적용 중
- 결정: public routing과 worker lifecycle, typed IPC command routing을 소유하는 Supervisor를 도입합니다.
- 이유: terminal IO, storage mutation, JSONL parsing, process polling은 명시적인 failure boundary와 ownership boundary를 가져야 합니다.
- 영향: runtime v2 API route는 direct store/helper가 아니라 Supervisor service를 호출합니다. Storage, terminal, timeline, status worker는 surface별 mode와 rollback flag를 갖습니다.

## ADR-020: 런타임 v2 app state는 SQLite를 사용한다

- 상태: 제안, 단계적 적용 중
- 결정: runtime v2 source of truth는 Storage Worker가 소유하는 `~/.codexmux/runtime-v2/state.db`입니다.
- 이유: normalized entity, transaction, invariant enforcement, indexed query, durable event log는 JSON 파일만으로 안전하게 유지하기 어렵습니다.
- 영향: legacy JSON store는 rollback과 migration fallback으로 남습니다. `better-sqlite3`는 optional dependency이며 runtime v2가 켜졌을 때만 필요합니다.

## ADR-021: worker IPC는 typed envelope를 사용한다

- 상태: 제안, 단계적 적용 중
- 결정: worker transport는 `child_process.fork` 기반 typed envelope IPC를 사용합니다.
- 이유: 별도 internal port 없이 TypeScript type/schema 재사용과 process boundary 검증을 시작하기 가장 단순합니다.
- 영향: command payload, reply payload, event payload, correlation id, timeout, structured error가 worker contract의 일부입니다.

## ADR-022: terminal byte stream은 ephemeral data다

- 상태: 제안, 단계적 적용 중
- 결정: terminal stdin/stdout/resize stream은 durable state로 저장하지 않습니다.
- 이유: terminal byte를 별도 저장하면 큰 저장 비용과 replay 복잡도가 생기지만 핵심 안정성 문제를 해결하지 못합니다.
- 영향: client는 reconnect 때 runtime adapter에 다시 attach합니다. terminal lifecycle과 status fact만 durable하게 남깁니다.

## ADR-023: Windows-only 제품 타깃

- 상태: 승인
- 결정: codexmux의 다음 제품 전환 타깃은 Windows-only service/product입니다.
- 이유: 사용자 목표는 기존 codexmux 기반을 Windows 전용 제품으로 구축하고 제공하는 것입니다.
- 영향: Windows terminal runtime, Windows process inspector, Windows service/tray host, Windows installer/update smoke가 release 기준이 됩니다. macOS/Linux/Android 문서는 legacy/reference로 유지하고, 새 기능 기준으로 확장하지 않습니다.

## ADR-024: codexwinmux는 별도 Windows 제품 line으로 분리한다

- 상태: 승인
- 결정: `codexmux` release line은 기존 package name, updater channel, app id, data dir을 보존하고, Windows 설치형 제품 마감은 별도 저장소 `codexwinmux`의 제품 line에서 진행합니다.
- 이유: `codexmux`에는 이미 `productName=codexmux`, `appId=com.hardcoremonk.codexmux`, `~/.codexmux`, GitHub updater release history가 연결되어 있습니다. 이 line을 in-place rename하면 update channel, uninstall registry, updater cache, 기존 내부 사용자의 data dir ownership이 동시에 바뀌어 rollback과 증거 추적이 어려워집니다.
- 영향: 이 저장소는 원본 기반, architecture 기준, smoke 증거를 유지합니다. `codexwinmux`는 `productName`, `appId`, data dir, release repo, updater cache를 독립적으로 소유해야 하며, `codexmux -> codexwinmux` 데이터 이동은 자동 rename이 아니라 명시적 migration/import로만 처리합니다.
- 운영 기준: 반복 release/update smoke는 `docs/operations/windows-release-update-repeat-checklist.md`를 따르고, 제품 line migration 기준은 `docs/operations/codexwinmux-product-line-migration.md`를 따릅니다.

## ADR-025: Codex CLI integration contract는 inline hook과 web-input 제출 frame으로 고정한다

- 상태: 승인
- 결정: Codex launch/resume command는 `hooks={path="~/.codexmux/hooks.json"}`를 사용하지 않고 `hooks.SessionStart`, `hooks.UserPromptSubmit`, `hooks.Stop` inline TOML override를 각각 `-c`로 전달합니다. Codex web input은 prompt 본문을 bracketed paste로 감싸고 Enter를 같은 frame에 포함한 뒤 후속 Enter를 한 번 더 보냅니다.
- 이유: 현재 Codex CLI strict config parser는 `hooks` path string override를 구조화된 hook table로 보지 않아 config load 오류를 낼 수 있습니다. Web input을 raw text와 별도 Enter frame으로 나누면 재접속/copy mode/긴 입력 확인 상태에서 입력이 프롬프트에 남고 제출되지 않을 수 있습니다.
- 영향: `~/.codexmux/hooks.json`은 local hook/statusline bridge 호환용 생성 파일로 남지만 launch/resume config source가 아닙니다. Codex command builder, `MSG_WEB_STDIN`, web input payload를 바꾸면 `TMUX.md`, `STATUS.md`, `DATA-DIR.md`, `TESTING.md`와 landing docs를 함께 갱신합니다.
