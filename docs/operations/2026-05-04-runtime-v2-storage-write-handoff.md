# Runtime v2 Storage Write Handoff

Date: 2026-05-04

## Scope

This slice adds `CODEXMUX_RUNTIME_STORAGE_V2_MODE=write|default` support for
best-effort SQLite mirror after legacy JSON workspace/layout/message-history writes.

## Evidence

- `src/lib/runtime/storage-mode.ts` parses storage mode fail-closed.
- `src/lib/runtime/storage-mirror.ts` serializes legacy snapshot imports behind a process lock and prunes rows that disappeared from the JSON snapshot.
- `writeLayoutFile()`, `writeWorkspacesFile()`, and message-history JSON fallback writes call the mirror after successful JSON writes.
- `/api/v2/runtime/health` includes `storageV2Mode`, `timelineV2Mode`, and `statusV2Mode`.
- `corepack pnpm smoke:runtime-v2:storage-write` passes on a temp HOME/DB.

## Ownership Status

- Import ownership: implemented.
- Write mirror ownership: implemented for legacy workspace/layout/message-history JSON writes.
- Read/default ownership: implemented in temp smoke for workspace/layout/message-history; production live mode is still not switched.
- Timeline/status live ownership: not switched. The new mode helpers only expose fail-closed rollout state.
- Rollback: set `CODEXMUX_RUNTIME_STORAGE_V2_MODE=off`; legacy JSON path remains intact.

## Remaining Gate

- Browser/Electron/Android sync invalidation evidence when SQLite becomes read owner.
- Keep timeline/status live ownership on separate phase gates.
