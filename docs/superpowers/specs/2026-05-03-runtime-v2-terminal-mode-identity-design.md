# Runtime v2 Terminal Mode Identity Design

## Goal

Prepare Phase 2 terminal v2 cutover by making terminal runtime ownership explicit in tab data and by parsing `CODEXMUX_RUNTIME_TERMINAL_V2_MODE` through a typed helper.

## Scope

- Add `runtimeVersion: 1 | 2` to tab contracts.
- Mark newly created legacy JSON tabs as `runtimeVersion: 1`.
- Mark runtime v2 SQLite/API/layout tabs as `runtimeVersion: 2`.
- Add a small runtime terminal mode helper for `off`, `opt-in`, `new-tabs`, and `default`.
- Keep production tab creation, attach, input, resize, and cleanup on legacy routes.

## Non-Goals

- Do not route production tab creation to runtime v2 yet.
- Do not change `/api/terminal` or `/api/v2/terminal` WebSocket selection.
- Do not migrate existing JSON tabs; missing `runtimeVersion` means legacy runtime 1.
- Do not add UI controls for opt-in yet.

## Behavior

New legacy tabs created through existing layout APIs include `runtimeVersion: 1`. Runtime v2 tabs returned by Storage Worker repository, Supervisor, and `/api/v2/*` include `runtimeVersion: 2`. Existing tabs without the field remain valid and are interpreted as legacy by future routing code.

The terminal mode helper returns `off` for unknown or unset values. It only allows runtime v2 terminal creation when both `CODEXMUX_RUNTIME_V2=1` and terminal mode is `new-tabs` or `default`. `opt-in` remains false until a UI/server opt-in marker exists.

## Tests

- Unit tests for terminal mode parsing and create decision.
- Runtime storage repository tests for v2 tab/layout `runtimeVersion: 2`.
- Runtime v2 API test for returned tab identity.
- Legacy layout-store test for newly created tab `runtimeVersion: 1`.
