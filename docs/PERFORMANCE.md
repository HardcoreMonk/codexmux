# 성능 최적화 후속 작업

작성일: 2026-04-30

## 배경

Rust + Tauri 도입은 `docs/TAURI-EVALUATION.md` 기준으로 보류한다. Tauri는 Electron shell 경량화에는 후보가 될 수 있지만, codexmux의 실제 성능 병목은 desktop shell보다 Node server, WebSocket, tmux, Codex JSONL, React render 경로에 있을 가능성이 높다.

따라서 후속 성능 최적화는 다음 원칙으로 진행한다.

- 먼저 계측한다.
- 병목이 확인된 경로만 좁게 고친다.
- terminal/input/reconnect 안정성을 시각 최적화보다 우선한다.
- Rust rewrite, Tauri 전환, 대규모 상태 store 재작성은 현재 단계에서 피한다.

## 1차 목표

1차 목표는 체감 성능과 운영 관측성을 같이 개선하는 것이다.

| 목표 | 기준 |
| --- | --- |
| 긴 Codex 대화에서 UI 멈춤 감소 | timeline render와 JSONL append 처리 비용을 줄인다 |
| 모바일 foreground 복귀 안정성 유지 | reconnect 중 중복 출력과 stale socket을 계속 차단한다 |
| server memory/CPU 원인 추적 | event loop, heap, ws, watcher, polling 지표를 확인할 수 있게 한다 |
| 큰 workspace 초기 화면 비용 감소 | diff/stats/history는 필요할 때 lazy load/cache한다 |

## 우선순위

| 순위 | 작업 | 기대 효과 | 리스크 |
| --- | --- | --- | --- |
| 1 | perf snapshot API/로그 추가 | 병목 판단 기준 확보 | 민감 정보 노출 주의 |
| 2 | timeline render virtualization | 긴 대화 DOM/render 비용 감소 | scroll anchoring 회귀 |
| 3 | JSONL incremental parser/cache | reconnect/reload 시 재파싱 감소 | cache invalidation 오류 |
| 4 | status polling adaptive scheduling | inactive tab process scan 비용 감소 | 상태/알림 지연 |
| 5 | WebSocket output batching/backpressure | burst 출력 시 UI freeze 완화 | terminal 실시간성 저하 |
| 6 | diff/stats lazy load/cache | 큰 repo 초기 load 비용 감소 | stale 데이터 표시 |
| 7 | Zustand selector/memo 점검 | workspace/sidebar re-render 감소 | 과도한 memo로 복잡도 증가 |

## 계측 항목

성능 개선 전 다음 값을 먼저 볼 수 있어야 한다.

| 항목 | 위치 | 목적 |
| --- | --- | --- |
| Node RSS/heap/external | server process | memory pressure 원인 분리 |
| event loop lag | server process | CPU stall, sync 작업 감지 |
| WebSocket 연결 수 | terminal/status/timeline/sync | zombie connection과 fanout 비용 확인 |
| active workspace/tab/pane 수 | workspace/layout store | UI/state 규모 파악 |
| JSONL watcher 수 | timeline server state | watcher 누수 여부 확인 |
| JSONL parse 시간/entry 수 | parser/timeline server | 긴 transcript 비용 확인 |
| status polling duration | StatusManager | process scan 비용 확인 |
| terminal stdout batch 크기/빈도 | terminal server/client | burst 출력과 render 비용 확인 |
| diff/stat 계산 시간 | git/diff API | 큰 repo 초기 load 비용 확인 |

### 구현 후보

- `/api/debug/perf` 또는 관리자 전용 endpoint
- `LOG_LEVELS=perf=debug,status=debug,tmux=trace` 샘플링 로그
- production에서는 auth 필수, 민감 경로와 prompt 본문은 출력하지 않는다

### 2026-04-30 1차 구현 상태

- `/api/debug/perf`를 추가했다. 기존 `src/proxy.ts` matcher를 통과하므로 session cookie 또는 CLI token 인증이 필요하다.
- `src/lib/perf-metrics.ts`가 process memory, uptime, event loop delay, event loop utilization, duration/counter를 `globalThis.__ptPerfStore`에 집계한다.
- snapshot은 service별 숫자만 반환한다. session id, cwd, JSONL path, prompt, assistant text, terminal output 본문은 포함하지 않는다.
- StatusManager는 마지막 poll duration, workspace/tab/pane count, provider/terminal tab count, broadcast count, client/backpressure count를 기록한다.
- Timeline server는 tail read, incremental parse, process-file-change duration과 entry count를 기록하고, 같은 JSONL file size/mtime/maxEntries의 초기 tail snapshot을 watcher 안에서 재사용한다.
- Terminal server는 connection/session count, paused/throttle/buffer 상태, stdout message/byte count, backpressure pause/resume count를 기록한다.
- Sync server는 client/buffer 상태와 broadcast/backpressure skip count를 기록한다.
- Client timeline append는 `requestAnimationFrame` 단위로 batch merge해 WebSocket append burst가 React render를 과도하게 쪼개지 않도록 했다.

