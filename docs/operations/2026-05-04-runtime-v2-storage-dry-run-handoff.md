# Runtime V2 Storage Dry-run Handoff

Date: 2026-05-04 KST

## Summary

- Added `src/lib/runtime/storage-dry-run.ts`.
- Added `corepack pnpm smoke:runtime-v2:storage-dry-run`.
- Added `corepack pnpm runtime-v2:storage-dry-run`.
- The dry-run is read-only. It reads legacy `workspaces.json` and workspace `layout.json` files, then reports:
  - `cutoverReady`
  - count-only storage totals
  - blocker/warning codes
  - relative backup manifest for `workspaces.json`, `workspaces/<workspaceId>/layout.json`, and target `runtime-v2/state.db`
- The report intentionally excludes cwd, workspace/tab names, session names, JSONL paths, prompt text, assistant text, and terminal output.

## Live Snapshot

`corepack pnpm runtime-v2:storage-dry-run` on the current host returned:

```json
{
  "cutoverReady": false,
  "workspaceCount": 6,
  "groupCount": 1,
  "paneCount": 6,
  "tabCount": 6,
  "runtimeV1TabCount": 2,
  "runtimeV2TabCount": 0,
  "nonTerminalTabCount": 4,
  "statusMetadataTabCount": 6
}
```

Current blockers are workspace group state, legacy terminal tab import, non-terminal tab import, and tab status metadata import. Sidebar and active workspace state are warnings.

## Verification

- `corepack pnpm test tests/unit/lib/runtime/storage-dry-run.test.ts`
- `corepack pnpm smoke:runtime-v2:storage-dry-run`
- `corepack pnpm exec tsc --noEmit --pretty false`
- `corepack pnpm runtime-v2:storage-dry-run`
- `corepack pnpm smoke:runtime-v2:storage-shadow`
- `corepack pnpm test`
- `corepack pnpm lint`

## Remaining Gate

- Implement idempotent JSON-to-SQLite import that closes the dry-run blockers.
- Keep `CODEXMUX_RUNTIME_STORAGE_V2_MODE=off` until dry-run blockers are closed and storage shadow compare passes on real data.
