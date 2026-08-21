# Purplemux 선택 기능 수동 도입 구현 계획

> 프로젝트 정책에 따라 task별로 테스트를 먼저 추가하고 구현한다. 사용자가 별도로
> 요청하지 않았으므로 issue, commit, push, 배포는 수행하지 않는다.

**Goal:** Purplemux에서 검증된 네 기능군을 codexmux의 Windows-only Runtime v2,
Pages Router, status/timeline ownership과 locale 계약에 맞게 수동 구현한다.

**Architecture:** 기존 256KB Codex JSONL tail을 rate-limit과 rich timeline의 공통 입력으로
사용한다. Browser는 raw Codex command 대신 server launch intent를 보내고, server provider가
tab-scoped capability를 포함한 native session hook을 조립한다. 회귀 수정은 기존 store와
terminal 흐름을 유지하는 작은 독립 변경으로 적용한다.

**Tech Stack:** TypeScript 5.9, Next.js 16 Pages Router/custom Node server, Runtime v2 worker,
React 19, Vitest 4, Playwright/Chromium, pnpm 10, Codex CLI `0.144.1+`.

**구현 상태 (2026-08-14):** Task 1~11과 Task 12의 Linux gate, 문서, 운영 handoff를
완료했다. 현재 Codex 0.147.0 strict-config, full unit, production/Electron build,
browser reconnect, Runtime v2 status/timeline smoke와 실제 Linux user service restart가
통과했다. Windows package 실기 검증은 2026-08-15 사용자 결정으로 완료 조건에서 제거했고
ADR-025는 `Verified`로 승격했다.

아래 체크리스트는 구현 전 작성한 세부 검증 의도를 보존합니다. 현재 완료 판단은
2026-08-15에 확정한 automated gate와 operation handoff를 기준으로 하며, 남은 미체크
항목은 선택 도입 완료를 막는 release blocker가 아닙니다.

---

## 고정 입력과 결정

- 설계: `docs/superpowers/specs/2026-08-14-purplemux-selected-adoption-design.md`
- Grill-me: `docs/superpowers/grill-me/2026-08-14-purplemux-selected-adoption.md`
- 비교 감사: `docs/PURPLEMUX-ADOPTION-AUDIT.md`
- user/project/managed/plugin hook은 Codex native layer discovery가 보존한다. codexmux는
  user TOML을 읽거나 병합하지 않는다.
- Timeline은 field 4KiB, entry 16KiB 이내의 redacted preview만 전달한다.
- Rate-limit reset 이후 새 관찰이 없으면 윈도우별 `갱신 대기`를 표시한다.
- Status bridge는 non-blocking best-effort observer다.
- Stop은 matching tab Git cache를 invalidate하고 active tab만 즉시 fetch한다.

## Plan Design Review

- 정보 계층: 9/10. 사용량, timeline, terminal 회귀, hook 경계를 독립 task로 분리했다.
- 조작 안정성: 10/10. Browser command 조립 제거, server ownership 검증, approval 경계 유지가
  명시됐다.
- UI 일관성: 9/10. 기존 sidebar/timeline surface, semantic token, ko/en locale을 재사용한다.
- 복구 가능성: 9/10. 각 기능군은 독립 test와 rollback 경계를 가지며 기존 statusline,
  generic timeline, polling fallback을 유지한다.
- 범위 외: full output/download, local image serving, Claude provider, Windows Service installer,
  비선택 Purplemux 회귀, user hook 순서 보장.

Overall design score: 9/10. 구현 계획으로 진행 가능하다.

## File Map

주요 신규 파일:

- `src/lib/codex-rate-limits.ts`
- `src/lib/clipboard.ts`
- `src/hooks/use-git-refresh-generation.ts`
- `src/lib/providers/codex/session-hooks.ts`
- `src/lib/agent-launch-service.ts`
- `src/pages/api/agent/launch.ts`
- 대응하는 `tests/unit/**` fixture/test
- `docs/operations/2026-08-14-purplemux-selected-adoption-handoff.md`

