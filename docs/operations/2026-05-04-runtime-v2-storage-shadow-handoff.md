# Runtime V2 Storage Shadow Handoff

Date: 2026-05-04 KST

## Summary

- Added `src/lib/runtime/storage-shadow-compare.ts`.
- Added `corepack pnpm smoke:runtime-v2:storage-shadow`.
- The smoke starts a temp HOME/DB server, creates a workspace through the legacy route, creates a runtime v2 plain terminal tab through the app-surface route, then compares:
  - expected: legacy JSON layout `runtimeVersion: 2` tab projection
  - actual: SQLite runtime layout projection from `/api/v2/workspaces/:workspaceId/layout`
- The first slice compares the relative order inside the v2 tab subset. It does not claim full storage migration parity.

## Verification

- `corepack pnpm test tests/unit/lib/runtime/storage-shadow-compare.test.ts`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm smoke:runtime-v2:storage-shadow`

Smoke output:

```json
{
  "ok": true,
  "expectedRuntimeV2Tabs": 1,
  "actualRuntimeV2Tabs": 1,
  "checks": [
    "cookie-login",
    "workspace-create",
    "runtime-v2-tab-create",
    "shadow-compare",
    "workspace-delete"
  ]
}
```

## Remaining Gate

- Full legacy `runtimeVersion: 1` tab import, workspace group/sidebar state, split pane import, and message history import/default-read are now covered by later storage slices.
- Workspace group/order mutation, full layout mutation ownership, tab rename/patch, and production live default rollout remain separate gates.
