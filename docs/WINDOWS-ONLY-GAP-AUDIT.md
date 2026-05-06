# Windows-only Gap Audit

Date: 2026-05-06
Status: Planning baseline

## Verdict

codexmux는 아직 Windows 전용 제품이 아니다. 현재 codebase는 macOS/Linux에서
`tmux`를 실행하는 self-hosted server를 중심으로 하고, Electron과 Android는 실행 중인
server에 붙는 client shell로 설계되어 있다.

이번 전환은 기존 Windows companion integration을 되살리는 작업이 아니다. ADR-014에서
제거한 원격 Windows JSONL sync, terminal sidecar, remote source model은 계속 제거된
상태로 둔다. 새 목표는 제품 실행 기준 자체를 Windows-only service/product로 바꾸는
것이다.

## Audit Sources

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

## Domain Language

Canonical terms:

| Term | Meaning |
| --- | --- |
| Windows-only product | codexmux의 supported execution target을 Windows로 고정하는 제품 전환 |
| Windows terminal runtime | `tmux` 대신 Windows에서 local Codex shell을 유지, attach, resize, stdin/stdout 처리하는 runtime |
| Windows service host | long-running codexmux server를 Windows에서 시작, 재시작, 로그 확인, 종료하는 host boundary |
| runtime adapter | Terminal/process/service 구현을 OS별 infrastructure에서 분리하는 adapter |
| local Codex session | local `~/.codex/sessions/` JSONL과 실행 중인 local Codex process를 연결한 session projection |

Rejected synonyms:

| Rejected term | Reason |
| --- | --- |
| Windows companion integration | ADR-014에서 제거한 remote sync/sidecar 모델을 뜻하므로 새 제품 목표와 다르다. |
| Windows bridge | old remote terminal command queue와 혼동된다. |
| macOS/Linux server | 전환 후 supported product target이 아니다. |
| Android primary client | 현재 client shell일 뿐 Windows-only 제품 목표의 primary surface가 아니다. |
| tmux backend | 현재 구현 세부사항이며 Windows 전용 목표의 canonical runtime term이 아니다. |

## Bounded Context Candidates

| Context | Responsibility | Current center | Windows target |
| --- | --- | --- | --- |
| Terminal Runtime | session create, attach, detach, resize, stdin/stdout, kill | `src/lib/tmux.ts`, `src/lib/runtime/terminal/*` | `ITerminalWorkerRuntime` 뒤의 Windows-native adapter |
| Process Inspection | process tree, cwd, command, Codex process/session detection | `/proc`, `pgrep`, `ps`, `lsof`, tmux pane PID | Windows process inspector adapter |
| Host Operations | install, preflight, start/restart, logs, health, rollback | `systemd --user`, POSIX shell, deploy script | Windows service/tray/installer host |
| Platform Shell | desktop/mobile shell packaging and reconnect | Electron macOS packaging, Android Capacitor shell | Windows desktop/service packaging; mobile shell demoted or removed |
| Local Session Index | Codex JSONL discovery and timeline projection | local `~/.codex/sessions/` index | same domain with Windows path semantics verified |
| Release Verification | CI, smoke, package, install checks | macOS/Linux/tmux and Android/Electron smoke | Windows build, service, terminal, reconnect, JSONL smoke |

Useful candidates:

- Aggregate: `TerminalSession` owns lifecycle, attachment state, dimensions, and kill semantics.
- Entity: `CodexProcess` owns PID, command, cwd, start time, and provider/session correlation.
- Value object: `SessionName`, `WorkspacePath`, `CodexSessionPath`, `HostBinding`.
- Adapter: `ITerminalWorkerRuntime`, future `IProcessInspector`, future `IHostServiceController`.

## Gap Matrix

