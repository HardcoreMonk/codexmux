# Windows Integration Removal Design

## Context

codexmux currently treats Windows 11 as a companion client. That support spans
JSONL sync, a separate terminal bridge, UI filters/buttons, API routes, custom
server WebSocket handling, tests, and public documentation.

The approved user request is option A: remove the Windows device integration
completely. This is a user-visible behavior change and a multi-file cleanup, so
the change follows the full project lifecycle.

## Goal

Remove Windows device integration from the product surface and return Codex
session history, timeline viewing, and terminal control to local macOS/Linux
server state only.

## Non-Goals

- Do not remove generic platform labels or shortcuts where Windows remains a
  browser keyboard platform.
- Do not remove Electron or Android shell support.
- Do not delete user data from `~/.codexmux/remote/codex/` automatically.
- Do not change tmux terminal behavior, Codex resume behavior, or runtime v2
  terminal behavior except where they referenced Windows integration.

## Scope

Remove these Windows integration surfaces:

- `windows:codex-sync`, `windows:terminal-bridge`, and `smoke:windows-sync`
  package scripts.
- Windows companion and bridge scripts under `scripts/windows-*` and the
  Windows sync smoke helper.
- `/api/remote/codex/*` and `/api/remote/terminal/*` API routes.
- Browser WebSocket path `/api/remote/terminal` and its custom server handler.
- `/windows-terminal` page and remote terminal React surface.
- Remote Codex source hooks, remote terminal hooks, stores, server helpers,
  and types.
- Windows source filters, source summaries, and Windows terminal launch button
  from session list UI.
- Session index merge of `~/.codexmux/remote/codex/**/*.jsonl`.
- Path validation that allowed `~/.codexmux/remote/codex/**/*.jsonl` timeline
  subscriptions.
- Tests that only verify Windows sync, remote Codex source, or Windows terminal
  bridge behavior.
- README, internal docs, operation docs, landing docs, and locale messages that
  describe Windows device integration as supported.

## Architecture

Session discovery becomes local-only:

```text
~/.codex/sessions/**/*.jsonl
  -> src/lib/session-index.ts
  -> src/pages/api/timeline/sessions.ts
  -> session list UI
```

Timeline subscriptions remain generic enough to open allowed local Codex JSONL
files, but `src/lib/path-validation.ts` will only allow paths below
`~/.codex/sessions/`. Remote JSONL copies under `~/.codexmux/remote/codex/` will
not be indexed or opened by the app.

Terminal control remains the existing tmux-backed `/api/terminal` path and
runtime v2 terminal path. The Windows bridge command queue and fanout server are
removed entirely.

## UI Behavior

The session list keeps the dense operational list with local session count,
refresh, load more, and new conversation controls. It no longer shows:

- all/local/Windows segmented source filters,
- per-Windows-source filter chips,
- Windows source sync summary,
- Windows terminal button.

Selecting a session always either resumes a local Codex session or opens a local
JSONL path already owned by the local session index. The mobile input bar no
longer needs to hide itself for Windows read-only timelines because remote
timelines no longer exist.

## API And Server Behavior

Delete remote routes rather than keeping compatibility tombstones. Requests to
the removed routes will fall through to Next.js 404 behavior:

- `POST /api/remote/codex/sync`
- `GET /api/remote/codex/sources`
- `POST /api/remote/terminal/register`
- `GET /api/remote/terminal/commands`
- `POST /api/remote/terminal/output`
- `GET /api/remote/terminal/sources`
- browser WebSocket `/api/remote/terminal`

This is intentional because the feature is removed, not deprecated.

## Data Handling

Existing files under `~/.codexmux/remote/codex/` are left untouched. The app
will stop reading them. Documentation will describe those files as inert
leftover data that can be deleted manually if the operator wants to reclaim
space.

`session-index.json` remains valid as a local session metadata cache. During the
next refresh, remote sessions disappear from the in-memory snapshot and the
persisted index is rewritten with local sessions only.

## Documentation

Documentation should describe supported server platforms as macOS and Linux.
Windows should no longer be documented as a companion client for Codex JSONL sync
or terminal bridge.

