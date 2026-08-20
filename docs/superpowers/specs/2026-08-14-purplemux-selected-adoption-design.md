# Purplemux 선택 기능 수동 도입 설계

**상태:** Frozen — grill-me 및 plan engineering review 통과

**작성일:** 2026-08-14

**Lifecycle:** `brainstorming / writing-spec -> domain-architecture -> grill-me -> plan-design-review -> writing-plans -> plan-eng-review` 통과

**사용자 승인:** 2026-08-14. Grill-me 결정은
`docs/superpowers/grill-me/2026-08-14-purplemux-selected-adoption.md`, 구현 단위와
engineering gate는 `docs/superpowers/plans/2026-08-14-purplemux-selected-adoption.md`에
기록한다.

## 1. 결정 요약

Purplemux를 새 upstream으로 삼거나 commit을 합치지 않는다. 사용자가 선택한 다음 네
기능군만 codexmux의 Windows-only, Runtime v2, approval, locale 계약 안에서 수동
구현한다.

1. Codex JSONL 기반 rate limit producer
2. Codex rich timeline
3. terminal/input 회귀 수정 묶음
4. Codex native hook 공존과 cross-platform bridge

핵심 방향은 다음과 같다.

- rate limit은 기존 Codex JSONL 상태 감시가 읽은 tail에서 함께 추출한다. 별도 전체
  session directory scanner를 추가하지 않는다.
- rich timeline은 기존 deterministic ID와 incremental byte-offset parser를 유지하고,
  Codex event를 의미 단위 projection으로 확장한다.
- 회귀 수정은 Purplemux 최종 동작을 작은 독립 변경으로 다시 구현한다.
- hook은 browser에서 조립하지 않는다. server-side provider가 codexmux session hook을
  추가하고 검증된 tab에만 실행 명령을 전달한다.
- Codex `0.144.1+`의 native layer discovery가 user/project/managed/plugin hook을 보존한다.
  codexmux는 user `config.toml`을 읽거나 재직렬화하지 않는다.

## 2. 배경과 기준 소스

### 2.1 기준 revision

- Purplemux: `52140216d8bb5bfffed30d8d452f77b88339a4ae`, release `v0.4.5`
- Codexmux: 설계 시작 시 local tip `251a8a1f`
- 로컬 Codex CLI: `0.147.0`
- package manager: pnpm `10.32.1`

기존 비교 결과는 `docs/PURPLEMUX-ADOPTION-AUDIT.md`를 기준으로 한다. 본 문서는 그
감사를 구현 가능한 범위와 경계로 좁힌다.

### 2.2 Codex hook 계약 확인

OpenAI 공식 web 문서 검색에서는 lifecycle hook schema를 직접 확인할 수 있는 페이지가
노출되지 않았다. 대신 설치된 CLI의 다음 공식 배포 산출물을 확인했다.

- `codex --strict-config`로 현재 사용 중인 `SessionStart`, `UserPromptSubmit`, `Stop`
  override가 모두 유효함을 확인했다.
- 설치된 `codex-hooks` source/schema는 11개 event를 정의한다.
- command handler는 `command`, `commandWindows`, `timeout`, `async`, `statusMessage`,
  `additionalContextLimit`를 지원한다.
- Codex `0.147.0`은 hook trust를 별도 관리하며
  `--dangerously-bypass-hook-trust`를 제공하지만 codexmux는 이 위험 옵션을 사용하지 않는다.

본 작업은 codexmux 상태 전이에 필요한 세 session hook만 추가한다. Codex `0.144.1+`는
enabled config layer를 각각 순회하므로 user/project/managed/plugin hook과 session hook을
함께 발견한다. codexmux는 native discovery를 다시 구현하지 않는다.

## 3. 목표와 비목표

### 3.1 목표

- statusline 호출이 없어도 활성 Codex JSONL에서 최신 5시간/7일 rate limit을 sidebar에
  표시한다.
- exec, web search, MCP, patch, warning/error, compaction을 timeline에서 서로 구분한다.
- 한국어 IME, 비보안 HTTP clipboard, pane close focus, timeline spacer, stop 후 Git cache
  stale 문제를 재현 가능한 test와 함께 해결한다.
