# Runtime v2 Storage Tab Delete Design

Date: 2026-05-03
Status: Approved follow-up slice 2 of 5

## Purpose

This slice expands Storage Worker command coverage with a single-tab delete path.
The current runtime v2 API can delete a whole workspace, but cannot close one
terminal tab through Storage Worker and Supervisor cleanup. Production cutover
needs that smaller mutation before wider layout editing or Status/Timeline
migration work.

## Scope

In scope:

- Add Storage Worker command `storage.delete-terminal-tab`.
- Add Supervisor method `deleteTerminalTab(tabId)`.
- Add HTTP route `DELETE /api/v2/tabs/:tabId`.
- Kill the returned runtime v2 tmux session for pending/ready terminal tabs.
- Close active runtime v2 terminal subscribers before killing the session.
- Reorder remaining tabs in the pane and move `active_tab_id` to the first
  remaining ready tab.
- Update docs to clarify that runtime v2 tab deletion is SQLite-owned.

Out of scope:

- Pane split/move/merge commands.
- Tab patch/rename/restart commands.
- Production `/api/layout/...` replacement.
- Status Worker cleanup beyond the existing `tab_status` cascade.

## Design

Storage Worker owns the SQLite transaction:

1. Find tab by id.
2. Return `{ deleted: false, session: null }` if missing.
3. Delete the row.
4. Reorder remaining tabs in the same pane to contiguous `order_index` values.
5. Set `panes.active_tab_id` to the first remaining ready tab, or `null`.
6. Append `tab.deleted` mutation event.
7. Return the terminal `sessionName` only when the deleted tab was
   `pending_terminal` or `ready` and `panel_type = 'terminal'`.

Supervisor owns terminal cleanup:

- If Storage returns no session, return without Terminal Worker IPC.
- If Storage returns a valid runtime v2 session name, close subscribers with
  `1000 Tab deleted`, wait for any in-flight attach attempt, and call
  `terminal.kill-session`.
- If the returned session name is invalid, report it as `failedKill` and do not
  send it to tmux.
- Terminal kill failure does not roll back Storage. The API returns the failure
  next to `deleted: true`, matching workspace delete cleanup semantics.

HTTP route behavior:

- `CODEXMUX_RUNTIME_V2 !== "1"` returns `404 runtime-v2-disabled` before auth.
- Unauthenticated requests return `401`.
- Non-DELETE methods return `405 Allow: DELETE`.
- Valid delete returns `200` with Supervisor result.

## Acceptance Criteria

- Repository tests prove tab delete returns cleanup session, reorders remaining
  tabs, updates active tab, and omits deleted tabs from layout.
- Worker-service tests prove `storage.delete-terminal-tab`.
- Supervisor tests prove session cleanup, subscriber close, invalid session
  safety, and no Terminal Worker IPC for missing/failed-session deletes.
- API route tests prove disabled/auth/method/delete behavior.
- Runtime docs mention single-tab v2 delete coverage.
