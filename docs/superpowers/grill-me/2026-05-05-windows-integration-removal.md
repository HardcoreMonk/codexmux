# Windows Integration Removal Plan Grilling

## Context

Spec:
`docs/superpowers/specs/2026-05-05-windows-integration-removal-design.md`

User approved option A: full removal of Windows sync, terminal bridge, UI, API,
scripts, tests, and docs.

## Grill-Me Questions And Decisions

### 1. Should existing `~/.codexmux/remote/codex/` files be deleted automatically?

Recommended answer: No. Automatic deletion would turn feature removal into a
data-destructive migration. The app should stop reading those files and document
manual cleanup instead.

Decision: Do not delete remote data automatically.

### 2. Should removed API routes return `410 Gone` for compatibility?

Recommended answer: No. The user requested deletion, and keeping route handlers
would preserve a dead public surface. Normal Next.js 404 behavior is clearer and
requires less maintenance.

Decision: Delete the route files and custom WebSocket path.

### 3. Should `source=remote` remain as an ignored query option?

Recommended answer: No. Keeping the remote filter type would preserve a hidden
contract. The session API should become local-only and not advertise remote
source filtering.

Decision: Remove remote source filtering from app types and UI. Any stale client
query should effectively receive the same local-only list or be cleaned up by
the API parser removal.

### 4. Is this reversible?

Recommended answer: Yes, through git revert. Because remote data is not deleted,
restoring the scripts, API routes, stores, and index merge can make previously
synced sessions visible again.

Decision: Use normal git rollback. No data migration rollback is required.

## Result

No blocking design questions remain. The implementation plan should focus on
first deleting isolated Windows-only files, then simplifying shared local-only
session/timeline paths, then updating tests and docs.
