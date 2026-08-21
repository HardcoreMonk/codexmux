# Backlog Status Report

Date: 2026-05-07 KST

## 기준

- 배포 버전: `0.4.7`
- 배포 commit: `923e9d6`
- 서비스 상태: `active/running`, `NRestarts=0`
- Health: `/api/health` returned `version=0.4.7`, `commit=923e9d6`
- iPad 확인: 사용자가 iPad에서 `0.4.7` 표시 확인
- 최신 hotfix: `9433f1b` panel timeline metadata 보존, `923e9d6` duplicate timeline session-changed suppression

## 상태 정의

| 상태 | 의미 |
| --- | --- |
| 완료 | 현재 코드/배포 기준 자동 검증 또는 명확한 운영 증거가 있음 |
| 대기 | 외부 기기, release window, 장시간 관찰, 수동 운영 window가 필요함 |
| 미완료 | 구현 또는 별도 spec이 아직 남아 있음 |

## 1-14 확인 결과

| 번호 | 항목 | 상태 | 근거 / 다음 조치 |
| ---: | --- | --- | --- |
| 1 | 장시간 Codex smoke | 대기 | 긴 prompt, tool call, reasoning summary, 상태 전이는 실제 장시간 세션 관찰 필요 |
| 2 | permission/input prompt smoke | 완료 | `corepack pnpm smoke:permission` 통과. `needs-input`, option parsing, stdin 선택, ack 후 `busy` 복귀 확인 |
| 3 | stats smoke | 완료 | `corepack pnpm ops:automation:batch` 통과. stats endpoint/perf counter evidence 수집 |
| 4 | daily report smoke | 완료 | `corepack pnpm ops:automation:batch`의 `stats-daily-report-smoke` coverage 통과 |
| 5 | macOS packaging | 대기 | Linux/Electron build 및 runtime smoke 증거는 있음. 실제 macOS `.app`/DMG/Finder/Gatekeeper UX는 macOS 화면 세션 필요 |
| 6 | Android packaging | 완료 | `0.4.7` 기준 Android release AAB 검증 이력 있음. 다음 RC에서는 `android:bundle:release`와 `smoke:android:release-aab` 재실행 |
| 7 | 모바일 reconnect smoke | 대기 | Android/PWA 자동 smoke 증거는 있음. iPad Home Screen 장시간 background/input draft는 실제 기기 장시간 관찰 필요 |
| 8 | Android Tailscale 실패 smoke | 완료 | 기존 `smoke:android:recovery` 기준 통과 이력 있음. 실제 Tailscale 미연결/서버 장시간 중지는 별도 운영 검증 |
| 9 | Android app info/restart smoke | 대기 | 기존 app info/restart smoke 증거는 있음. 현재 배포 commit 기준 실기기 재확인은 다음 Android window에서 수행 |
| 10 | DIFF smoke | 대기 | tracked 20+, untracked 50+, binary/large fixture repo 준비가 필요 |
| 11 | systemd smoke | 완료 | `codexmux.service` `active/running`, `NRestarts=0`, `/api/health` `commit=923e9d6` |
| 12 | timeline 배포 smoke | 완료 | `smoke:runtime-v2:timeline-websocket-default` 통과. init/append/runtime counters와 CODEX panel 전환 metadata 보존 회귀 확인 |
| 13 | Codex attach smoke | 완료 | `smoke:runtime-v2:timeline-session-changed` 통과. JSONL late create 후 session-changed/init 확인. 동일 JSONL path 중복 session-changed suppression은 `timeline-ws.test.ts`로 보강 |
| 14 | perf snapshot smoke | 완료 | `ops:automation:batch` 통과. `/api/debug/perf` triage 반환 및 민감정보 비노출 경로 확인 |

## 41-45 확인 결과

`ops:backlog:batch-plan` item row는 현재 40번까지라서, 41-45는 `REQUIRED_COVERAGE` 번호 기준으로 확인했다.

| 번호 | Coverage | 상태 | 근거 / 다음 조치 |
| ---: | --- | --- | --- |
| 41 | `session-search-index` | 미완료 | session list 체감 지연이 계속될 때 search/filter를 index 단계로 내리는 별도 perf/spec 필요 |
| 42 | `provider-fixtures` | 완료 | `tests/unit/lib/providers.test.ts` 통과. Codex fixture contract와 app-server fixture boundary 추가 |
| 43 | `stable-timeline-id` | 완료 | provider/timeline focused tests 통과. stable parser id, dedupe, merge 회귀 확인 |
| 44 | `fork-sub-agent-ui` | 완료 | 1차 read-only UI 완료. session list badge와 timeline metadata relation row 구현 및 component smoke 통과 |
| 45 | `codex-resume-failure-classification` | 미완료 | Codex CLI stderr, missing JSONL, cwd mismatch, permission prompt taxonomy 별도 spec 필요 |

## 실행한 자동 검증

| 명령 | 결과 | 핵심 확인 |
| --- | --- | --- |
| `corepack pnpm smoke:permission` | 통과 | permission/input prompt option parsing, stdin 선택, ack 복귀 |
| `corepack pnpm ops:automation:batch` | 통과 | release artifact workflow, perf triage, approval tests, lifecycle dry-run, browser/PWA/runtime smoke |
| `corepack pnpm smoke:runtime-v2:timeline-websocket-default` | 통과 | timeline default WebSocket init/append, runtime counters |
| `corepack pnpm smoke:runtime-v2:timeline-session-changed` | 통과 | delayed JSONL attach, session-changed, session init |
| `corepack pnpm vitest run tests/unit/lib/runtime/timeline-ws.test.ts tests/unit/hooks/use-layout-panel-type.test.ts tests/unit/hooks/use-tab-store.test.ts tests/unit/lib/session-list-rendering.test.ts` | 통과 | CODEX panel 전환과 duplicate session-changed 회귀 |
| `corepack pnpm smoke:browser-reconnect` | 통과 | session-not-found overlay, floating reconnect hidden, restart click path |
| focused provider/relationship/timeline tests | 통과 | 7 files / 33 tests |

## Perf 관찰

`ops:automation:batch`의 `/api/debug/perf.triage` 결과는 다음 병목 후보를 high로 표시했다.

| Category | Metric | Severity | Evidence |
| --- | --- | --- | --- |
| stats | `stats.session_parse.7d` | high | `lastMs=3437.36`, `count=1` |
| stats | `stats.cache.build` | high | `lastMs=1092.89`, `count=1` |
| runtime | `eventLoop.delay` | medium | `p99=21.71`, `max=311.95` |

다음 perf 작업은 stats/session parse cache reuse와 session-search-index spec을 우선 검토한다.

## 대기 항목

- 장시간 Codex 작업 smoke
- macOS packaged UX
- iPad/PWA 장시간 background와 input draft 보존
- Android 실기기 재확인 window
- 대량 DIFF fixture smoke
- Tailscale 실제 장애/서버 장시간 중지 운영 검증

## 미완료 항목

- `session-search-index` 설계/구현
- `codex-resume-failure-classification` taxonomy/spec
- parent/root session navigation shortcut
- Codex CLI 버전별 relationship fixture 확장

## 결론

현재 배포본 `0.4.7` / `923e9d6` 기준으로 자동 검증 가능한 핵심 경로는 통과했다. 남은 항목은
대부분 실기기/장시간/외부 운영 검증 또는 별도 spec이 필요한 작업이다.