주요 수정 파일:

- `src/types/status.ts`, `src/types/timeline.ts`
- `src/lib/codex-jsonl-state.ts`, `src/lib/status-manager.ts`
- `src/lib/codex-session-parser.ts`
- `src/lib/codex-command.ts`, `src/lib/providers/types.ts`, `src/lib/providers/codex/index.ts`
- `src/lib/hook-settings.ts`, `src/pages/api/status/hook.ts`
- `src/lib/runtime/supervisor.ts`와 terminal write 경계
- `src/hooks/use-terminal.ts`, `src/hooks/use-layout.ts`, `src/hooks/use-agent-status.ts`
- `src/hooks/use-git-branch.ts`, `src/hooks/use-git-status.ts`
- `src/components/features/timeline/**`, clipboard 호출 surface, agent launch 호출 surface
- `src/pages/api/git/branch.ts`, `src/pages/api/git/status.ts`
- locale message, ADR-025, status/runtime/testing/data 문서

## Task 1: Rate-limit pure parser와 fixture

**Files:** `src/lib/codex-rate-limits.ts`, `src/types/status.ts`,
`tests/unit/lib/codex-rate-limits.test.ts`

- [ ] JSONL `event_msg/token_count/rate_limits`의 primary/secondary 및 300/10080분 매핑,
  두 percentage key, 두 reset 형식, malformed/unknown/clamp test를 먼저 작성한다.
- [ ] `IRateLimitWindow`에 backward-compatible `observed_at`을 추가하고 윈도우별 observation을
  정규화한다.
- [ ] field별 최신 관찰만 병합하는 pure helper를 구현해 한 윈도우 갱신이 다른 윈도우를
  되돌리지 않는지 검증한다.
- [ ] `corepack pnpm exec vitest run tests/unit/lib/codex-rate-limits.test.ts`

## Task 2: JSONL 상태 publication 통합

**Files:** `src/lib/codex-jsonl-state.ts`, `src/lib/status-manager.ts`, status worker tests

- [ ] 기존 256KB tail fixture에서 state와 최신 rate-limit observation이 함께 반환되는 RED
  test를 추가한다.
- [ ] `checkCodexJsonlState()` 반환형을 확장하되 별도 directory scan/file write는 추가하지
  않는다.
- [ ] `StatusManager`의 JSONL reconciliation과 기존 `rate-limits.json` watcher가 같은
  newest/dedupe publication gate를 사용하도록 만든다.
- [ ] 오래된 producer, 동일 snapshot, 부분 윈도우 update의 broadcast test를 통과시킨다.

## Task 3: Rate-limit freshness UI와 locale

**Files:** `src/components/layout/sidebar-rate-limits.tsx`, locale message, pure view helper/test

- [ ] reset 전/후, 윈도우별 stale, 관찰 시각을 fake clock으로 검증하는 pure view-model test를
  추가한다.
- [ ] expired observation의 0%/다음 reset 합성을 제거하고 `갱신 대기 / Awaiting update`를
  표시한다.
- [ ] active/stale visual은 기존 semantic token을 사용하고 tooltip에 관찰 시각을 노출한다.
- [ ] ko/en SSR locale hydration이 유지되는지 locale test를 실행한다.

## Task 4: Rich timeline domain parser

**Files:** `src/types/timeline.ts`, `src/lib/codex-session-parser.ts`, parser fixtures/tests

- [ ] exec begin/delta/end, web search, MCP, apply patch, warning/error/stream error, compaction,
  reasoning summary fixture와 deterministic ID/incremental equivalence test를 작성한다.
- [ ] 기존 generic `tool-call`/`tool-result` fallback과 partial final-line buffer contract를
  고정한다.
- [ ] secret-like field redaction, control character 정리, 4KiB field/16KiB entry cap과
  `truncated` test를 추가한다.
- [ ] delta accumulator는 bounded state만 유지하고 duplicate end를 idempotent하게 병합한다.

