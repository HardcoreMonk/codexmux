# codexmux 후속 작업

이 문서는 Codex 전환 MVP 이후 남은 검수와 post-MVP 작업을 정리한다.

## 완료된 범위

- 서비스 정체성: `codexmux`, `cmux`, `~/.codexmux`, tmux socket `codexmux`.
- Codex provider: `codex`, `codex resume <sessionId>`, model/sandbox/approval/search option.
- Codex session detection: pane process tree 기반 `codex` 감지.
- Codex JSONL parser: timeline, session history, stats 입력 처리.
- usage stats: Codex JSONL 기반 cache와 cost 추정.
- daily report: `codex exec` 기반 report 생성.
- CLI/API: `x-cmux-token`, `CMUX_PORT`, `CMUX_TOKEN`, `codexmux`/`cmux` binary.
- Codex-only 모델: `codex` panel type과 `agent*` metadata 유지.
- 한국어/영어 locale만 유지하고 기본 locale을 한국어로 전환.
- Electron 개발/빌드 flow와 Android Capacitor shell 추가.
- Android 런처: 저장 서버, 최근 서버, 기본 Tailscale 서버 자동 연결, 실패 복구, 앱 정보 표시, 앱 재시작.
- Android 연결 방어: `/api/health` probe, timeout/network/HTTP/SSL 실패 복구, CORS header.
- Release automation: `release:patch|minor|major`로 version bump, 검증, release commit/tag/push를 묶고, `deploy:local`로 build/service restart/health 확인을 수행.
- 모바일 UI: Android 런처와 모바일 sheet/header/tab bar의 터치/focus 상태 정리.
- 모바일 앱 정보: 서버 접속 후 mobile navigation에서 Android 앱 versionName/versionCode, package, device, Android version, 서버 버전 확인과 WebView/Activity 재시작 제공.
- 알림 설정: 작업 완료 toast, system notification, 완료 사운드 on/off.
- status 로직 1차 모듈화: state reducer, session mapping, notification policy, metadata merge 분리.
- timeline 로직 1차 모듈화: shared server state, stable entry id, dedupe, init/append/load-more merge 분리.
- provider contract 테스트 강화: Codex provider API shape, panel/process mapping, stable parser id 검증.
- DIFF 패널 안정화: 대량 tracked/untracked diff 제한, binary/대용량 placeholder, client timeout, 기본 접힘 렌더링 적용.
- 성능 1차/2차/3차/4차/5차/6차/7차/8차: 인증된 `/api/debug/perf` snapshot, timeline append batching/row memo/content-visibility, terminal stdout coalescing, JSONL tail snapshot cache, DIFF full response short cache, stats in-flight cache build dedupe, Windows companion hot scan/full scan 분리, timeline message count streaming, session index unchanged persist skip, session list page mapping 적용.
- 터미널 제어 입력: xterm, Codex web input, 모바일 surface에서 `Ctrl+D`를 Codex CLI/shell EOF로 전달하고 pane 분할 단축키 충돌 제거.
- 워크스페이스 이름 변경: desktop 더블클릭/컨텍스트 메뉴, header shortcut, 모바일 header/navigation sheet 편집 경로 정리.
- Codex session detection: JSONL 지연 생성에 대비해 process start time 허용치를 확장하고 live process 확인 후 cwd fallback 보정 적용.
- 모바일 foreground reconnect: Android WebView/iPad Safari 복귀 시 terminal/status/timeline/sync WebSocket 강제 재연결과 workspace/layout 재동기화 적용.
- runtime v2 terminal 복구: Terminal Worker/service restart는 retryable close로 fresh attach를 유도하고, `session-not-found` restart는 runtime v2 Supervisor가 같은 tab id/session name을 재생성한다. 모바일/desktop 복구 overlay가 우상단 reconnect 버튼을 가리는 중복 UI는 숨긴다.
- 모바일 CODEX 확인 화면: timeline 연결 전에도 terminal preview로 실제 tmux/Codex 출력을 확인할 수 있게 처리.
- Linux 운영: `systemd --user` 서비스 등록, linger 설정, `HOST=localhost,tailscale,192.168.0.0/16`/`PORT=8122` 운영 문서화.
- Windows Codex sync 운영: health check, token file, dry-run scan summary, source/sourceId filter, remote source summary, 현재 사용자 Scheduled Task wrapper 문서화.
- permission prompt smoke 자동화: 임시 server/HOME/tmux tab에서 `needs-input` push, option parsing, stdin 선택, ack 이후 `busy` 복귀 검증.

## 릴리스 전 확인

### 2026-05-03 live smoke snapshot