- 동일 event의 user/project/managed/plugin hook과 codexmux hook을 손실이나 중복 없이
  함께 실행한다.
- Linux 개발 환경과 Windows 제품 runtime에서 같은 순수 parser와 provider 계약을 쓴다.

### 3.2 비목표

- Purplemux 전체 merge 또는 지속적인 upstream 동기화
- Claude provider/combined provider session model 도입
- macOS LaunchAgent, Linux systemd, tmux architecture 확대
- local image file serving
- raw shell/MCP output 전체 보관 또는 무제한 렌더링
- approval queue를 우회하는 timeline action
- pending whitespace, authoritative sidebar, tab-wrap 등 이번에 선택하지 않은 회귀 수정
- Windows service host 설치/제거 구현
- Codex user config 또는 hook trust state 수정

## 4. Refero reference lock

Live Refero MCP가 없어 다음 두 surface를 고정 reference로 사용한다.

### Primary reference

현재 codexmux의 `DESIGN.md`, `docs/STYLE.md`, 기존 timeline component.

- 조용하고 밀도 높은 운영 화면
- 기존 shadcn/Tailwind token만 사용
- card를 중첩하지 않고 정보 계층을 typography와 spacing으로 해결
- 모바일에서는 가능한 44px touch target과 `focus-visible` 유지
- 한국어 기본 locale과 SSR hydration 유지

### Secondary reference

Purplemux의 rich timeline component는 event 정보 계층과 details 접기 패턴만 참고한다.
색상, branding, hardcoded 문구, 전체 layout은 복사하지 않는다.

### Decision ledger

| 결정 | 채택 이유 | 거부한 대안 |
| --- | --- | --- |
| compact semantic row + bounded details | 현재 운영 UI의 밀도와 긴 output 안전성을 함께 지킴 | event마다 큰 bordered card |
| 기존 semantic status color 사용 | light/dark theme 계약 유지 | Purplemux color 직접 복사 |
| command/path/code는 wrapping 예외 유지 | 조작 가능한 기술 정보의 정확성 보존 | 한국어 `keep-all` 일괄 적용 |
| local image 제외 | file serving 보안 설계가 별도 필요 | JSONL path를 바로 browser에 노출 |

## 5. Domain architecture

### 5.1 Canonical terms

| 용어 | 정의 | 소유 boundary |
| --- | --- | --- |
| Codex rate-limit observation | 한 JSONL record에서 정규화한 account limit snapshot | pure Codex parser |
| Rate-limit publication | observation을 최신값으로 선택해 status client에 전달하는 effect | `StatusManager` / Status Worker |
| Rich timeline projection | raw Codex record를 bounded semantic entry로 변환한 값 | Codex timeline parser |
| Codex session hook | native layer에 추가되는 codexmux 소유의 세 status observation handler | server-side Codex provider |
| Agent launch intent | browser가 raw command 대신 요청하는 `launch`/`restart` 행위 | authenticated API + provider |
| Terminal compatibility fix | terminal semantics를 바꾸지 않는 IME/clipboard/focus/spacer 보정 | client hooks/components |

### 5.2 Source-of-truth 경계

- raw Codex JSONL은 session event의 기준 소스다.
- `IRateLimitsData`와 `ITimelineEntry`는 JSONL에서 파생한 projection이며 원본을 대체하지
  않는다.
- tab/session ownership은 layout + Runtime v2 storage가 기준이다.
- user/project/managed/plugin hook과 trust state는 Codex config layer stack이 기준이다.
- codexmux는 user config를 읽거나 수정하지 않고 현재 process에 session hook만 추가한다.
- approval metadata와 응답은 기존 approval API/audit가 기준이며 timeline은 표시만 한다.

### 5.3 효과 소유권

- parser는 file write, broadcast, toast를 수행하지 않는다.
- Runtime v2 default에서는 Status Worker 내부의 `StatusManager`가 rate-limit publication을
  소유한다.
- legacy fallback도 같은 `StatusManager` method를 사용한다.
- timeline file watcher는 기존 offset/watch lifecycle을 유지하고 새 entry를 전달하는
  역할만 수행한다.
- Git 강제 갱신은 client hook event가 active matching tab에 대해 한 번 요청한다.
- hook config read와 launch command build는 server-side provider만 수행한다.

