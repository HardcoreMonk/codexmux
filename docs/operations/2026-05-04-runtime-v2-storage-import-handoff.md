# Runtime V2 Storage Import Handoff

Date: 2026-05-04 KST

## Summary

- Added SQLite schema v2:
  - `workspaces.active_pane_id`
  - `tabs.runtime_version`
- Added `src/lib/runtime/storage-import.ts`.
- Added `corepack pnpm smoke:runtime-v2:storage-import`.
- Added `corepack pnpm runtime-v2:storage-import`.
- Import preserves grouped workspaces, split pane trees, active pane, legacy terminal tabs, runtime v2 terminal tabs, non-terminal tabs, and tab status metadata.
- Runtime v2 terminal attach authorization and cleanup session collection remain limited to `runtime_version=2` terminal tabs, so imported legacy `pt-` sessions are not exposed to the v2 terminal worker.

## Live Snapshot

Before import, `CODEXMUX_RUNTIME_V2_STORAGE_BACKUP_TIMESTAMP=20260504T060000Z corepack pnpm runtime-v2:storage-backup` copied 28 JSON/SQLite files.

`corepack pnpm runtime-v2:storage-dry-run` returned:

```json
{
  "cutoverReady": true,
  "workspaceCount": 5,
  "groupCount": 1,
  "paneCount": 5,
  "tabCount": 5,
  "runtimeV1TabCount": 2,
  "nonTerminalTabCount": 3,
  "statusMetadataTabCount": 5,
  "blockerCount": 0
}
```

`corepack pnpm runtime-v2:storage-import` returned:

```json
{
  "importedGroupCount": 1,
  "importedWorkspaceCount": 5,
  "importedPaneCount": 5,
  "importedSplitPaneCount": 0,
  "importedTabCount": 5,
  "importedRuntimeV1TabCount": 2,
  "importedRuntimeV2TabCount": 0,
  "importedNonTerminalTabCount": 3,
  "importedStatusMetadataCount": 5,
  "missingLayoutCount": 0,
  "invalidLayoutCount": 0
}
```

## Verification

- `corepack pnpm test tests/unit/lib/runtime/storage-import.test.ts tests/unit/lib/runtime/storage-dry-run.test.ts tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts tests/unit/lib/runtime/ipc.test.ts`
- `corepack pnpm smoke:runtime-v2:storage-import`
- `corepack pnpm smoke:runtime-v2:storage-dry-run`
- `corepack pnpm exec tsc --noEmit --pretty false`
- `corepack pnpm runtime-v2:storage-dry-run`
- `corepack pnpm runtime-v2:storage-import`

## Remaining Gate

- Storage write ownership is still not default.
- Rename/reorder/group/sidebar/layout mutation sync invalidation still needs v2 write-mode implementation.
- Timeline/status live ownership cutover remains separate and must not be bundled with storage default.
