# Android Timeline Foreground Reconnect Handoff

## Scope

Added `corepack pnpm smoke:android:timeline-foreground` for the Timeline Phase 4 default-promotion
gate. The smoke starts a temp runtime v2 server with
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`, exposes it over Tailscale, authenticates the Android
WebView with the normal cookie route, and opens `/api/timeline` from page context.

Each foreground round backgrounds the Android app, appends entries to the active Codex JSONL while
the app is backgrounded, returns the app to foreground, and verifies a fresh `timeline:init` with an
increased `totalEntries`. This targets stale JSONL reconnect regressions before moving
client-facing `/api/timeline` WebSocket ownership to runtime v2.

## Verification

- `node --check scripts/smoke-android-timeline-foreground.mjs`
- `corepack pnpm test tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts`
- `corepack pnpm smoke:android:timeline-foreground`

The first host run of `corepack pnpm smoke:android:timeline-foreground` was blocked because ADB
reported no connected Android device: `connected=-`. Restarting the ADB server exposed the connected
device, and the rerun passed on SM-S928N Android 16.

Evidence:

- `timelineV2Mode=default`
- `timelineOk=true`
- foreground rounds: 2
- `timeline:init` `totalEntries`: initial 3, foreground-1 5, foreground-2 7
- blocking console errors: 0
- blocking logcat lines: 0

## Output Policy

The smoke output includes pass/fail counters, Android app info, target URL, and per-round
`totalEntries`. It does not print prompt text, assistant text, cwd, JSONL path, terminal output, or
auth cookies. Failure output sanitizes the temp HOME, JSONL path, and fixture content markers.

## Remaining Work

- Start the default-owned `/api/timeline` WebSocket bridge slice.
- Keep `corepack pnpm smoke:android:timeline-foreground` in the promotion gate for the default
  WebSocket path.
