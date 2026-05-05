# Runtime V2 Code Default Fallback Design

## Goal

Phase 6 gate 통과 이후 `CODEXMUX_RUNTIME_V2=1`만 설정된 설치/업그레이드에서도 runtime v2 surface가 production 기본 경로로 동작하게 한다.

## Scope

- Keep `parseRuntime*Mode()` fail-closed for raw values.
- Change resolved/get mode fallback only when `CODEXMUX_RUNTIME_V2=1` and the matching surface mode env is unset.
- Defaults:
  - terminal: `new-tabs`
  - storage: `default`
  - timeline: `default`
  - status: `default`
- Preserve explicit rollback:
  - `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off`
  - `CODEXMUX_RUNTIME_STORAGE_V2_MODE=off`
  - `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`
  - `CODEXMUX_RUNTIME_STATUS_V2_MODE=off`
- Preserve explicit invalid value fail-closed to `off`.

## Non-goals

- Do not change the master `CODEXMUX_RUNTIME_V2` gate.
- Do not migrate existing legacy `pt-` sessions into runtime v2.
- Do not remove legacy JSON fallback or runtime v2 rollback flags.
- Do not change the Phase 6 gate expected terminal mode from `new-tabs`.

## Rollback

Set the affected surface mode to `off`. For full rollback, set `CODEXMUX_RUNTIME_V2=0` or remove the runtime v2 drop-in.

## Verification

- Mode helper unit tests cover unset, explicit `off`, invalid, and runtime-disabled behavior.
- Runtime v2 health route reports Phase 6 fallback modes when surface env modes are unset.
- Phase 6 live gate continues to pass.
