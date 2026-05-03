# Runtime v2 Phase 2 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the next Phase 2 terminal hardening gaps by extending runtime v2 smoke coverage and making rollback/off mode visible for existing v2 tabs.

**Architecture:** Keep legacy JSON layout as the UI source of truth and avoid changing runtime ownership. Extend the existing runtime v2 smoke script with protocol frames already supported by `/api/v2/terminal`. Add a small client preflight helper so v2 tabs can report `runtime-v2-disabled` instead of looking like a generic disconnect when rollback mode is active.

**Tech Stack:** TypeScript, React hook utilities, Next.js Pages Router, Node ESM smoke scripts, Vitest.

---

## Files

- Modify: `scripts/runtime-v2-smoke-lib.mjs`
- Modify: `scripts/smoke-runtime-v2.mjs`
- Modify: `tests/unit/scripts/runtime-v2-smoke-lib.test.ts`
- Create: `src/lib/terminal-runtime-preflight.ts`
- Modify: `src/hooks/use-terminal-websocket.ts`
- Modify: `src/components/features/workspace/connection-status.tsx`
- Modify: `src/components/features/mobile/mobile-surface-view.tsx`
- Modify: `src/types/terminal.ts`
- Modify: `messages/ko/connection.json`
- Modify: `messages/en/connection.json`
- Modify: `messages/ko/mobile.json`
- Modify: `messages/en/mobile.json`
- Create: `tests/unit/lib/terminal-runtime-preflight.test.ts`
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/RUNTIME-V2-PARITY.md`
- Modify: `docs/TMUX.md`
- Modify: `docs/ELECTRON.md`
- Modify: `docs/ANDROID.md`

## Tasks

### Task 1: Extend Runtime v2 Smoke Protocol Helpers

- [x] Add failing helper tests for `encodeWebStdin()`, `encodeHeartbeat()`, and `isRuntimeV2SmokeHeartbeatFrame()`.
- [x] Run `corepack pnpm vitest run tests/unit/scripts/runtime-v2-smoke-lib.test.ts` and confirm the new tests fail.
- [x] Implement the three helper exports in `scripts/runtime-v2-smoke-lib.mjs`.
- [x] Re-run the helper test and confirm it passes.

### Task 2: Extend Server Smoke For Web Stdin, Heartbeat, And Backpressure

- [x] Update `scripts/smoke-runtime-v2.mjs` to send `MSG_WEB_STDIN`, assert heartbeat echo, and assert oversized input closes with `1011 Terminal input backpressure`.
- [x] Run the script against a temp HOME/DB dev server and confirm JSON `checks` includes `web-stdin-heartbeat` and `backpressure-close`.
- [x] Keep the existing attach/stdin/stdout/resize/fresh reattach/fanout/delete/workspace cleanup checks unchanged.

### Task 3: Add Runtime v2 Rollback Diagnostic For Existing Tabs

- [x] Add failing unit tests for `preflightTerminalRuntime()` covering legacy endpoint skip, v2 health ok, and v2 `runtime-v2-disabled`.
- [x] Implement `src/lib/terminal-runtime-preflight.ts`.
- [x] Update `useTerminalWebSocket()` to preflight only `/api/v2/terminal` before opening the WebSocket; when disabled, set disconnect reason `runtime-v2-disabled`.
- [x] Add Korean/English visible copy in desktop and mobile disconnect surfaces.
- [x] Run `corepack pnpm vitest run tests/unit/lib/terminal-runtime-preflight.test.ts`.

### Task 4: Documentation

- [x] Update runtime v2 cutover/parity/TMUX docs with the expanded smoke checks and rollback diagnostic behavior.
- [x] Tighten Electron/Android runtime v2 smoke checklists to mention cookie-auth surface, foreground reconnect, and runtime-off diagnostic.

### Task 5: Verification And Integration

- [x] Run `git diff --check`.
- [x] Run `corepack pnpm vitest run tests/unit/scripts/runtime-v2-smoke-lib.test.ts tests/unit/lib/terminal-runtime-preflight.test.ts tests/unit/lib/runtime/terminal-ws.test.ts tests/unit/lib/terminal-websocket-url.test.ts`.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/pages/runtime-v2-api.test.ts tests/unit/pages/layout-tabs-api.test.ts tests/unit/scripts/runtime-v2-smoke-lib.test.ts`.
- [x] Run `corepack pnpm tsc --noEmit`.
- [x] Run `corepack pnpm lint`.
- [x] Run `corepack pnpm build`.
- [x] Run runtime v2 smoke against temp HOME/DB.
- [ ] Commit, fast-forward merge to main, push, and clean up worktree.