## Task 5: Rich timeline dense UI

**Files:** `src/components/features/timeline/**`, locale message, view-model/browser smoke

- [x] semantic entry별 summary/status/details projection을 pure helper로 test한다.
- [ ] 기존 compact row와 semantic token을 유지해 command/web/MCP/patch/error/compaction을
  구분하고 details가 있을 때만 접근 가능한 expand control을 표시한다.
- [ ] 이미 bounded된 details만 렌더링하고 local path를 URL/image로 바꾸지 않는다.
- [ ] keyboard/focus-visible, ko/en 문구, 긴 command/path wrapping을 Chromium smoke로 검증한다.

## Task 6: Terminal/input 회귀 수정

**Files:** `src/lib/clipboard.ts`, 네 clipboard surface, `src/hooks/use-terminal.ts`, tests

- [ ] `isComposing`/229 이벤트가 xterm에 위임되고 Alt mapping은 전송 전 preventDefault하는
  key decision helper test를 추가한다.
- [ ] secure clipboard와 textarea/`execCommand` fallback의 성공·실패·cleanup test를 작성한다.
- [ ] terminal, session metadata, copy drawer, Tailscale settings를 공통 helper로 전환하고
  surface별 기존 toast 책임을 유지한다.

## Task 7: Pane focus와 timeline spacer 회귀 수정

**Files:** `src/hooks/use-layout.ts`, `src/components/features/timeline/timeline-view.tsx`, tests/smoke

- [ ] pane close 응답이 남은 local active pane/tab을 보존하는 store regression을 추가하고
  `applyLayoutPreserveFocus()`를 사용한다.
- [ ] response content resize, anchor 교체, visibility/focus/pageshow 및 delayed shrink를
  독립 scheduler/view helper로 test한다.
- [ ] observer/timer cleanup과 spacer clamp를 구현하고 background/foreground Chromium smoke를
  실행한다.

## Task 8: Stop 기반 Git cache generation

**Files:** `src/hooks/use-git-refresh-generation.ts`, Git hooks/API/lib, agent status tests

- [x] stop sequence dedupe, active 즉시 consume, inactive 선택 시 consume하는 generation store
  test를 작성한다. Client Zustand module singleton으로 session별 generation을 공유한다.
- [ ] `getGitBranch/getGitStatus`와 Pages API에 명시적 `force`를 추가해 15초 cache만 bypass하고
  polling interval은 유지한다.
- [ ] `use-agent-status` stop event가 matching tab/workspace를 dirty 처리하도록 연결한다.
- [x] 두 Git hook이 visible generation을 한 번만 `force=1`로 consume하는지 검증한다.

## Task 9: Codex compatibility와 session hook command

**Files:** `src/lib/preflight.ts`, `src/lib/providers/codex/session-hooks.ts`,
`src/lib/codex-command.ts`, provider tests/preflight

- [ ] `codex --version` parser와 `<0.144.1` update-required test를 추가한다. 매 launch마다
  `doctor`를 실행하지 않는다.
- [ ] session hook builder가 POSIX `command`와 Windows `commandWindows`, timeout 3초,
  세 event, capability를 정확히 인코딩하는 snapshot test를 작성한다.
- [ ] provider option에 canonical tab target을 추가하고 launch/resume가 같은 hook builder를
  쓰게 한다.
- [ ] user config read/merge, hook trust bypass, secret logging이 없음을 static test로 고정한다.

## Task 10: Cross-platform Node hook bridge

**Files:** `src/lib/hook-settings.ts`, bridge template/helper, `src/pages/api/status/hook.ts`, tests

- [x] bounded stdin, payload schema, token/port file, loopback POST, timeout, 항상 success exit를
  helper test로 작성한다.
- [ ] `status-hook.sh` 대신 project dependency가 필요 없는 Node bridge를 mode-protected data
  directory에 원자적으로 생성한다.