### 5.4 ADR 영향

- ADR-025를 개정한다.
  - fixed inline hook이 Codex native layer discovery와 공존한다는 계약 명시
  - browser-built raw Codex command에서 server-side launch intent로 변경
  - POSIX-only status hook에서 cross-platform bridge로 전환
  - minimum supported Codex CLI `0.144.1`과 preflight 실패 정책 명시
- ADR-010의 pure status/timeline policy와 ADR-019의 Status Worker ownership은 유지한다.
- 새로운 독립 ADR은 만들지 않고 ADR-025의 상태를 다시 `Review`로 전환한 뒤 구현/검증
  단계에서 `Implemented`/`Verified`로 올린다.

## 6. 상세 설계

### 6.1 Codex rate limit producer

#### Parse

새 pure module은 `event_msg` / `token_count` record의 `rate_limits`를 검사한다.

- `primary` 또는 300분 window -> `five_hour`
- `secondary` 또는 10,080분 window -> `seven_day`
- `used_percent`와 `used_percentage`를 모두 정규화
- reset은 epoch `resets_at`을 우선하고, 없으면 record 관찰 시점에
  `resets_in_seconds`를 더한다.
- percentage는 유한한 0~100 값으로 제한한다.
- 두 window가 모두 유효하지 않으면 observation을 만들지 않는다.
- record timestamp가 유효하면 `ts`로 쓰고, 아니면 parse 호출 시 전달한 관찰 시각을 쓴다.

#### Publication

`checkCodexJsonlState()`가 이미 읽는 최대 256KB tail에서 최신 observation도 반환한다.
`StatusManager`는 다음 조건으로 publish한다.

- `ts`가 현재 `lastRateLimits.ts`보다 최신
- 또는 같은 `ts`라도 window 값이 달라짐

기존 `rate-limits.json` watcher와 statusline endpoint는 호환 fallback으로 남긴다. 두
producer는 같은 publication gate를 통과하므로 중복 broadcast하지 않는다. JSONL parser가
직접 파일을 쓰지 않는다.

#### Freshness와 UI

- 각 window는 자기 `resets_at`을 freshness boundary로 사용한다.
- reset 전에는 마지막 관찰 percentage와 projection을 표시하고 tooltip에 관찰 시각을
  표시한다.
- reset 이후 새 observation이 없으면 다음 주기의 reset과 0%를 합성하지 않는다.
- stale window는 bar/projection을 비활성화하고 `갱신 대기 / Awaiting update`를 표시한다.
- 5시간/7일 window는 서로 독립적으로 stale이 될 수 있다.
- 다음 유효 JSONL 또는 statusline observation을 받을 때만 active 표시로 돌아간다.
- stale 여부는 `ts`와 `resets_at`에서 파생하며 별도 persistent truth로 저장하지 않는다.

#### 실패 동작

- malformed/partial line은 무시한다.
- unknown window는 무시한다.
- 오래된 observation은 현재 UI 값을 되돌리지 않는다.
- Codex가 rate limit을 기록하지 않는 버전에서는 기존 fallback 동작을 유지한다.
- reset이 지난 observation을 새 주기 0%로 추정하지 않는다.

### 6.2 Rich timeline

#### Semantic entry

기존 generic `tool-call`/`tool-result`와 호환 fallback을 유지하면서 다음 구분을 추가한다.

- command execution: 시작/stream/end, exit code, duration
- web search: query와 완료 상태
- MCP call: server, tool, bounded arguments/result, status
- patch: 파일 목록과 add/update/delete 요약
- warning/error/stream error
- context compaction marker
- reasoning summary

새 entry는 raw protocol record를 그대로 노출하지 않는다. 기존
`createTimelineEntryId()`의 line/record 기반 deterministic ID를 사용하고 init,
load-more, incremental append에서 같은 ID가 생성되어야 한다.

#### Size와 redaction

- server는 bounded/redacted preview만 client에 전달한다. Full raw tool output을 WebSocket,
  별도 API 또는 download로 제공하지 않는다.
