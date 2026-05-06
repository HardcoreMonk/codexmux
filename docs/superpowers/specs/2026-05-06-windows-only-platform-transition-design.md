# Windows-only Platform Transition Design

Date: 2026-05-06
Status: Approved writing-spec

## Goal

기존 codexmux codebase를 Windows-only service/product의 기반으로 전환한다.
이번 spec은 즉시 runtime을 갈아엎는 구현서가 아니라, Windows-only 제품
전환의 canonical product shape, domain architecture, host/install/packaging,
testing/release/operate 기준을 확정하는 writing-spec이다.

## Context

현재 codexmux는 macOS/Linux에서 `tmux`를 실행하는 self-hosted server를
중심으로 하고, Electron과 Android는 실행 중인 server에 붙는 client shell로
설계되어 있다. ADR-014는 이전 Windows companion integration, 즉 remote
JSONL sync와 별도 terminal bridge를 제거했다.

새 방향은 그 제거된 companion 모델의 복구가 아니다. Windows가 제품이 직접
실행되는 primary host가 되고, 기존 server/runtime/UI 구조는 최대한 보존하되
`tmux`, Linux process inspection, `systemd` operation 같은 infrastructure
의존부를 Windows adapter로 교체하는 전환이다.

## Approved Product Shape

1차 제공 형태는 **Windows local desktop/service hybrid**로 확정한다.

사용자는 Windows 앱을 실행하고, 앱 내부 또는 함께 설치된 local server가
`localhost`에서 Next.js custom server를 띄운다. UI는 Electron shell 또는 기본
브라우저가 붙고, 장기 실행/재시작/부팅 후 복구는 Windows tray/service host가
책임진다.

```text
Windows App / Tray
  -> local codexmux server
    -> Supervisor / Workers
      -> Windows terminal runtime
      -> Windows process inspector
      -> local Codex JSONL index
      -> status / timeline / notification policy
```

이 형태를 선택한 이유는 기존 Next.js Pages Router, custom Node server,
Supervisor/Worker runtime, storage/timeline/status 정책, dense operational UI를
가장 많이 살리면서도 Windows Service, tray, installer로 확장할 수 있기
때문이다.

## Scope

- Windows-only 제품 전환의 domain language와 architecture boundary를 확정한다.
- `tmux`를 domain model이 아니라 current infrastructure adapter로 재분류한다.
- Windows terminal runtime, process inspector, service host 전환 순서를 정한다.
- Release gate와 operation handoff 기준을 Windows product behavior 중심으로
  바꾼다.
- `docs/WINDOWS-ONLY-GAP-AUDIT.md`, `docs/ADR.md`, `docs/README.md`,
  `AGENTS.md`가 이 방향을 참조하게 한다.

## Non-Goals

- 이번 spec 단계에서 Windows terminal runtime을 구현하지 않는다.
- ADR-014에서 제거한 remote Windows sync, sidecar, bridge, source filter를
  되살리지 않는다.
- FE/React/Vercel 또는 BE/FastAPI skill refactoring을 하지 않는다.
- Android, iPad, macOS, Linux packaging을 확장하지 않는다.
- 외부 installer, hook, package manager, plugin manifest를 실행하지 않는다.
- 사용자가 명시하지 않는 한 sub-agent를 dispatch하지 않는다.

## Domain Architecture Pass

Sources read:

- `AGENTS.md`
- `README.md`
- `package.json`
- `docs/README.md`
- `docs/ADR.md`
- `docs/TMUX.md`
- `docs/SYSTEMD.md`
- `docs/ELECTRON.md`
- `docs/ANDROID.md`
- `docs/superpowers/specs/2026-05-05-windows-integration-removal-design.md`
- `docs/operations/2026-05-05-windows-integration-removal-handoff.md`
- `src/lib/tmux.ts`
- `src/lib/terminal-server.ts`
- `src/lib/runtime/terminal/terminal-worker-runtime.ts`
- `src/lib/runtime/terminal/terminal-worker-service.ts`
- `src/lib/session-detection.ts`
- `src/lib/preflight.ts`
- `src/lib/shell-env.ts`
- `src/lib/platform.ts`

Canonical terms:

- Windows-only product
- Windows local desktop/service hybrid
- Windows terminal runtime
- Windows process inspector
- Windows service host
- runtime adapter
- local Codex session

Rejected synonyms:

- Windows companion integration
- Windows bridge
- macOS/Linux server
- Android primary client
- tmux backend

Bounded context candidates:

- Terminal Runtime
- Process Inspection
- Host Operations
- Platform Shell
- Local Session Index
- Release Verification

Useful model candidates:

- Aggregate: `TerminalSession`
- Entity: `CodexProcess`
- Value objects: `SessionName`, `WorkspacePath`, `CodexSessionPath`,
  `HostBinding`
- Adapters: `ITerminalWorkerRuntime`, future `IProcessInspector`, future
  `IHostServiceController`

## Runtime Boundary

Windows 전환의 핵심 domain은 `TerminalSession`이다. 제품이 보장해야 하는 것은
터미널 세션 유지, attach/reconnect, Codex status/timeline 정합성이지
`tmux session` 자체가 아니다. 따라서 `tmux`는 domain term이 아니라 current
infrastructure adapter다.

권장 경계:

```text
TerminalSession domain contract
  -> ITerminalRuntimeAdapter
    -> current tmux adapter
    -> future Windows terminal runtime adapter

CodexProcess domain contract
  -> IProcessInspector
    -> current /proc/pgrep/lsof adapter
    -> future Windows process inspector
```