2026-05-03 P0/P1 자동화 pass 기준 live 배포와 smoke 결과:

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| live deploy/systemd | 통과 | `deploy:local`, `/api/health` `version=0.3.3`, service `ActiveState=active`, `WorkingDirectory=/data/projects/codex-zone/codexmux`, journal restart 이후 오류 없음 |
| build/type/unit | 통과 | `corepack pnpm test` 73 files / 385 tests, `tsc --noEmit`, `lint`, `build`, `deploy:local` build |
| browser UI tooling | 통과 | `@playwright/test` 1.59.1 dev dependency, `corepack pnpm exec playwright install chromium`, headless Chromium launch smoke |
| Electron build/attach/runtime v2/package | 통과 | `corepack pnpm build:electron`, `corepack pnpm smoke:electron:attach`, `corepack pnpm smoke:electron:runtime-v2`, initial + 2회 page reload/reconnect `/api/v2/terminal` marker output, Mac M1 `pnpm pack:electron:dev`, arm64/x64 DMG/zip 생성, native binding/arch/Info.plist/`hdiutil verify` 통과 |
| runtime v2 phase2 gate | 통과 | `corepack pnpm smoke:runtime-v2:phase2` browser reload/server restart/mode-off rollback, Electron page-context `/api/v2/terminal` cookie-auth attach/output/reconnect |
| Android debug install | 통과 | `versionName=0.3.3`, `versionCode=303`, `MainActivity` |
| Android Tailscale failure recovery | 통과 | `corepack pnpm smoke:android:recovery`, network/HTTP 4xx/SSL 실패 후 launcher 복귀와 `/login` 재연결, blocking console/logcat 0 |
| Android foreground reconnect | 통과 | `corepack pnpm smoke:android:foreground`, 2회 background/foreground, `triggerEvent`/TypeError 0, blocking console/logcat 0 |
| Android runtime v2 foreground | 통과 | `corepack pnpm smoke:android:runtime-v2`, SM-S928N Android 16, temp runtime v2 server, initial + 2회 foreground `/api/v2/terminal` marker output, blocking console/logcat 0 |
| Android app info/restart | 통과 | `CODEXMUX_ANDROID_FOREGROUND_ROUNDS=0 CODEXMUX_ANDROID_RESTART_APP=1 corepack pnpm smoke:android:foreground`, native restart 후 `/login`, console 0/logcat 0 |
| Android 60초 background | 통과 | `CODEXMUX_ANDROID_BACKGROUND_MS=60000 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground`, `/login` surface, console 0/logcat 0 |
| Android first-run launcher | 통과 | `CODEXMUX_ANDROID_CLEAR_APP_DATA=1 CODEXMUX_ANDROID_FOREGROUND_ROUNDS=1 corepack pnpm smoke:android:foreground`, `/login` 첫 실행 console 0/logcat 0 |
| stats/daily report | 통과 | stats overview/list 200, `2026-05-03` daily report generate 200 |
| Windows sync | 부분 통과 | Linux에서 live server 대상 dry-run 통과; 실제 Windows Scheduled Task smoke는 남음 |
| permission prompt | 통과 | `corepack pnpm smoke:permission`, 임시 server/HOME/tmux tab에서 `needs-input` push, option parsing, stdin 선택, ack 이후 `busy` 복귀 |
| 장시간 reconnect | 부분 통과 | foreground smoke는 통과; 수십 분 이상 background와 반복 reconnect는 남음 |

P0/P1/P2/P3 후속 상태:

- P0 완료: Android Tailscale Serve HTTPS 접속, failure recovery 반복, foreground reconnect, fresh app data clear first-run, app info bridge 확인, login route console noise 제거, permission prompt status/tmux E2E smoke 자동화.
- P0 남음: 자동 개발로 처리 가능한 code/runtime blocking 항목은 없음. 실제 기기/OS가 필요한 장시간/외부 smoke는 P1 운영 검증으로 남긴다.
- P1 완료: Android foreground/recovery/runtime v2 smoke, app info/native restart smoke, Electron attach/runtime v2 smoke, Electron packaged `.app` launch hook for smoke scripts, permission prompt smoke, package scripts.
- P1 남음: Android logged-in session 수십 분 background/reconnect와 input draft 보존, active terminal WebSocket settle 증거, 실제 Codex CLI permission prompt 재현 smoke, macOS packaged `.app` Finder 실행/Gatekeeper UX, 실제 Windows Scheduled Task smoke, iPad Safari/Home Screen smoke.
- P2 남음: packaged Electron foreground/reconnect를 Mac 화면 세션에서 evidence로 보존, runtime v2 timeline/status/storage parity surface별 cutover evidence, release workflow/CI에서 선택 실행할 Android/Electron smoke artifact 보존.
- P3 남음: Android release signing/AAB 운영, approval queue, lifecycle control UI, perf tuning.