Docs to update include README, internal architecture/status/data/testing/runtime
docs, follow-up backlog, operation handoff notes, landing docs across locales,
and terminal locale messages.

`docs/WINDOWS.md` should be deleted unless another non-integration Windows topic
remains. If deleted, remove it from `docs/README.md`.

## Tests And Verification

Targeted tests should cover the local-only behavior:

- session index no longer reads remote Codex sidecars,
- timeline path validation rejects `~/.codexmux/remote/codex/**/*.jsonl`,
- session list rendering has no remote filter/button expectations,
- timeline sessions API ignores removed remote query behavior or treats it as
  local-only.

Full verification:

```bash
corepack pnpm test
corepack pnpm tsc --noEmit
corepack pnpm build
corepack pnpm build:landing
git diff --check
```

## Rollback

Rollback is a normal git revert of the implementation commit. Because the
implementation does not delete `~/.codexmux/remote/codex/`, a rollback can make
previously synced remote sessions visible again if the scripts and API routes
are restored.

## Risks

- Documentation drift is the largest risk because Windows support is mentioned
  in README, internal docs, operation notes, and localized landing docs.
- Removing remote fields from shared timeline types may affect tests or UI
  assumptions that are not obviously Windows-specific.
- Cached `session-index.json` may contain remote sessions until the next index
  refresh rewrites it. This is acceptable if startup refresh remains active.

## Spec Self-Review

- Placeholder scan: no unresolved placeholder markers remain.
- Consistency check: UI, API, data, and docs all point to complete removal.
- Scope check: this is one implementation plan because all changes remove one
  product capability.
- Ambiguity check: existing remote data is not automatically deleted; removed
  routes return normal 404 behavior.

## Plan Design Review

This review applies app UI rules, not landing-page visual rules. The change
removes UI and documentation surface rather than adding a new screen.

### What Already Exists

- `SessionListView` already owns session list hierarchy, refresh, pagination,
  and new conversation controls.
- `MobileAgentPanel` already switches between session list, timeline, check,
  and input surfaces.
- Existing shadcn/ui `Button`, `TooltipProvider`, Tailwind v4 tokens, and
  `next-intl` terminal messages remain the UI vocabulary.

### Not In Scope

- Redesigning the session list layout. Rationale: removal should keep the
  existing dense operational screen stable.
- Adding an unsupported-Windows callout. Rationale: removed features should not
  keep attracting attention in product UI.
- Creating a new migration UI for old remote data. Rationale: automatic cleanup
  is explicitly out of scope, and manual cleanup belongs in docs.

### Review Passes

| Pass | Initial | Final | Result |
| --- | ---: | ---: | --- |
| Information Architecture | 8 | 10 | Session list becomes local-only; Windows controls and docs links are removed. |
| Interaction State Coverage | 8 | 10 | Loading, empty, error, success, and pagination states remain existing local session states. |
| User Journey | 8 | 10 | Users see only supported local sessions and no dead Windows affordances. |
| AI Slop Risk | 10 | 10 | No new decorative or marketing UI is introduced. |
| Design System Alignment | 10 | 10 | Existing app components and messages are reused or deleted. |
| Responsive And Accessibility | 9 | 10 | Removing chips/buttons reduces overflow risk on mobile; no new focus targets are added. |
| Unresolved Decisions | 10 | 10 | No unresolved design decisions remain. |

Overall design score: 9/10 to 10/10.

### Interaction State Table

| Feature | Loading | Empty | Error | Success | Partial |
| --- | --- | --- | --- | --- | --- |
| Session list | Existing skeleton/spinner | Existing empty session view | Existing retry error | Local sessions listed | Existing load-more spinner |
| Timeline open | Existing timeline loading | Existing empty init | Existing timeline error | Local JSONL entries shown | Existing incremental append/load-more |
| Docs | Not applicable | Not applicable | Broken links caught by build/search | Windows integration removed from docs | Localized docs updated per file |

### Design Review Completion Summary

Plan is design-complete. Run implementation verification and a post-diff review
after code/docs changes land.