- 한 field preview는 UTF-8 기준 4KiB로 제한한다.
- 한 semantic entry의 확장 details 총량은 16KiB로 제한한다.
- 초과 여부를 `truncated`로 표시한다.
- 기존 secret redaction helper가 있으면 재사용하고, token/header/password 형태를
  렌더링 전에 다시 redaction한다.
- null byte와 제어 문자는 안전한 표시 문자열로 바꾼다.
- local image/path URL을 만들지 않는다.
- UI의 expand control도 이미 전달된 bounded details만 펼친다. Full-output 기능은 명시적
  권한, on-demand fetch, audit와 byte quota를 갖춘 별도 lifecycle로만 검토한다.

#### UI

- 기본 상태는 한두 줄 summary다.
- details가 있을 때만 접근 가능한 expand control을 표시한다.
- pending/success/error는 기존 semantic token과 icon으로 구분한다.
- command/output/path는 monospace와 `overflow-wrap:anywhere` 또는 horizontal scroll을
  상황에 맞게 사용한다.
- 승인 가능한 것처럼 보이는 버튼을 새로 만들지 않는다.
- 한국어/영어 message key를 동시에 추가한다.

#### Parser compatibility

- 알 수 없는 `response_item`과 function call은 기존 generic entry로 남긴다.
- delta만 있고 begin/end가 없는 경우에도 orphan entry를 만들지 않고 bounded pending
  accumulator로 복구한다.
- duplicate end event는 기존 entry status만 안정적으로 갱신한다.
- partial final line은 다음 incremental read까지 buffer에 남긴다.

### 6.3 Terminal/input 회귀 수정

각 수정은 별도 unit/browser regression으로 구현한다.

#### 한국어 IME

`use-terminal.ts`의 xterm custom key handler가 다음 경우 xterm에 판단을 위임한다.

- `event.isComposing`
- legacy IME key code `229`

Alt mapping으로 직접 escape sequence를 보낼 때는 먼저 native event의 default를 막아
hidden textarea caret가 변형되지 않게 한다. web input bar의 기존 composition guard는
유지한다.

#### Clipboard fallback

공통 `copyTextToClipboard()` helper를 추가한다.

1. secure context에서 `navigator.clipboard.writeText`
2. 사용할 수 없거나 실패하면 off-screen textarea + `document.execCommand('copy')`
3. 성공 여부 boolean 반환
4. 임시 node와 selection 정리

현재 직접 clipboard를 쓰는 terminal, session metadata, copy drawer, Tailscale settings를
공통 helper로 바꾼다. 실패 toast는 호출 surface가 담당한다.

#### Pane close focus

pane 삭제 응답을 적용할 때 남아 있는 local active pane/tab을 우선 보존한다. 삭제된
pane/tab만 server 응답의 authoritative active 값으로 fallback한다.

#### Timeline spacer recovery

- response content resize를 관찰해 pending spacer를 재계산한다.
- pending user anchor가 교체/병합되면 최신 유효 anchor로 다시 연결한다.
- `visibilitychange`, `focus`, `pageshow`에서 즉시 및 한 번의 delayed shrink를 수행한다.
- background tab에서는 spacer가 음수나 stale 대형 값으로 남지 않게 clamp한다.
- observer/timer는 unmount와 session 변경 때 모두 정리한다.

#### Stop 후 Git refresh

- Codex `stop` hook event는 matching tab/workspace의 Git cache dirty generation을 올린다.
- matching tab이 active이면 branch/status query에 `force=1`을 즉시 한 번 전달한다.
- inactive tab은 background request를 만들지 않고 다음 활성화 때 한 번 `force=1`로
  갱신한다.
- server API는 `force=1`일 때만 15초 cache를 bypass한다.
- 다른 workspace와 같은 stop sequence의 duplicate event는 generation 단위로 dedupe한다.
- 기존 polling interval은 바꾸지 않는다.

### 6.4 Codex native hook 공존

#### Session hook injection

Codexmux는 다음 세 session flag만 추가한다.

- `hooks.SessionStart`
- `hooks.UserPromptSubmit`
- `hooks.Stop`

Codex `0.144.1+`의 hook discovery는 managed requirement, enabled config layer,
plugin source를 각각 수집한 뒤 session flag layer의 handler도 함께 수집한다. 배열의 최종
TOML merge 결과만 실행하지 않으므로 codexmux session hook이 기존 hook을 덮지 않는다.

