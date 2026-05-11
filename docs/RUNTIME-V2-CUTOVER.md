# 런타임 v2 프로덕션 전환 계획

Runtime v2는 terminal, storage, timeline, status를 worker boundary로 분리해 Windows-only runtime 전환을 가능하게 하는 기반입니다.

## 현재 상태

- Terminal Worker와 adapter factory가 존재합니다.
- Windows terminal adapter는 node-pty/ConPTY 기반 create/attach/write/resize/detach/kill smoke를 통과했습니다.
- Storage Worker는 SQLite projection을 사용합니다.
- Timeline Worker와 Status Worker는 surface별 mode와 rollback path를 가집니다.
- Phase 6 default gate와 Windows release gate smoke가 release 판단 기준으로 사용됩니다.

## 전환 규칙

- Public browser-facing URL은 가능한 유지합니다.
- Surface별 mode를 분리해 작은 rollback이 가능해야 합니다.
- 잘못된 명시 env 값은 fail closed해야 합니다.
- Runtime v2가 꺼져도 legacy JSON/tmux path가 rollback으로 동작해야 합니다.
- Windows-only 제품 전환 전까지 tmux path 삭제를 release blocker로 만들지 않습니다.

## 기능 플래그

| 환경 변수 | 값 | 의미 |
| --- | --- | --- |
| `CODEXMUX_RUNTIME_V2` | `1` | runtime v2 활성 |
| `CODEXMUX_RUNTIME_TERMINAL_V2_MODE` | `off`, `new-tabs` | terminal surface 전환 |
| `CODEXMUX_RUNTIME_STORAGE_V2_MODE` | `off`, `write`, `default` | storage surface 전환 |
| `CODEXMUX_RUNTIME_TIMELINE_V2_MODE` | `off`, `shadow`, `default` | timeline surface 전환 |
| `CODEXMUX_RUNTIME_STATUS_V2_MODE` | `off`, `shadow`, `default` | status surface 전환 |
| `CODEXMUX_RUNTIME_TERMINAL_ADAPTER` | `tmux`, `windows` | terminal infrastructure adapter |
| `CODEXMUX_PROCESS_INSPECTOR_ADAPTER` | `posix`, `windows` | process inspector adapter |

## 0단계: 동등성 목록화

목표는 기존 behavior surface를 표로 고정하는 것입니다.

- workspace/layout CRUD
- terminal create/attach/write/resize/detach/kill
- timeline session list, entries, live append
- status polling, prompt detection, notification
- sync invalidation
- rollback command

증거는 `RUNTIME-V2-PARITY.md`에 둡니다.

## 1단계: Shadow 런타임

Worker process와 typed IPC를 도입하되 production read/write path는 바꾸지 않습니다.

검증:

```bash
corepack pnpm test
corepack pnpm smoke:runtime-v2
```

## 2단계: 새 tab용 터미널 v2

새 plain terminal tab만 runtime v2로 생성합니다. 기존 legacy tab은 유지합니다.

검증:

```bash
corepack pnpm smoke:runtime-v2:phase2
corepack pnpm smoke:runtime-v2:terminal-windows
```

Rollback:

```text
CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off
```

## 3단계: Storage v2 shadow/default 전환

Legacy JSON write 뒤 SQLite projection을 mirror하고, default mode에서 SQLite read를 우선합니다.

검증:

```bash
corepack pnpm smoke:runtime-v2:storage-dry-run
corepack pnpm smoke:runtime-v2:storage-write
corepack pnpm smoke:runtime-v2:storage-default-read
```

Rollback:

```text
CODEXMUX_RUNTIME_STORAGE_V2_MODE=off
```

## 4단계: Timeline v2 WebSocket 전환

기존 `/api/timeline` URL을 유지하고 backend를 Timeline Worker로 전환합니다.

검증:

```bash
corepack pnpm smoke:runtime-v2:timeline-shadow
corepack pnpm smoke:runtime-v2:timeline-websocket-default
```

Rollback:

```text
CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off
```

## 5단계: Status v2 전환

Status Worker가 polling, JSONL watch, hook application, notification side effect를 소유합니다.

검증:

```bash
corepack pnpm smoke:runtime-v2:status-shadow
corepack pnpm smoke:runtime-v2:status-default
```

Rollback:

```text
CODEXMUX_RUNTIME_STATUS_V2_MODE=off
```

## 6단계: 기본 런타임 v2

`CODEXMUX_RUNTIME_V2=1`만 있어도 unset surface mode는 accepted default로 해석합니다.

검증:

```bash
corepack pnpm smoke:runtime-v2:phase6-default-gate
corepack pnpm smoke:windows:release-gate
```

Rollback dry-run:

```bash
corepack pnpm lifecycle:rollback-dry-run
```

이 명령은 파일을 변경하지 않고 `rollbackEnv`에 runtime v2 surface를 끄는 환경 값을
구조화해서 출력합니다. 실제 service 재시작과 live rollback evidence는 별도
운영 drill에서 남깁니다.

## Windows 전환 게이트

Windows-only 제품으로 release하려면 다음 smoke가 release blocker입니다.

```bash
corepack pnpm audit:windows-platform
corepack pnpm smoke:runtime-v2:terminal-windows
corepack pnpm smoke:windows:preflight
corepack pnpm smoke:windows:codex-session
corepack pnpm smoke:windows:service-host
corepack pnpm smoke:windows:host-diagnostics
corepack pnpm smoke:windows:electron-env
corepack pnpm smoke:windows:electron-packaging
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:installer-install
corepack pnpm smoke:windows:package-gate
```

## 릴리스 노트 체크리스트

- runtime v2 mode와 rollback env를 기록합니다.
- Windows package artifact 이름과 버전을 기록합니다.
- installer install smoke와 updater smoke 결과를 기록합니다.
- known blocker와 internal rollout 범위를 기록합니다.
- 내부 전용 배포에서는 public code signing certificate와 SmartScreen reputation을 blocker로 기록하지 않습니다.
- 운영 handoff는 `docs/operations/YYYY-MM-DD-*-handoff.md`에 추가합니다.
