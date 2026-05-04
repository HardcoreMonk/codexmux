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

After the storage import slice, `corepack pnpm runtime-v2:storage-dry-run` on the current host returned:

```json
{
  "cutoverReady": true,
  "workspaceCount": 5,
  "groupCount": 1,
  "paneCount": 5,
  "tabCount": 5,
  "runtimeV1TabCount": 2,
  "runtimeV2TabCount": 0,
  "nonTerminalTabCount": 3,
  "statusMetadataTabCount": 5
}
```

Current blocker count is 0. Sidebar state remains a warning.

## Verification

- `corepack pnpm test tests/unit/lib/runtime/storage-dry-run.test.ts`
- `corepack pnpm smoke:runtime-v2:storage-dry-run`
- `corepack pnpm exec tsc --noEmit --pretty false`
- `corepack pnpm runtime-v2:storage-dry-run`
- `corepack pnpm smoke:runtime-v2:storage-shadow`
- `corepack pnpm test`
- `corepack pnpm lint`

## Remaining Gate

- Keep `CODEXMUX_RUNTIME_STORAGE_V2_MODE=off` until storage write ownership and sync invalidation are proven.
