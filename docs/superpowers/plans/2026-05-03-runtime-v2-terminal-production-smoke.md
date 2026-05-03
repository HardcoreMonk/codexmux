# Runtime V2 Terminal Production-Parity Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen runtime v2 terminal smoke coverage for reconnect, fanout, and cleanup rejection before Storage/Timeline/Status migration work.

**Architecture:** Keep the server contract unchanged and expand the existing Node smoke script. Extract frame/URL helpers into a small script library with unit tests. Update runtime terminal and platform docs with exact smoke expectations.

**Tech Stack:** Node ESM scripts, `ws`, runtime v2 HTTP/WS APIs, Vitest, TypeScript docs/tests.

---

## Files

- Create: `scripts/runtime-v2-smoke-lib.mjs`
- Modify: `scripts/smoke-runtime-v2.mjs`
- Create: `tests/unit/scripts/runtime-v2-smoke-lib.test.ts`
- Modify: `docs/TMUX.md`
- Modify: `docs/ELECTRON.md`
- Modify: `docs/ANDROID.md`

## Task 1: Runtime v2 Smoke Helper Library

- [ ] **Step 1: Write helper tests**

Create `tests/unit/scripts/runtime-v2-smoke-lib.test.ts` covering:

- `encodeStdin('pwd\n')` emits first byte `0x00`
- `encodeResize(100, 30)` emits first byte `0x02`, cols `100`, rows `30`
- `runtimeV2SmokeWsUrl()` builds `ws:` and `wss:` URLs with encoded session and dimensions
- `appendRuntimeV2SmokeFrame()` appends only stdout payload bytes for `0x01` frames

- [ ] **Step 2: Run helper tests and confirm failure**

Run:

```bash
corepack pnpm vitest run tests/unit/scripts/runtime-v2-smoke-lib.test.ts
```

Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Implement `scripts/runtime-v2-smoke-lib.mjs`**

Create helper exports for stdin/resize encoding, URL construction, frame
decoding, output append, and WebSocket raw-data to Buffer conversion.

- [ ] **Step 4: Run helper tests and confirm pass**

Run:

```bash
corepack pnpm vitest run tests/unit/scripts/runtime-v2-smoke-lib.test.ts
```

Expected: PASS.

## Task 2: Expand Server Smoke Scenario

- [ ] **Step 1: Refactor existing smoke script to use helpers**

Replace local frame constants and URL helpers in `scripts/smoke-runtime-v2.mjs`
with imports from `scripts/runtime-v2-smoke-lib.mjs`.

- [ ] **Step 2: Add reconnect check**

After the original attach/stdin/stdout/resize check closes, attach again to the
same `sessionName`, send `printf runtime-v2-reconnect-ok\n`, and assert the
output arrives.

- [ ] **Step 3: Add fanout check**

Open two WebSockets for the same `sessionName`, send
`printf runtime-v2-fanout-ok\n` through one socket, and assert both sockets see
the output.

- [ ] **Step 4: Add cleanup rejection check**

After deleting the workspace, attempt a new attach to the deleted `sessionName`
and assert the socket closes with code `1011`.

- [ ] **Step 5: Print structured smoke result**

Print JSON with `ok`, `workspaceId`, `tabId`, `sessionName`, and `checks`.

## Task 3: Docs and Verification

- [ ] **Step 1: Update docs**

Document reconnect/fanout/cleanup rejection smoke in `docs/TMUX.md`. Add
Electron and Android manual runtime v2 smoke checklists to `docs/ELECTRON.md`
and `docs/ANDROID.md`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
corepack pnpm vitest run tests/unit/scripts/runtime-v2-smoke-lib.test.ts tests/unit/lib/runtime tests/unit/lib/terminal-websocket-url.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck, lint, and build**

Run:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
```

Expected: all commands exit 0. Build may print the existing Turbopack NFT warning.
