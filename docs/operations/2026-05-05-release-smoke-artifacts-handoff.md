# 2026-05-05 Release Smoke Artifacts Handoff

## Scope

Added opt-in sanitized JSON artifact output for Browser/Electron/Android reconnect smoke evidence.

## Artifact Contract

Set `CODEXMUX_SMOKE_ARTIFACT_DIR` to write one JSON artifact per smoke run. Stdout JSON remains
unchanged for existing local workflows. Artifact redaction drops temp HOME, session identifiers,
target URLs, device serials, devtools forwarding data, server output, cookies, tokens, prompt body,
terminal output, and Codex JSONL paths.

## Release Workflow

The tag release workflow runs `pnpm smoke:browser-reconnect` and uploads `smoke-browser-reconnect`
with 14-day retention. Android and packaged Electron evidence use the same artifact writer from
manual or self-hosted runs.

## Verification

- `corepack pnpm test tests/unit/scripts/smoke-artifact-lib.test.ts`: passed, 3 tests.
- `node --check scripts/smoke-artifact-lib.mjs`: passed.
- `node --check scripts/smoke-browser-reconnect-dom.mjs`: passed.
- `node --check scripts/smoke-electron-runtime-v2.mjs`: passed.
- `node --check scripts/smoke-android-foreground-reconnect.mjs`: passed.
- `node --check scripts/smoke-android-runtime-v2-foreground.mjs`: passed.
- `node --check scripts/smoke-android-timeline-foreground.mjs`: passed.
- `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-smoke-artifacts-n3XTNe corepack pnpm smoke:browser-reconnect`:
  passed and wrote `browser-reconnect-20260505T150911288Z-passed.json`.
- Artifact sensitive scan for `serverOutput`, `homeDir`, prompt body, `.codex/sessions`, `secret-`,
  cookie/token/password, stdout/stderr, session identifiers, target URLs, and devtools fields:
  no matches.
- `corepack pnpm test`: passed, 108 files and 551 tests.
- `corepack pnpm tsc --noEmit`: passed.
- `corepack pnpm lint`: passed.
- `git diff --check`: passed.

## Remaining Work

- Add a self-hosted Android device runner if release candidates should collect Android artifacts
  without an operator.
- Add macOS packaged app artifact capture after the Mac release packaging path is available.
