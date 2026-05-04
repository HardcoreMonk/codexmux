# 2026-05-05 Windows Integration Removal Handoff

## Scope

- Removed the Windows companion sync surface, Windows terminal bridge surface, source/sourceId session filters, dedicated page/API routes, helper scripts, hooks, UI controls, message copy, and unit tests tied to those paths.
- Session list and runtime v2 timeline list now use local Codex JSONL only.
- Existing legacy data under `~/.codexmux/remote/codex/` is not deleted automatically. Current codexmux ignores it; operators can remove it manually when no longer needed.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm test` | passed: 89 files / 428 tests |
| `corepack pnpm build` | passed; route list no longer includes the removed page/API routes |
| `corepack pnpm tsc --noEmit` | passed after regenerating stale `.next/dev/types` with `next dev` |
| `corepack pnpm lint` | passed |
| `corepack pnpm build:landing` | passed |
| `git diff --check` | passed |
| stale surface grep | no active references to removed stores/hooks/scripts/routes outside intentional rejection tests and legacy data notes |

## Notes

- `corepack pnpm dev` could not start because the live codexmux service lock was active on port `8122`; direct `next dev -p 18123` was used only to refresh Next dev route types and was stopped immediately.
- The path validator now rejects legacy remote JSONL paths.
- Persisted `session-index.json` entries from older builds that carry `source: "remote"` are filtered out on read.

## Follow-up

- Decide whether to provide an optional cleanup command or migration note for legacy `~/.codexmux/remote/codex/` data.
- Re-run platform smoke before the next release candidate: Electron attach/runtime v2, Android foreground/runtime v2, systemd deploy health.
- Keep runtime v2 timeline/status cutover work local-only unless a new ADR reintroduces a remote source model.