`src/lib/runtime/terminal/terminal-worker-service.ts`의 `ITerminalWorkerRuntime`은
좋은 출발점이다. Windows runtime은 새 browser-facing API route를 만드는 대신 이
worker-service contract 뒤로 들어가야 한다. 이렇게 하면 `/api/v2/terminal`
client protocol과 Supervisor/Worker typed IPC는 유지하고, 내부 terminal backend만
교체할 수 있다.

Phase 1은 ConPTY 구현이 아니라 contract test다. create, attach, detach, resize,
stdin/stdout, kill, cwd 동작을 adapter contract로 고정하고, 기존 tmux adapter가
먼저 통과하도록 만든 뒤 Windows adapter를 추가한다.

## Host, Install, Packaging

Windows host는 **tray-first + service-capable**로 둔다. 1차 사용성은
tray/Electron 앱이 제공하고, 장기 실행 안정성은 Windows Service 또는
installer-managed background process로 확장한다.

```text
Installer
  -> codexmux server binary/assets
  -> tray/Electron shell
  -> optional Windows service registration

Tray/Electron shell
  -> start/stop/restart local server
  -> open UI
  -> show health/status
  -> expose logs/support actions

Windows service host
  -> boot/startup persistence
  -> restart policy
  -> local-only port binding by default
  -> health check and rollback hooks
```

전환 초반에는 runtime 구현과 host operation을 섞지 않는다. `package.json`의
POSIX `chmod`, `rm -rf`, `deploy:local`의 Linux `systemd --user` 의존성은
Windows-only 제품 목표와 충돌하지만, 이는 별도 host operations slice에서
Windows-safe script와 service control로 바꾼다.

README와 사용자-facing docs는 staged cutover한다. 지금 즉시 "Windows 지원 완료"로
바꾸면 실제 runtime 상태와 어긋난다. Audit/ADR/plan은 Windows-only target을
확정하고, README와 사용 설명은 Windows runtime이 green이 되는 implementation
slice에서 전환한다.

## Testing, Release, Operate

Windows-only release gate는 기존 `tmux/systemd/Android` smoke가 아니라 Windows
product behavior를 증명해야 한다. UI보다 runtime 안정성, reconnect, 종료/재시작,
Codex JSONL mapping 정합성이 우선이다.

```text
Contract tests
  -> terminal runtime adapter
  -> process inspector adapter
  -> Windows path/session JSONL validation

Integration tests
  -> local server startup
  -> terminal create/attach/reload/reconnect
  -> Codex process detection
  -> timeline/status mapping

Smoke tests
  -> install or packaged app start
  -> tray/service restart
  -> browser/Electron attach
  -> long-running session reconnect
  -> logs/health/rollback check
```

Release 기준:

- `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, Windows unit tests 통과
- Windows terminal runtime smoke 통과
- Windows service/tray restart smoke 통과
- local Codex JSONL timeline/status smoke 통과
- installer 또는 packaged artifact 실행 확인
- `git diff --check` 통과
- operation handoff에 실행 방식, 로그 위치, rollback, known risk 기록

운영 문서는 `docs/operations/YYYY-MM-DD-<topic>-handoff.md`에 남긴다. 전환은 여러
slice로 진행되므로 각 handoff는 무엇이 Windows-ready이고 무엇은 current-state
fallback인지 명확히 적어야 한다.

## Improve Codebase Architecture Candidates

이 후보들은 이후 implementation plan에서 명시적으로 수락된 경우에만 적용한다.
Open-ended cleanup phase로 확장하지 않는다.

- Direct tmux helper call을 terminal runtime adapter boundary 뒤로 이동한다.
- `/proc`, `pgrep`, `ps`, `lsof` call site를 process inspector boundary 뒤로 이동한다.
- Linux `systemd` deployment script와 host operation을 분리한다.
- Windows platform contract tests를 먼저 만든 뒤 domain boundary를 옮긴다.
- `tmux`를 domain concept처럼 보이게 하는 field/doc naming을 adapter-specific하게
  정리한다.

## Review Notes

`plan-design-review`는 UI 시각 디자인보다 information architecture, gate clarity,
operator error prevention, discoverability를 검토한다.

`plan-eng-review`는 terminal/process boundary, data flow, test strategy, Windows
install/service rollback, ADR-014 conflict guard를 반드시 검토한다.

## Acceptance Criteria

- Windows-only 제품 형태가 local desktop/service hybrid로 명확하다.
- `tmux`는 current infrastructure adapter로 분류되고 future domain term이 아니다.
- Windows terminal runtime과 process inspector가 adapter boundary 뒤에 들어간다.
- Host/install/packaging은 tray-first + service-capable 방향으로 분리된다.
- Release/operate 기준은 Windows product behavior를 검증한다.
- ADR-014의 removed companion integration을 되살리지 않는다.
- 이 spec 단계에서는 code behavior change가 없다.

## Self-Review

- 미해결 표식 검사: 남은 임시 marker 없음.
- Consistency check: product shape, runtime boundary, host operation, release
  gate가 모두 Windows-only 전환을 기준으로 연결된다.
- Scope check: 이 문서는 design/writing-spec이며 runtime 구현은 별도 plan으로
  분리된다.
- Ambiguity check: Windows companion integration과 Windows-only product target을
  명시적으로 구분했다.