| Area | Current assumption | Windows target | Impact | Candidate boundary | Priority |
| --- | --- | --- | --- | --- | --- |
| Product contract | README and docs say macOS/Linux server with tmux; Android/Electron are shells. | Supported execution target is Windows-only. | User expectation, docs, release gates. | ADR + docs map + README later. | P0 |
| Terminal runtime | `src/lib/tmux.ts` shells out to `tmux -L codexmux`, uses POSIX launch command, tmux pane metadata, and process-group signals. | Windows-native persistent terminal runtime. | Largest behavior risk: reconnect, input, kill, cwd, status. | Terminal runtime adapter. | P0 |
| Runtime v2 terminal | `terminal-worker-runtime.ts` still creates and attaches tmux sessions. | Reuse worker service contract, swap infrastructure adapter. | Keeps Supervisor/typed IPC stable while replacing terminal backend. | `ITerminalWorkerRuntime`. | P0 |
| Process inspection | `session-detection.ts` reads `/proc` on Linux and falls back to `pgrep`/`lsof` elsewhere. | Windows process tree, cwd, command, and start-time inspection. | Codex running detection and JSONL mapping can misclassify sessions. | `IProcessInspector`. | P1 |
| Preflight | `preflight.ts` checks tmux, macOS CLT/brew, and POSIX login shell PATH. | Check Windows Codex, Git, Node, pnpm, terminal runtime, service permissions. | First-run readiness is currently wrong on Windows. | Host preflight adapter. | P1 |
| Install scripts | `package.json` `postinstall` uses POSIX `chmod`; `prepublishOnly` uses `rm -rf`. | Windows-safe install/build scripts. | Fresh install can fail before app starts. | npm script hygiene. | P0 |
| Service operation | `deploy:local` restarts `systemd --user`; docs center Linux user service. | Windows Service, tray app, scheduled startup, or installer-owned service. | Production operation path is absent. | Host service controller. | P2 |
| Packaging | Electron package script targets macOS; Android scripts are first-class. | Windows desktop/service package and installer verification. | Release artifact path is undefined. | Packaging context. | P2 |
| Network access | Tailscale/mobile remote access is heavily documented. | Windows local service first; remote access is optional policy. | Avoid letting Android/Tailscale drive core architecture. | Network/access policy docs. | P3 |
| Tests | Prior Windows run passed type/lint but full test had `/proc`, path/HOME, and SQLite cleanup failures. | Windows unit/integration/smoke gates are green. | Test suite currently hides platform debt. | Platform test matrix. | P0 |
| Docs | `TMUX.md`, `SYSTEMD.md`, `ANDROID.md`, `ELECTRON.md`, README all describe current platform shape. | Docs describe Windows-only target once runtime plan is accepted. | Docs drift will confuse operators. | Staged docs cutover. | P0 |
| ADR continuity | ADR-014 removed old Windows companion integration. | New ADR clarifies Windows-only target without reviving remote sidecar. | Prevents architectural backtracking. | ADR-020. | P0 |

## Known Windows Evidence

- `corepack pnpm install --frozen-lockfile` previously failed on Windows because
  `postinstall` runs POSIX `chmod`; `--ignore-scripts` allowed dependency install.
- `corepack pnpm tsc --noEmit` and `corepack pnpm lint` passed in the current
  Windows workspace.
- `corepack pnpm test` previously failed on Windows in 10 files / 41 tests after
  most tests passed. Failures clustered around Linux `/proc`, path/HOME
  assumptions, and temporary SQLite cleanup (`EBUSY`).
- `rg.exe` was not usable in this Codex Windows desktop session because of an
  access-denied error; audit used `git grep`, `git ls-files`, and PowerShell
  searches instead.

## Architecture Implications

- Folder impact: keep current UI and runtime v2 worker folders stable at first;
  add Windows adapters next to runtime/process boundaries instead of scattering
  `process.platform === 'win32'` checks through API routes.
- Module boundary impact: stop treating `src/lib/tmux.ts` as the domain
  terminal API. It is a current infrastructure adapter.
- Public API impact: browser-facing terminal and timeline URLs should remain
  stable where possible. The implementation behind `/api/terminal` and
  `/api/v2/terminal` can change after adapter parity tests exist.
- Type-shape impact: terminal/session types need to stop assuming tmux session
  name, pane PID, and pane current command are always available. If kept for
  compatibility, they should be marked as infrastructure metadata.
- Adapter impact: process inspection and terminal lifecycle should become
  injectable infrastructure behind tested contracts before Windows behavior is
  switched on by default.
- Rollback impact: keep tmux path as a temporary migration fallback until
  Windows runtime parity is proven, but do not document it as supported product
  target after cutover.

