# Runtime v2 Terminal Production-Parity Smoke Design

Date: 2026-05-03
Status: Approved follow-up slice 1 of 5

## Purpose

This slice strengthens runtime v2 terminal verification before broader Storage,
Timeline, Status, and production cutover work.

The current smoke proves the minimum byte path: create a v2 workspace/tab, attach
`/api/v2/terminal`, send stdin, read stdout, resize, and delete the workspace.
That is not enough for production-parity confidence. The next blocker is proving
that the Terminal Worker-owned path can survive normal client reconnect patterns
without relying on the legacy `/api/terminal` path.

## Scope

In scope:

- Extend `scripts/smoke-runtime-v2.mjs` to validate:
  - initial attach/stdin/stdout/resize
  - client detach followed by a fresh attach to the same runtime v2 session
  - multiple WebSocket subscribers on one runtime v2 session receiving the same
    stdout fanout
  - workspace delete cleanup followed by rejected attach to the deleted session
- Keep the smoke authenticated through the existing `x-cmux-token` header.
- Keep the smoke server-driven and usable against a manually started
  `CODEXMUX_RUNTIME_V2=1` codexmux server.
- Add unit coverage for reusable runtime v2 smoke helpers.
- Update docs with an explicit Electron and Android runtime v2 smoke checklist.

Out of scope:

- Adding a public or hidden API to crash/restart Terminal Worker.
- Automating GUI Electron flows in this slice.
- Automating Android device interaction in this slice.
- Replacing production `/api/terminal`.
- Moving Storage, Timeline, or Status ownership.

## Design

### Smoke Script Behavior

The smoke script remains a single command:

```bash
CODEXMUX_RUNTIME_V2_SMOKE_URL=http://127.0.0.1:8132 node scripts/smoke-runtime-v2.mjs
```

It assumes the server is already running with `CODEXMUX_RUNTIME_V2=1`.

The script now runs one workspace/tab through this sequence:

1. `GET /api/v2/runtime/health`
2. `POST /api/v2/workspaces`
3. `GET /api/v2/workspaces` and assert the created workspace appears
4. `POST /api/v2/tabs`
5. Attach WebSocket A and assert `pwd` plus `stty size` after a resize to
   `100x30`
6. Close WebSocket A, open WebSocket B for the same `sessionName`, send
   `printf runtime-v2-reconnect-ok`, and assert output arrives
7. Open WebSocket C and D concurrently for the same `sessionName`, send
   `printf runtime-v2-fanout-ok` through one socket, and assert both sockets see
   the output
8. Delete the workspace
9. Attempt a fresh attach to the deleted `sessionName` and assert the socket
   closes with `1011`

The output JSON includes a `checks` array so failures identify which production
parity property failed.

### Helper Extraction

Move reusable frame and URL helpers into `scripts/runtime-v2-smoke-lib.mjs`.
The script-specific orchestration stays in `scripts/smoke-runtime-v2.mjs`.

The helper module exports:

- `encodeStdin(data)`
- `encodeResize(cols, rows)`
- `runtimeV2SmokeWsUrl(baseUrl, sessionName, dimensions)`
- `decodeRuntimeV2SmokeFrame(data)`
- `appendRuntimeV2SmokeFrame(output, data)`

Unit tests cover frame encoding, stdout decoding, and URL construction without
starting a server.

### Platform Smoke Docs

Electron and Android platform smoke remains manual in this slice, but it must be
specific enough to execute consistently:

- start server with `CODEXMUX_RUNTIME_V2=1`
- open `/experimental/runtime`
- create workspace/tab
- verify output
- background/foreground or detach/reattach
- confirm output resumes through the same runtime v2 session

The docs must explicitly say that no APK rebuild is required for server/React
runtime v2 smoke changes unless native Android bridge code changes.

## Acceptance Criteria

- `scripts/smoke-runtime-v2.mjs` validates reconnect, fanout, and cleanup
  rejection in addition to the original attach/stdin/stdout/resize path.
- New helper unit tests pass.
- Runtime v2 unit tests still pass.
- `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, and
  `corepack pnpm build` pass.
- `docs/TMUX.md`, `docs/ELECTRON.md`, and `docs/ANDROID.md` describe the new
  smoke expectations.