- [ ] HMAC capability의 tab/session/expiry를 검증하고 현재 layout ownership과 일치한 event만
  reducer로 전달한다.
- [ ] 실패 counter는 secret-free diagnostic만 기록하며 token/payload/user command는 log하지
  않는다.

## Task 11: Server-side agent launch intent

**Files:** `src/lib/agent-launch-service.ts`, `src/pages/api/agent/launch.ts`, tab/workspace routes,
Runtime v2 supervisor, desktop/mobile components, tests

- [ ] API method/auth, workspace-pane-tab ownership, codex panel, safe shell, capability, write 실패
  test를 작성한다.
- [ ] Runtime v2에 subscriber 없는 server-internal terminal write 경계를 추가하되 exact
  session/tab ownership 검증 후 worker `terminal.write-stdin`만 호출한다. Legacy는 기존
  `sendKeys`를 사용한다.
- [ ] 새 tab은 `{ panelType:'codex', startAgent:true }`, 기존 tab은 `{ action:'launch'|'restart' }`
  intent만 보내도록 바꾼다.
- [ ] browser bundle에서 `codex-client-command`와 CLI token/hook command가 제거됐는지 build
  artifact static check를 추가한다.
- [ ] auto-resume/timeline resume/workspace create caller에 tab context를 전달한다.

## Task 12: 통합 검증, 문서와 운영 handoff

**Files:** ADR-025와 status/runtime/data/testing docs, operation handoff, smoke script

- [x] ADR-025를 `Review -> Approved -> Verified`로 기록하고 native coexistence, server launch,
  minimum CLI, bridge failure semantics를 반영한다.
- [x] `docs/STATUS.md`, `docs/TMUX.md`, `docs/DATA-DIR.md`,
  `docs/ARCHITECTURE-LOGIC.md`, `docs/TESTING.md`, 감사 문서를 갱신한다.
- [x] minimum `0.144.1` compatibility fixture와 current Codex `--strict-config` schema smoke를
  추가한다.
- [x] 다음 Linux gates를 실행한다.

```bash
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm build
corepack pnpm build:electron
corepack pnpm smoke:browser-reconnect
corepack pnpm smoke:runtime-v2:status-default
corepack pnpm smoke:runtime-v2:timeline-websocket-default
```


## Plan Engineering Review

### 수정 후 통과 항목

- **Data ownership:** JSONL parser는 pure projection만 만들고 publication은 StatusManager가
  소유한다. Rate-limit `observed_at`은 윈도우별 갱신 순서를 보존한다.
- **Runtime ownership:** 내부 terminal write는 공개 WebSocket subscriber를 우회하는 범용
  backdoor가 아니라 검증된 exact tab/session용 service method로 한정한다.
- **Compatibility:** runtime launch는 기존 version preflight만 사용한다. 느린
  `--strict-config` 검증은 integration smoke에 둔다.
- **Security:** Capability는 HMAC, target, expiry를 검증한다. bridge는 project package를
  import하지 않고 bounded input만 읽으며 secret/raw output을 log하지 않는다.
- **Performance:** 추가 session directory scan, 무제한 accumulator, inactive-tab fetch,
  launch-time doctor를 금지한다.
- **Failure:** hook 관찰 실패는 Codex action을 막지 않는다. 기존 JSONL/process polling과
  statusline/generic timeline fallback이 남는다.
- **Rollback:** Task 1~3, 4~5, 6~8, 9~11을 각각 독립 rollback할 수 있고 persistent migration이
  없다.

### 잔여 risk

- Node 실행 경로와 `commandWindows` escaping은 serialization과 strict-config contract로 방어한다.
- Codex hook/JSONL schema drift는 fixture 및 integration smoke로 방어하되 public
  compatibility contract가 아니다.
- Redaction은 노출량을 줄이는 보조 방어다. 보안 경계는 full output 미전송과 byte cap이다.

**Gate:** 구현과 검증 완료. Windows package 실기 검증은 완료 조건에 포함하지 않는다.
