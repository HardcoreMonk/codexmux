# Purplemux 선택 기능 수동 도입 운영 handoff

> 일시: 2026-08-14 KST
> 검증 범위 현행화: 2026-08-15 KST
> 상태: 선택 도입 검증 완료
> Lifecycle: implement/verify 완료, package release 미요청
> ADR: ADR-025 `Verified`

## 결과

Purplemux의 선택 기능을 upstream merge 없이 codexmux의 Pages Router, Runtime v2,
tab/session ownership과 한국어/영어 계약에 맞춰 수동 구현했습니다.

| 범위 | 적용 결과 |
| --- | --- |
| Rate limit | 기존 256KiB JSONL tail에서 5시간/7일 관찰을 함께 추출하고 window별 newest merge. Reset 뒤 새 관찰이 없으면 `갱신 대기` |
| Rich timeline | Exec, web search, MCP, patch, error/warning, compaction semantic row. Secret-like redaction, field 4KiB, entry 16KiB 상한 |
| 회귀 수정 | IME, clipboard fallback, pane focus, timeline spacer 복구, Stop 기반 Git cache generation |
| Hook/launch | Browser launch intent, server ownership/preflight, native session hook coexistence, HMAC capability, standalone Node bridge |

Full output/download, local image serving, Claude provider, Purplemux 전체 동기화는 포함하지
않았습니다. User/project/managed/plugin hook은 Codex native layer discovery에 맡기며 사용자
TOML을 읽거나 병합하지 않습니다.

## 보안과 실패 의미

- Browser bundle에는 session hook command, capability, `status-hook.cjs` 경로가 없습니다.
- Hook API는 CLI token, HMAC tab/session/expiry, 현재 layout ownership을 모두 확인합니다.
- Bridge stdin은 64KiB, loopback request는 1초, process는 1.5초로 제한하고 항상 성공
  종료하므로 관찰 장애가 Codex action을 막지 않습니다.
- Electron executable은 `ELECTRON_RUN_AS_NODE=1`로 bridge를 실행합니다.
- 기존 JSONL/process polling과 generic timeline fallback은 유지됩니다.

## 검증 증거

| 검증 | 결과 |
| --- | --- |
| `corepack pnpm lint` | 통과 |
| `corepack pnpm tsc --noEmit` | 통과 |
| `corepack pnpm test` | 224 files 통과, 1 skip; 1,480 tests 통과, 3 skip |
| `corepack pnpm build` | 통과 |
| `corepack pnpm build:electron` | 통과 |
| `corepack pnpm smoke:codex-session-hooks` | Codex CLI 0.147.0 strict-config 통과 |
| `corepack pnpm smoke:runtime-v2:status-default` | 10 checks 통과 |
| `corepack pnpm smoke:runtime-v2:timeline-websocket-default` | 8 checks 통과 |
| `CODEXMUX_PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/google-chrome corepack pnpm smoke:browser-reconnect` | 4 checks 통과 |
| Browser static scan | session hook command/path/capability marker 없음 |
| `git diff --check` | 통과 |

첫 full unit 실행은 `better-sqlite3`가 ABI 137로 남아 있고 현재 service Node가 ABI 127이라
31개 storage test가 동일 원인으로 실패했습니다. `corepack pnpm rebuild better-sqlite3`로
Node 22 ABI를 맞춘 뒤 전체 suite가 통과했습니다. Ubuntu 26.04에서는 Playwright가 bundled
Chromium 설치를 지원하지 않아 system Google Chrome을 명시했고, smoke script가
`CODEXMUX_PLAYWRIGHT_EXECUTABLE_PATH`를 받을 수 있도록 갱신했습니다.

## 실서비스 재시작

최종 production/Electron build 뒤 다음 명령을 실제 실행했습니다.

```bash
systemctl --user restart codexmux.service
```

최종 상태:

- `ActiveState=active`, `SubState=running`, `Result=success`
- `MainPID=333111`, `NRestarts=0`, `ExecMainStatus=0`
- 시작 시각: 2026-08-14 21:19:27 KST
- Health: `codexmux 0.4.22`, build time `2026-08-14T12:19:22.357Z`
- `~/.codexmux/status-hook.cjs`: mode `0700`
- `~/.codexmux/hooks.json`, `port`: mode `0600`
- `hooks.json`은 `hooks: {}`와 기존 statusline 설정만 포함

첫 재시작 직후 접속 중이던 legacy runtime v1 tab 하나는 systemd
`KillMode=control-group`이 tmux child를 함께 종료해 `session not found` 경고가 한 번
발생했습니다. 서비스 자체는 정상 기동했고 최종 재시작 journal에는 warning/error가
없었습니다. Linux systemd/tmux는 legacy path이므로 이번 범위에서 unit의 KillMode를
변경하지 않았습니다. 해당 tab은 UI의 새 terminal 재시작 동작으로 복구할 수 있습니다.

Windows package 실기 검증은 2026-08-15 사용자 결정으로 이 선택 도입의 완료 조건에서
제외했습니다. 현재 문서에 기록된 automated gate와 실제 Linux service 재시작을 최종
verification evidence로 사용합니다.

## 2026-08-15 후속 자동화 보강

- Git branch/status hook의 consumed generation을 session별로 관리해 같은 hook instance가
  tab을 전환할 때 낮은 generation을 누락하지 않도록 했습니다. Inactive session은 선택될
  때 한 번만 force refresh하고 duplicate generation은 무시합니다.
- Rich timeline의 icon, label, summary, meta, status 결정을
  `rich-timeline-presentation.ts` pure helper로 분리하고 exec/web/MCP/patch/error/compaction
  projection을 unit test로 고정했습니다.
- 실제 생성되는 standalone `status-hook.cjs`를 임시 HOME에서 별도 Node process로 실행해
  loopback POST body/header, 64KiB stdin 상한, 원본 stdin 비전달, server 장애 시 성공 종료를
  integration test로 검증했습니다.
- 루트 lint가 로컬 Git worktree의 `.next` 생성물까지 탐색하지 않도록 `.worktrees/**`를
  ESLint build artifact ignore에 추가했고 전체 `corepack pnpm lint`를 통과했습니다.
- 최종 결과는 typecheck, 전체 ESLint, 224 files/1,480 tests 전체 unit suite,
  `build:electron`, `smoke:codex-session-hooks` 통과입니다. 이 후속 build는 활성 terminal을
  보호하기 위해 서비스에 자동 재시작 배포하지 않았습니다.

## 작업 트리

사용자 기존 변경인 `AGENTS.md`와 `memory/`는 수정하지 않았습니다. 요청하지 않은 issue,
commit, push, release는 수행하지 않았습니다.