## Recommended Transition Order

1. Freeze the Windows-only target in ADR and planning docs.
2. Add platform/runtime adapter contracts and tests while keeping behavior
   unchanged.
3. Replace direct tmux calls in runtime v2 terminal path with adapter injection.
4. Build the Windows terminal runtime behind the existing worker service
   contract.
5. Add Windows process/session inspection and Codex JSONL mapping parity tests.
6. Replace preflight/install/service/deploy assumptions with Windows equivalents.
7. Cut over documentation, release gates, and packaging to Windows-only.
8. Remove or demote macOS/Linux/Android-only surfaces after Windows runtime is
   green and rollback is understood.

## ADR Candidates

- Accepted now: Windows-only product target and ADR-014 non-resurrection rule.
- Proposed later: Windows terminal runtime adapter and parity contract.
- Proposed later: Windows service host and installer ownership.
- Proposed later: platform support removal policy for macOS/Linux/Android docs,
  scripts, and smoke tests.

## Non-Goals

- Do not revive the removed Windows remote sync or terminal bridge.
- Do not refactor FE/React/Vercel or BE/FastAPI skills.
- Do not rewrite the UI while auditing platform gaps.
- Do not dispatch sub-agents unless explicitly requested.
- Do not execute external guide installers, hooks, package managers, or plugin
  manifests as part of this audit.

## First Implementation Slice

Accepted first slice: Windows platform contract baseline.

Success criteria:

- Terminal runtime contract exists with create, attach, write, resize, detach,
  kill, presence, and optional metadata projection behavior.
- Current tmux runtime remains the default production adapter and passes the new
  mocked contract coverage.
- Process inspector primitives are separated from Codex-specific session
  detection policy.
- Live Windows process inspector behavior is not claimed or required in this
  slice.
- Windows path fixtures cover local Codex session JSONL allow/deny behavior.
- Static package/script blocker scanner identifies POSIX-only and Linux service
  command patterns without changing production scripts.
- Browser-facing terminal APIs and README support claims do not change.

Rollback: normal git revert. No feature flag is needed until runtime selection or
Windows adapter implementation appears in a later slice.

## Windows Unit Gate Follow-up

The next implementation pass resolved the Windows unit test baseline that was
blocking the first slice from becoming a clean local gate.

Resolved items:

- Windows tests now stub both `HOME` and `USERPROFILE` when exercising modules
  that resolve `os.homedir()` at import time.
- Runtime storage tests now close opened SQLite database handles and storage
  worker services before removing temporary directories, avoiding Windows
  `EBUSY` cleanup failures.
- `layout-store` now normalizes Windows path separators before extracting a
  workspace id from `workspaces/<ws-id>/layout.json`, so runtime storage read and
  write ownership works on Windows paths.
- `openRuntimeDatabase` now closes the SQLite handle before rethrowing migration
  failures, including newer-schema rejection.

Validation:

- `corepack pnpm test`: 109 passed, 2 skipped files; 562 passed, 3 skipped tests.
- `corepack pnpm tsc --noEmit`: passed.
- `corepack pnpm lint`: passed.
- `git diff --check`: passed with CRLF working-copy warnings only.

## Terminal Runtime Adapter Factory Follow-up

The next transition slice moved the runtime v2 terminal worker entrypoint off a
direct tmux runtime import and onto a terminal runtime adapter factory.

Resolved items:

- `src/workers/terminal-worker.ts` now asks the factory for the terminal runtime
  adapter instead of importing the current tmux runtime directly.
- `CODEXMUX_RUNTIME_TERMINAL_ADAPTER` is parsed in one place. The only supported
  value is `tmux`; unset also resolves to `tmux` as the migration fallback.
- Unimplemented values such as `windows` fail closed with
  `runtime-v2-terminal-adapter-unsupported` instead of silently claiming Windows
  runtime support.
- The factory is injectable in unit tests, so a future Windows adapter can be
  added behind the same `ITerminalRuntimeAdapter` contract without changing the
  worker service command handling.

Validation:

- `corepack pnpm test tests/unit/lib/runtime/terminal-runtime-adapter-factory.test.ts tests/unit/lib/runtime/terminal-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-runtime.test.ts`: passed.
