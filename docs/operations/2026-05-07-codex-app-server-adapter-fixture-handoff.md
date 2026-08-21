# Codex App-Server Adapter Fixture Handoff

Date: 2026-05-07

## Scope

- Added a disabled-by-default `codex-app-server` fixture adapter boundary.
- Kept production provider registry unchanged: only `codex` is registered.
- Added env-gated capability reporting for `CODEXMUX_CODEX_APP_SERVER=experimental`.
- Added fixture normalization for read-only session projection, timeline entries, and status hints.
- Kept launch, resume, and approval action execution unsupported.

## Safety

- The adapter does not open network connections or execute app-server commands.
- Fixture normalization ignores raw cwd, command, prompt, token, and transport payload fields.
- App-server status hints are not `/api/status` source-of-truth and do not feed notification or approval execution paths.

## Rollback

Leave `CODEXMUX_CODEX_APP_SERVER` unset or set it to `disabled`. No production provider registration exists in this slice.

## Verification

Focused verification:

```bash
corepack pnpm vitest run tests/unit/lib/codex-app-server-adapter.test.ts tests/unit/lib/providers.test.ts
```

Result: passed, 2 files / 14 tests.

Expanded focused verification:

```bash
corepack pnpm vitest run tests/unit/lib/codex-app-server-adapter.test.ts tests/unit/lib/providers.test.ts tests/unit/lib/agent-session-relationship.test.ts
```

Result: passed, 3 files / 17 tests.

Full verification:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

Result: passed. Full test suite passed, 146 files / 703 tests.
