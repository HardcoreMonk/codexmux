# Runtime v2 New Tab Routing Design

## Goal

Enable `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=new-tabs` for plain new terminal tabs while preserving the current app surface and legacy tabs.

## Scope

- Route only plain terminal tab creation through runtime v2 when `CODEXMUX_RUNTIME_V2=1` and terminal mode is `new-tabs` or `default`.
- Keep Codex, diff, web-browser, resume, and command-start tabs on legacy `pt-` creation.
- Keep legacy JSON layout as the UI source of truth for this slice.
- Mirror the legacy workspace/pane id into runtime v2 storage only when the layout API explicitly creates a v2 tab.
- Store the returned v2 tab in legacy layout with `runtimeVersion: 2` so reload and existing pane UI can render it.
- Select `/api/v2/terminal` for runtime v2 tabs in the existing desktop and mobile terminal surfaces.
- Use runtime v2 tab cleanup for `runtimeVersion: 2` tabs.

## Non-Goals

- Do not make SQLite the workspace/layout source of truth.
- Do not migrate existing `pt-` tabs.
- Do not route Codex resume or command-start tabs through runtime v2.
- Do not switch timeline/status surfaces.
- Do not add a UI toggle for opt-in mode.

## Behavior

When the mode is off, the layout tab API keeps using `addTabToPane()` and returns a legacy `pt-` tab with `runtimeVersion: 1`.

When the mode is `new-tabs` and the request is a plain terminal tab, the layout tab API starts the runtime supervisor, asks storage to ensure a mirror workspace/pane row for the existing legacy ids, creates an `rtv2-` terminal tab, then appends that tab to the legacy JSON pane. If JSON append fails after the v2 session is created, the API best-effort deletes the v2 tab before returning the not-found response.

Desktop and mobile terminal surfaces choose the WebSocket endpoint from `runtimeVersion`: missing or `1` uses `/api/terminal`, and `2` uses `/api/v2/terminal`.

## Tests

- IPC reply parsing preserves `runtimeVersion: 2`.
- Runtime storage can ensure a legacy workspace/pane mirror and create a v2 terminal tab under it.
- Layout tab API uses legacy creation while mode is off.
- Layout tab API uses runtime v2 creation and JSON append while mode is `new-tabs`.
- Layout tab API falls back to legacy for command/resume/non-terminal tabs.
- Terminal endpoint helper maps `runtimeVersion` to the correct WebSocket endpoint.