1. 장시간 Codex smoke test: 새 tab 생성, prompt 실행, tool call과 reasoning summary 표시, 상태 전이 확인.
2. permission prompt smoke test: `corepack pnpm smoke:permission`으로 pane capture 기반 option parsing, inline prompt 선택, stdin 전달, `needs-input` push와 ack 후 `busy` 복귀 확인. 실제 Codex CLI permission prompt 재현은 P1 수동/기기 smoke로 남긴다.
3. stats smoke test: `/api/stats/*` endpoint와 실제 `~/.codex/sessions` 집계 확인.
4. daily report smoke test: `codex exec` 성공/실패, cache 재사용 확인.
5. macOS packaging: `corepack pnpm build:electron`, `corepack pnpm pack:electron:dev`.
6. Android packaging: `corepack pnpm android:build:debug`, `corepack pnpm android:install`, `corepack pnpm smoke:android:install`로 package install state 확인. 현재 `0.3.3` 기준 `versionName=0.3.3`, `versionCode=303`이어야 한다.
7. 모바일 reconnect smoke test: Android WebView는 `smoke:android:foreground`로 반복 확인한다. iPad Safari와 입력 draft 보존, timeline 중복 출력 방지는 별도 수동 smoke로 남긴다.
8. Android Tailscale 실패 smoke test: `smoke:android:recovery`가 network/HTTP 4xx/SSL을 자동 확인한다. 실제 Tailscale 미연결과 서버 장시간 중지는 별도 수동 smoke로 남긴다.
9. Android app info/restart smoke test: launcher와 server 접속 후 mobile navigation에서 앱 정보가 표시되고 앱 재시작 버튼이 WebView/Activity를 다시 여는지 확인.
10. DIFF smoke test: tracked 변경 20개 이상, untracked 50개 초과, binary/대용량 파일이 있는 저장소에서 응답 시간, 생략 안내, 기본 접힘 렌더링 확인.
11. systemd smoke test: `corepack pnpm deploy:local`, `/api/health`의 version/commit/buildTime, `journalctl --user -u codexmux.service` 확인.
12. timeline 배포 smoke test: browser reload 후 같은 assistant 문장이 `event_msg.agent_message`와 `response_item.message` pair로 남은 JSONL에서도 한 번만 표시되는지 확인.
13. Codex attach smoke test: Codex process 시작 후 JSONL이 늦게 생성된 session도 session id/jsonlPath가 붙고, 모바일 CODEX `check` 화면에서 terminal preview가 보이는지 확인.
14. perf snapshot smoke test: 인증된 요청으로 `/api/debug/perf`가 process/event loop/WebSocket/watcher/status poll/diff/stats counter를 반환하고, prompt/cwd/JSONL path/terminal output 본문을 노출하지 않는지 확인.
15. 설치/upgrade: `npx codexmux`, global install, 기존 `~/.codexmux` 유지 확인.
16. release metadata: `corepack pnpm release:patch|minor|major`, changelog, release workflow artifact 확인.
17. Windows sync smoke test: Windows에서 Scheduled Task `Install -RunNow`, `Status`, `RunOnce` dry-run, source filter, remote source summary, 오래된 date dir full scan 동작 확인.
18. Runtime v2 cutover readiness: `docs/RUNTIME-V2-CUTOVER.md`와 `docs/RUNTIME-V2-PARITY.md`의 phase gate, rollback flag, temp HOME/DB smoke를 release candidate commit 기준으로 확인한다. Phase 2 terminal gate는 `corepack pnpm smoke:runtime-v2:phase2`로 browser reload/server restart/mode-off rollback을 먼저 통과시킨 뒤 `corepack pnpm smoke:electron:runtime-v2`와 `corepack pnpm smoke:android:runtime-v2`의 page-context attach/output/reconnect, systemd 검증 증거를 추가한다. packaged Electron은 `CODEXMUX_ELECTRON_APP_PATH=<release/.../codexmux.app> CODEXMUX_ELECTRON_WINDOW_FOREGROUND_CYCLES=1 corepack pnpm smoke:electron:runtime-v2`로 CLI smoke를 먼저 통과시키고, Finder/Gatekeeper UX는 Mac 화면 세션 smoke로 별도 확인한다.
19. Browser reconnect DOM smoke: Playwright Chromium으로 `session-not-found` 복구 overlay와 floating reconnect control 중복 렌더링이 없는지 실제 pointer 동작까지 확인하는 e2e spec을 추가한다.

## Post-MVP 백로그

### Codex lifecycle

- fork/sub-agent 관계를 UI에 표시.
- `codex resume` 실패 원인 분류.
- Codex CLI 버전별 JSONL fixture 추가.
- `~/.codex/state_*.sqlite` read-only indexer 검토.
- stable timeline id가 provider별 record identity에 맞게 확장되는지 fixture로 검증.

