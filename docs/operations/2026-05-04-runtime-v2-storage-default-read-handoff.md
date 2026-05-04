# Runtime v2 Storage Default Read Handoff

Date: 2026-05-04

## Scope

This slice adds SQLite-first workspace/layout/message-history reads behind
`CODEXMUX_RUNTIME_STORAGE_V2_MODE=default`.

## Evidence

- Schema v3 adds `workspace_directories`, `app_state`, and `message_history`.
- Legacy JSON import now preserves active workspace, sidebar collapsed/width, and
  all workspace directories.
- Legacy message history import now preserves workspace input history in SQLite.
- `src/lib/runtime/storage-read-owner.ts` reads workspace/layout/message-history projection from
  SQLite first and falls back to legacy JSON on projection failure.
- `getWorkspaces()`, `getActiveWorkspaceId()`, `getWorkspaceById()`, and
  `readLayoutFile()` use the SQLite projection only in `default` mode.
- `readMessageHistory()`, `addMessageHistory()`, and `deleteMessageHistory()` use SQLite first in
  `default` mode and keep `message-history.json` as rollback mirror.
- `corepack pnpm smoke:runtime-v2:storage-default-read` passes on temp HOME/DB.

## Ownership Status

- Import ownership: implemented.
- Write mirror ownership: implemented for legacy workspace/layout/message-history JSON writes.
- Read ownership: implemented for workspace/layout/sidebar/message-history projection in
  `default` mode, with JSON fallback.
- Production live mode: still `write`, not `default`.
- Timeline/status live ownership: unchanged.

## Remaining Gate

- Live `default` rollout on production data after backup/import.
- Browser/Electron/Android sync invalidation evidence with production
  `storageV2Mode=default`.