Codexmux는 user hook을 session flag에 복사하지 않는다. 복사하면 원본 layer와 session
layer에서 같은 handler가 중복 실행되고 trust identity가 달라질 수 있다. `smol-toml`, user
config parser와 hook serializer는 이 작업에 추가하지 않는다.

Codexmux hook은 status 관찰용이며 user prompt를 block하거나 output을 model context에
주입하지 않는다. timeout은 3초를 유지한다. Native discovery 순서상 codexmux hook이 모든
user hook보다 먼저 실행된다고 가정하지 않으며, 정확한 실행 순서에 제품 의미를 부여하지
않는다.

#### Launch intent

browser의 `buildCodexCommandFromStore()` 의존을 제거한다.

- 새 tab 요청은 `{ panelType: 'codex', startAgent: true }`를 보낸다.
- 기존 tab의 새 session/restart는 authenticated agent-launch endpoint에 tab identity와
  action만 보낸다.
- server는 workspace/pane/tab 관계, panel type, 현재 safe shell 상태를 확인한다.
- provider가 codexmux session hook과 사용자 설정 option으로 최종 command를 만든 뒤
  terminal transport에 전달한다.
- API 응답에는 user hook command나 CLI token을 넣지 않는다.

resume은 기존 provider의 async `buildResumeCommand()` 경계를 유지하되 같은 session hook
builder를 사용한다.

#### Cross-platform bridge

현재 `status-hook.sh`를 Node 기반 bridge로 대체한다.

- hook stdin JSON을 bounded read하고 zod로 필요한 field만 검증한다.
- port와 CLI token은 `~/.codexmux`의 mode-protected file에서 읽는다.
- launch 시 부여한 tab capability를 함께 보내고 server가 현재 tab ownership과 대조한다.
- Node `http.request`로 loopback API에 POST한다. `curl`, `sh`, `tmux`를 요구하지 않는다.
- payload, token, user hook command를 log하지 않는다.
- bridge는 status observation만 수행하며 prompt, tool 또는 stop decision을 반환하지 않는다.
- server unavailable, token read failure와 network timeout에서도 bounded attempt 후 성공
  exit해 Codex action을 차단하지 않는다.

현재 tmux runtime에서는 tab capability를 tmux session identity에 매핑한다. Windows direct
PTY runtime에서는 tab ID가 기준이 된다. API 내부에서 둘을 canonical tab target으로
정규화하고 status reducer에는 검증이 끝난 대상만 전달한다.

#### Compatibility와 failure policy

- minimum supported Codex CLI는 release workflow와 같은 `0.144.1`이다.
- 더 오래된 CLI는 preflight에서 update-required로 표시하고 agent launch를 허용하지 않는다.
- session hook schema preflight가 실패하면 hook 없이 조용히 실행하지 않고 actionable error를
  반환한다.
- malformed user config의 진단과 실패는 Codex CLI가 소유한다. codexmux가 config를 읽어
  별도 오류 taxonomy를 만들지 않는다.
- hook trust 미승인은 Codex의 정상 trust UX를 유지하며 bypass flag를 추가하지 않는다.
- 오류 message와 log에는 CLI token, hook payload, user hook command를 포함하지 않는다.
- bridge delivery failure는 secret-free diagnostic과 service health degraded counter로 남기고,
  JSONL watcher/process polling이 status를 재조정한다.
- hook executable을 시작할 수 없는 오류도 실행 중인 사용자 Codex action을 관찰 실패로
  중단시키지 않으며 diagnostic과 polling reconciliation으로 처리한다.

## 7. 데이터, 보안, 성능

- 새 DB migration과 persistent schema는 없다.
- rate limit은 기존 in-memory status snapshot과 client store를 사용한다.
- timeline은 원본 JSONL을 수정하지 않는다.
- user config는 codexmux가 읽지 않으며 CLI token은 server/bridge boundary 밖으로 보내지 않는다.
- JSONL read budget은 기존 256KB tail을 재사용하며 별도 directory scan을 추가하지 않는다.
- rich parser accumulator는 entry/field cap을 적용해 memory가 output 크기에 무한 비례하지
  않게 한다.