### 2026-04-30 2차 구현 상태

- Timeline row wrapper와 entry renderer를 memo 처리했다. append 시 기존 assistant markdown, tool group, plan/prompt row가 같은 entry object를 유지하면 다시 렌더링하지 않는다.
- `groupTimelineEntries`가 grouped items와 마지막 user message id를 한 pass에서 계산한다. 기존 `findLast` 추가 순회를 제거하면서 anchor 대상은 top-level user message로 유지한다.
- Diff API는 같은 `cwd + diff hash`의 full diff/untracked diff를 짧은 TTL의 server memory cache로 재사용한다. 반복 remount/refresh에서 대량 untracked 파일 재읽기를 줄인다.
- Diff panel은 browser hidden 상태에서 10초 hash polling을 건너뛴다. visible 복귀 시 기존 visibility handler가 즉시 다시 확인한다.
- Stats cache는 cold start에서 여러 stats endpoint가 동시에 `getStatsCache()`를 호출해도 하나의 in-flight build promise를 공유한다.
- `/api/stats/cache-status`는 stats cache file이 이미 있으면 JSONL 전체 파일 수 scan을 생략한다. 파일 수는 초기 cache 생성 안내용으로만 계산한다.
- StatusManager adaptive scheduling은 보류했다. `unknown` 복구, `needs-input`, `ready-for-review`, notification 보정과 엮인 경로라 snapshot 수치가 쌓인 뒤 별도 정책으로 진행한다.

### 2026-05-01 3차 구현 상태

- Timeline grouped row wrapper에 `content-visibility: auto`와 `contain-intrinsic-size`를 적용했다. DOM row를 제거하지 않으므로 stable entry id, load-more, append dedupe는 그대로 유지하면서 offscreen paint/layout 비용만 줄인다.
- Scroll anchor 측정 대상인 마지막 user message row에는 `content-visibility`를 적용하지 않는다. anchor `offsetHeight` 측정과 busy 완료 후 spacer shrink 안정성을 우선한다.
- `/api/debug/perf` unit smoke test를 추가했다. GET snapshot shape, `Cache-Control: no-store`, unsupported method 405, `cwd`/`jsonlPath`/prompt/terminal output 계열 key 미노출을 확인한다.

### 2026-05-01 4차 구현 상태

- Terminal stdout은 일반 burst 구간에서 8ms 또는 64KiB 중 먼저 도달한 조건으로 coalescing한 뒤 WebSocket에 쓴다. stdin, web stdin, resize, heartbeat, kill session message는 기존 protocol 그대로 즉시 처리한다.
- Resize/initial reflow throttle은 유지하되 throttle flush 결과도 같은 stdout buffer를 거친다. pending output은 session exit/cleanup/shutdown 직전에 manual flush해서 마지막 출력 손실을 줄인다.
- `/api/debug/perf` runtime counters는 `terminal.stdout.raw_chunks/raw_bytes`, `terminal.stdout.messages/bytes`, `terminal.stdout.coalesced_*`, `terminal.stdout.max_buffer_flushes`를 노출한다. terminal service snapshot은 `stdoutBufferBytes`와 `stdoutPendingFlushes`를 노출한다.
- `src/lib/terminal-output-buffer.ts`에 순수 buffering helper와 unit test를 추가했다.

## 작업 상세

### 1. Perf Snapshot

서버가 현재 상태를 한 번에 반환하는 snapshot을 제공한다.

포함 후보:

- `process.memoryUsage()`
- event loop delay percentile 또는 최근 max
- uptime
- workspace/tab/session counts
- WebSocket connection counts
- active JSONL watcher counts
- 최근 status polling duration
- 최근 timeline parse duration

주의:

- session id, cwd, JSONL path는 필요하면 hash 또는 basename만 노출한다.
- prompt, assistant message, terminal 출력 내용은 포함하지 않는다.

### 2. Timeline Virtualization

긴 Codex timeline은 DOM node와 markdown/code 렌더 비용이 커질 수 있다.

검토 기준:

- visible range만 렌더링한다.
- 현재 진행 중인 row와 bottom stickiness를 유지한다.
- load-more와 stable entry id를 유지한다.
- reconnect 중 init/append overlap dedupe가 깨지지 않아야 한다.

검증:

- 긴 JSONL fixture에서 scroll 상단/중간/하단 이동
- assistant message, tool call, permission prompt, reasoning summary 표시
- foreground 복귀 후 중복 message 없음

### 3. JSONL Incremental Parser/Cache

현재 timeline과 status가 같은 JSONL을 여러 경로에서 볼 수 있다. `jsonlPath + size + mtime` 또는 offset 기준 cache를 둔다.

검토 기준:

- 같은 파일 같은 offset은 재파싱하지 않는다.
- append는 새 byte range만 읽는다.
- 파일 truncate/rotate/session change는 cache를 버린다.
- parser 결과에는 stable entry id가 유지된다.

주의:

- cwd만으로 최신 JSONL을 고르는 일반 fallback은 금지한다.
- live Codex process가 확인된 `detectActiveCodexSession`에서만 cwd fallback을 허용한다.

### 4. Adaptive Status Polling

모든 tab을 같은 주기로 scan하면 workspace/tab 수가 늘 때 비용이 커진다.

정책 후보:

| 상태 | 주기 |
| --- | --- |
| active workspace + running Codex | 빠름 |
| active workspace + idle shell | 보통 |
| background workspace | 느림 |
| recently completed/review pending | 보통, dedupe 유지 |
| no pane/process metadata | 느림 |

주의:

- `needs-input`, `ready-for-review` 알림 지연이 과도하면 안 된다.
- 서버 재시작 후 `unknown` 복구는 별도 upper bound를 둔다.

### 5. WebSocket Batching/Backpressure

terminal/timeline burst는 client render를 압박할 수 있다.

검토 기준:

- terminal stdout은 너무 잘게 flush하지 않는다.
- timeline append는 짧은 debounce 또는 frame 단위 merge를 검토한다.
- client가 background 상태이면 불필요한 render를 줄이고 foreground 복귀 때 sync한다.

주의:

- interactive terminal 입력 echo 지연은 최소화한다.
- `Ctrl+D` EOF, resize, kill session message는 지연시키지 않는다.

### 6. Diff/Stats Lazy Load

Git diff와 usage stats는 큰 repo에서 비용이 크다.

정책 후보:

- active panel 진입 시 계산
- 큰 untracked/diff는 기존 제한 유지
- cache key는 repo cwd, git HEAD/index mtime, file size/mtime를 조합
- 오래 걸리면 timeout과 partial result를 명확히 표시

## 피해야 할 작업

| 작업 | 보류 이유 |
| --- | --- |
| Rust server rewrite | 기능 회귀와 재작성 범위가 큼 |
| Tauri 전환 | 현재 병목이 shell이 아닐 가능성이 높음 |
| polling interval 일괄 확대 | 상태 정확도와 알림 지연을 깨뜨릴 수 있음 |
| Zustand store 대규모 재작성 | 좁은 re-render 병목이 확인되기 전에는 위험 |
| terminal protocol 변경 | 입력/reconnect 안정성에 직접 영향 |

## 검증 기준

각 성능 작업은 다음을 확인한다.

- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- 관련 unit test
- 긴 JSONL/timeline 수동 smoke
- terminal 입력, paste, resize, `Ctrl+D` EOF
- mobile foreground 복귀 후 terminal/status/timeline/sync 재연결
- message 중복 출력 없음

## 의사결정 메모

현 단계의 1차 작업은 완료됐다.

1. perf snapshot API
2. low-risk timeline append batching
3. JSONL tail snapshot cache

다음 단계는 `/api/debug/perf` snapshot으로 실제 병목을 확인한 뒤 진행한다. 수치 없이 full virtualization, adaptive polling, terminal protocol 변경을 먼저 키우지 않는다.

2차 작업은 full virtualization 대신 저위험 render memo/cache를 먼저 적용했다. 3차 작업은 같은 원칙으로 `content-visibility`를 먼저 검증했다. 다음 단계 후보는 snapshot과 수동 smoke에서 긴 timeline 문제가 계속 확인될 때 작은 windowed render를 별도 feature로 검증하는 것이다.

4차 작업은 terminal protocol 자체를 바꾸지 않고 server stdout flush만 짧게 coalescing했다. 다음 단계에서 terminal 관련 병목을 판단할 때는 raw chunk 대비 sent message 감소율, max-buffer flush 빈도, browser 입력 지연 smoke를 같이 본다.
