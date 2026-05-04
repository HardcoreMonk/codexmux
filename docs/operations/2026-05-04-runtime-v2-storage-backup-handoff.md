# Runtime V2 Storage Backup Handoff

Date: 2026-05-04 KST

## Summary

- Added `src/lib/runtime/storage-backup.ts`.
- Added `corepack pnpm smoke:runtime-v2:storage-backup`.
- Added `corepack pnpm runtime-v2:storage-backup`.
- The backup command copies legacy JSON stores and runtime v2 SQLite files to `~/.codexmux/backups/runtime-v2-storage-{timestamp}/`.
- Scope:
  - `workspaces.json`
  - `workspaces/**.json`
  - `runtime-v2/state.db`
  - `runtime-v2/state.db-wal`
  - `runtime-v2/state.db-shm`
- The command does not delete source files, run migration, or switch any runtime v2 mode.

## Live Snapshot

`CODEXMUX_RUNTIME_V2_STORAGE_BACKUP_TIMESTAMP=20260504T052000Z corepack pnpm runtime-v2:storage-backup` returned:

```json
{
  "ok": true,
  "backupDir": "/home/hardcoremonk/.codexmux/backups/runtime-v2-storage-20260504T052000Z",
  "copiedCount": 29
}
```

The command result included only destination path, relative path, and byte counts. It did not print file content, cwd, workspace/tab names, session names, prompt text, assistant text, or terminal output.

## Verification

- `corepack pnpm test tests/unit/lib/runtime/storage-backup.test.ts`
- `corepack pnpm smoke:runtime-v2:storage-backup`
- `corepack pnpm exec tsc --noEmit --pretty false`
- `CODEXMUX_RUNTIME_V2_STORAGE_BACKUP_TIMESTAMP=20260504T052000Z corepack pnpm runtime-v2:storage-backup`
- `corepack pnpm test`
- `corepack pnpm lint`
- `corepack pnpm smoke:runtime-v2:storage-shadow`

## Remaining Gate

- Implement idempotent JSON-to-SQLite import that closes `runtime-v2:storage-dry-run` blockers.
- Keep `CODEXMUX_RUNTIME_STORAGE_V2_MODE=off` until storage import/write ownership and rollback are proven.