### Approval workflow

- 모든 tab의 pending approval을 모아 보는 queue.
- command/file/permission approval 종류별 UI 구분.
- 모바일 push에서 approval target으로 deep link.
- pane capture 실패 시 terminal fallback 안내 개선.

### App-server adapter

- Codex app-server protocol 안정화 여부 확인.
- 안정화되면 provider adapter로 추가.
- 신뢰 가능한 approval/status event만 단계적으로 사용.
- tmux path는 fallback으로 유지.

### Mobile app

- Android release signing과 AAB 배포 절차를 실제 release workflow에 연결.
- 모바일 WebView에서 장시간 reconnect, push click, input draft 보존을 반복 검증.
- iPad는 Safari + 홈 화면 추가를 기본 지원 경로로 유지한다.
- iOS native shell이 필요하면 Capacitor iOS project와 Xcode signing/deploy flow를 별도 검토.

### Architecture modularization

- `timeline-server.ts`는 1차로 shared state를 분리했다. 다음 단계에서는 subscription service, file watcher service, resume service를 별도 파일로 더 나눈다.
- `status-manager.ts`는 순수 정책 helper를 분리했다. 다음 단계에서는 Web Push/history side effect adapter를 분리한다.
- provider를 추가할 때는 `IAgentProvider` contract test와 JSONL fixture를 먼저 추가한다.
- runtime v2 production 전환은 `docs/RUNTIME-V2-CUTOVER.md`의 surface별 flag와 rollback gate를 따른다. terminal, storage, timeline, status를 한 release에서 동시에 기본값으로 전환하지 않는다.
- runtime v2 parity는 `docs/RUNTIME-V2-PARITY.md`의 surface row별 owner, migration, test, rollback을 먼저 채운 뒤 surface mode를 바꾼다.

### Performance

- `/api/debug/perf` snapshot을 배포 환경에서 수집해 timeline render, status poll, diff, stats 중 실제 병목을 먼저 확인한다.
- timeline virtualization은 scroll anchor/load-more 회귀를 막기 위해 `content-visibility`를 먼저 적용했다. 다음 단계는 긴 대화 smoke와 snapshot 결과에 따라 작은 windowed render를 별도 검증한다.
- session meta message count는 전용 streaming helper로 분리했다. 다음 단계는 실제 긴 JSONL에서 `timeline.message_counts.read` duration과 cache hit 비율을 보고 추가 index화가 필요한지 판단한다.
- session index는 refresh 결과가 unchanged이면 persisted file write를 건너뛴다. 다음 단계는 `persistWrites`/`persistSkips` 비율과 `lastBuildMs`를 같이 보고 refresh interval 조정 필요성을 판단한다.
- session list request는 index에서 requested page만 변환한다. 다음 단계는 session list 체감 지연이 계속 보일 때 search/filter도 index 단계로 내리는지 판단한다.
- terminal stdout burst는 server에서 짧게 coalescing한다. 다음 단계는 `/api/debug/perf`의 raw chunk 대비 sent message 감소율과 입력 지연 smoke를 같이 보고 flush window 조정 여부를 결정한다.
- Windows companion은 전체 tree scan과 hot scan을 분리했다. 다음 단계는 Windows에서 실제 파일 수와 full scan latency를 확인한 뒤 watcher 기반 보강이 필요한지 판단한다.
- Windows Scheduled Task wrapper는 로그인 시 자동 실행과 로그/설정 파일 경로를 표준화했다. 다음 단계는 실제 Windows 장시간 실행에서 task restart result, log rotation 필요성, token file 권한을 확인한다.
- StatusManager adaptive scheduling은 `unknown`, `needs-input`, `ready-for-review` 지연을 측정한 뒤 active/background workspace 정책으로 분리한다.
- Runtime v2 shadow mode는 `/api/debug/perf`의 `services.runtimeWorkers` counters로 worker health, readiness, restart, timeout, command failure를 먼저 확인한다. payload, session id/name, cwd, JSONL path, prompt, assistant text, terminal output은 diagnostics에 넣지 않는다.

### 문서와 운영

- 문서는 한국어 원문을 기준으로 유지한다.
- Codex CLI option이 바뀌면 README, `docs/`, landing docs, settings copy를 함께 갱신한다.
- smoke test 결과는 release note 또는 `docs/`에 반영한다.

## 운영 메모

- `~/.codex`는 Codex CLI 소유이며 codexmux는 읽기 전용으로 접근한다.
- 새 기능은 Codex provider 또는 provider-neutral boundary에 추가한다.
- tmux/socket/session naming은 release 전 다시 바꾸지 않는다.
