# Runtime V2 Phase 6 Default Gate Design

## Goal

Runtime v2 terminal/storage/timeline/status가 live에서 모두 default 경로로 전환된 뒤, 코드 기본값 변경 전에 실행할 운영 gate를 추가한다. 이 gate는 release candidate 또는 live target에서 mode, worker health, diagnostics counter를 확인하고 rollback window 운영 기준을 문서화한다.

## Scope

- Add a read-only smoke command that validates an authenticated target server.
- Require:
  - `/api/v2/runtime/health` succeeds.
  - `terminalV2Mode` is `new-tabs`.
  - `storageV2Mode`, `timelineV2Mode`, and `statusV2Mode` are `default`.
  - storage/terminal/timeline/status health sections are `ok`.
  - `/api/debug/perf` exposes runtime worker counters.
  - `healthFailures`, `readyFailures`, `commandFailures`, `invalidReplies`, `timeouts`, `sendFailures`, `exits`, `errors`, and `restarts` are 0 for every runtime worker.
- Keep output sanitized: no token, cwd, session name, JSONL path, prompt, assistant text, or terminal output.
- Document that this gate does not switch code/env defaults by itself.

## Non-goals

- Do not change `parseRuntime*Mode()` fallback defaults in this slice.
- Do not edit systemd drop-ins, restart services, or deploy from the gate.
- Do not create terminal tabs, mutate workspace data, or run platform shells.

## Rollback

If the gate fails after a rollout, set the narrow surface flag back first:

- `CODEXMUX_RUNTIME_STATUS_V2_MODE=off`
- `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`
- `CODEXMUX_RUNTIME_STORAGE_V2_MODE=off`
- `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off`

If worker startup itself is unstable, set `CODEXMUX_RUNTIME_V2=0`. Keep `~/.codexmux/runtime-v2/state.db` for recovery and diagnostics.

## Success

- `corepack pnpm smoke:runtime-v2:phase6-default-gate` passes against the live target.
- Docs identify Phase 6 as a default-readiness gate, not a code-default flip.
- The next code-default change remains a separate approval and release decision.