- hook endpoint는 session cookie 또는 CLI token뿐 아니라 tab capability/ownership까지
  검증한다.
- Web Push payload에는 rate limit, raw tool argument, path, hook payload를 추가하지 않는다.

## 8. 예상 변경 surface

### Server/domain

- `src/lib/codex-rate-limits.ts` 신규
- `src/lib/codex-jsonl-state.ts`
- `src/lib/status-manager.ts`
- `src/lib/codex-session-parser.ts`
- `src/lib/providers/codex/` 아래 session hook/launch compatibility helper 신규
- `src/lib/hook-settings.ts`
- `src/pages/api/status/hook.ts`
- layout tab create API 및 agent launch API
- Git branch/status API cache bypass

### Client/UI

- `src/types/timeline.ts`
- `src/components/features/timeline/` semantic item 신규/수정
- `src/components/features/timeline/timeline-view.tsx`
- `src/hooks/use-terminal.ts`
- `src/lib/clipboard.ts` 신규와 네 호출 surface
- `src/hooks/use-layout.ts`
- `src/hooks/use-agent-status.ts`와 Git query hooks
- 한국어/영어 locale message

### Docs

- `docs/STATUS.md`
- `docs/ADR.md` ADR-025
- `docs/TMUX.md`
- `docs/DATA-DIR.md`
- `docs/ARCHITECTURE-LOGIC.md`
- `docs/TESTING.md`
- operation handoff

## 9. 검증 계약

### Unit

- rate limit window alias, reset 형식, malformed, ordering, dedupe
- rate limit reset 전 projection, window별 stale, fresh observation 복구
- rich event별 parse, deterministic ID, incremental split, duplicate end, truncation/redaction
- minimum Codex version, session hook serialization, schema preflight, secret-free error
- launch target ownership과 unsafe process 거부
- clipboard primary/fallback/cleanup/failure
- pane focus preservation
- Git dirty generation, active immediate/inactive deferred refresh, force cache bypass와
  duplicate stop suppression

### Browser

- pending message spacer가 background/resume/resize 후 정상 수축
- rich item expand/collapse, keyboard focus, light/dark, ko/en
- clipboard fallback toast
- pane close 후 남은 active tab 유지

### Integration smoke

- IME composition과 Alt key decision helper가 중복 입력을 만들지 않음
- secure clipboard와 fallback cleanup 동작
- native layer serialization과 current Codex strict-config parser 통과
- Node hook bridge가 `sh`, `curl`, `tmux` 없이 event를 전달함
- server 중단/token read failure/timeout에서 Codex prompt와 stop이 계속 진행되고 status가
  polling으로 복구됨
- Stop 직후 Git branch/status가 즉시 갱신됨

### Required commands

```bash
corepack pnpm test
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
corepack pnpm build:electron
```

실제 Codex `--strict-config` hook 검증과 full automated gate를 완료 조건으로 둔다.

## 10. 구현 순서와 rollback

1. pure rate-limit parser + StatusManager publication
2. rich parser types와 tests
3. rich timeline UI
4. 다섯 terminal/input regression
5. native session hook + server-side launch intent
6. Node hook bridge + ownership validation
7. docs/ADR, full suite, Electron/integration smoke

각 단계는 기존 generic/fallback 경계를 유지한다. rich entry parser는 unknown event를 generic
entry로 되돌릴 수 있고, JSONL rate limit producer 실패 시 기존 statusline file producer가
남는다. hook compatibility preflight 실패는 silent fallback하지 않고 agent launch를
중단한다. User hook discovery와 malformed config 처리는 Codex CLI에 맡긴다.

## 11. 승인 gate

이 문서가 승인되면 다음 lifecycle을 진행한다.

1. 이 설계를 기준으로 domain-architecture 결과를 고정한다.
2. `grill-me` 방식으로 위험 가정을 한 번에 한 질문씩 검토한다.
3. plan design review 후 구현 plan을 작성한다.
4. plan engineering review를 통과한 뒤에만 코드를 수정한다.

Grill Q1에서 user hook 수동 병합을 폐기하고 Codex `0.144.1+` native layer discovery를
사용하기로 승인했다. 이후 grill 결정도 같은 기록 문서에서 추적한다.

## 12. Plan design review

**결과:** 통과. Design-blocking issue 0개.

### 검토 결과

- Rich timeline은 delta별 row를 만들지 않고 tool/event identity별 한 row로 coalesce한다.
  기본 summary는 compact하게 유지하고 bounded details가 있을 때만 expand control을 둔다.
- Full raw output과 local image를 제외해 timeline이 새로운 file/data exfiltration surface가
  되지 않는다.
- Rate limit은 stale 값을 0%로 가장하지 않고 window별 `갱신 대기`를 표시한다. 현재
  hardcoded English tooltip도 ko/en message로 이동한다.
- Hook compatibility/preflight 오류는 agent 시작 surface에 actionable message로 표시하되
  hook delivery 실패는 Codex 작업을 방해하는 toast loop를 만들지 않는다. Operator 진단은
  health/log에 둔다.
- IME/clipboard/pane/spacer fix는 기존 terminal layout을 재설계하지 않으며 keyboard,
  focus-visible, mobile touch contract를 유지한다.
- Git refresh는 보이는 tab만 즉시 fetch하고 inactive tab은 dirty 상태만 남겨 background
  activity를 제한한다.

### Refero quality gate

- Primary reference lock: 현재 codexmux timeline/sidebar/terminal density 유지
- Secondary reference lock: Purplemux event hierarchy/collapsed details만 차용
- Typography/color/spacing: 기존 token과 semantic status color만 사용
- Responsive/accessibility: keyboard expand, screen-reader label, 44px mobile target,
  reduced-motion 호환을 plan acceptance에 포함
- Generic dashboard/marketing layout 또는 decorative card 추가 없음

## 13. Spec Freeze Snapshot

- **Approved scope:** Codex rate-limit producer, rich timeline, 다섯 terminal/input 회귀,
  Codex native hook coexistence와 cross-platform bridge
- **Canonical terms:** Codex rate-limit observation, rate-limit publication, rich timeline
  projection, Codex session hook, agent launch intent, terminal compatibility fix
- **Architecture:** pure JSONL parsers; StatusManager/Status Worker effect ownership; existing
  deterministic timeline ID/offset ownership; server-side launch intent; Node status bridge;
  current approval API/audit 유지
- **Hook decision:** Codex `0.144.1+` native layer discovery 사용. User config 수동 parse/merge
  금지. User/project/managed/plugin/codexmux hook은 손실·중복 없이 공존해야 함
- **Timeline data boundary:** 4KiB/field, 16KiB/entry bounded/redacted preview만 client 전송.
  Full raw output/download와 local image는 비목표
- **Rate-limit freshness:** reset 전 last observation/projection, reset 후 새 observation이
  없으면 window별 `갱신 대기`; 0% roll-forward 금지
- **Hook failure:** best-effort observation. Delivery failure가 Codex action을 차단하지 않으며
  health/log + JSONL/process reconciliation로 복구
- **Git refresh:** stop 시 matching cache invalidate, active 즉시 fetch, inactive 선택 시 fetch,
  sequence dedupe
- **Security:** user Codex config read/write 없음; CLI token/hook payload/raw output 미노출;
  tab capability/ownership 검증; approval path 우회 없음
- **Non-goals:** Purplemux merge, Claude provider, macOS/Linux service 확대, local image serving,
  full output, 비선택 회귀, Windows service host 구현
- **Environment:** target Windows Electron/Node, Microsoft IME, NTFS; development Linux;
  Chromium/Electron; Codex CLI minimum `0.144.1`; pnpm `10.32.1`
- **Required docs:** `docs/STATUS.md`, ADR-025, `docs/TMUX.md`, `docs/DATA-DIR.md`,
  `docs/ARCHITECTURE-LOGIC.md`, `docs/TESTING.md`, operation handoff
- **Verification gate:** full unit/type/lint/build/Electron, strict-config, Runtime v2, browser
  smoke와 실제 service restart
- **Open design decisions:** 없음
- **Residual risk:** Codex JSONL/hook schema drift, platform-specific hook command execution,
  incomplete heuristic redaction, browser lifecycle timing은 fixture/platform smoke로 방어
