# Claude CLI Work-State Detection

System that detects the in-progress state of the Claude CLI on the server, broadcasts it to the client over WebSocket, and reflects it in the UI indicators.

**Core principle**: `cliState` has a **single source of truth — hook events** (real Claude Code hooks + one hook-equivalent synthesized on the server from the JSONL interrupt marker). All transitions go through `deriveStateFromEvent`, and seq is monotonic per tab. The previous multi-source heuristics (JSONL-driven promotion, pane capture, client-side local derivation) have otherwise been removed; JSONL is only consulted for the synthetic `interrupt` event and for metadata (snippet, currentAction).

---

## State Definitions

### Claude Process State (`TClaudeStatus`)

State that determines whether the Claude CLI process is running inside a tmux pane. Managed independently from `cliState` and detected from two paths (terminal WS and timeline WS).

| State | Meaning |
| --- | --- |
| `unknown` | Not yet detected (initial value, terminal WS not connected) |
| `starting` | Claude process detected, session not ready (PID file/JSONL not present) |
| `running` | Claude process running + session confirmed |
| `not-running` | No Claude process |
| `not-initialized` | Claude CLI installed but `~/.claude` not created |
| `not-installed` | Claude CLI not installed |

Two detection paths:

| Path | Trigger | Server check | Sets value |
| --- | --- | --- | --- |
| Terminal WS `onTitleChange` | tmux title change | `/api/check-claude` → `isClaudeRunning()` | `starting` / `not-running` |
| Timeline WS | Session file change | `detectActiveSession()` | `running` / `not-running` |

Both paths write to the same `claudeStatus` field; the `claudeStatusCheckedAt` server timestamp prevents stale updates.

#### State Transition Guards

`setClaudeStatus` blocks the following transitions:

| Blocked transition | Reason |
| --- | --- |
| `running` → `starting` | `running` is the higher state (session confirmed); prevents downgrade |

Additionally, `claude-code-panel` / `mobile-claude-code-panel` block the following inside the `onSync` callback:

| Blocked transition | Reason |
| --- | --- |
| `starting` → `not-running` (via timeline) | The process was detected but the session is not yet ready. `not-running` via check-claude is still allowed |

### CLI Work State (`TCliState`)

State of the work in progress inside the Claude CLI. Only changed by deterministic derivation from hook events.

| State | Meaning | Trigger |
| --- | --- | --- |
| `busy` | Processing a user request | `prompt-submit` hook |
| `idle` | Response complete + acknowledged by user | `session-start` hook, synthetic `interrupt` event, or `dismissTab` |
| `ready-for-review` | Response complete, awaiting user ack | `stop` hook |
| `needs-input` | Permission prompt / awaiting user input | `notification` hook |
| `unknown` | Was `busy` before a server restart, recovery not finished | Awaiting `resolveUnknown` |
| `inactive` | Initial state when the Claude process is not running | Default on tab creation |
| `cancelled` | User is deleting the tab | Client-only local state |

### Transition Rules (`deriveStateFromEvent`)

Pure function. `src/lib/status-manager.ts`:

```ts
export const deriveStateFromEvent = (event: ILastEvent | null, fallback: TCliState): TCliState => {
  if (!event) return fallback;
  switch (event.name) {
    case 'session-start': return 'idle';
    case 'prompt-submit': return 'busy';
    case 'notification':  return 'needs-input';
    case 'stop':          return 'ready-for-review';
    case 'interrupt':     return 'idle';
  }
};
```

`'interrupt'` is the only event name that does not correspond to a real Claude Code hook. Claude CLI does not fire any hook when the user presses Esc mid-stream, so the JSONL watcher synthesizes one on the server when it sees a `[Request interrupted by user]` entry (see "Synthetic Interrupt Event").

**Exception**: if `prevState === 'cancelled'`, the state stays `cancelled` even when a hook arrives.

**`inactive` handling**: it is just a default value, not a non-overwritable state. Even when a new tab starts in `inactive`, the first `session-start` hook promotes it to `idle`. (Previously both `inactive` and `cancelled` blocked transitions, which caused a bug where "start new conversation" would be stuck on `Creating new conversation...`. The `inactive` block was removed for that reason.)

### Releasing `ready-for-review`

The `ready-for-review → idle` transition only happens through the **`dismissTab` action**:

- The user focuses the tab (auto-dismiss)
- An explicit dismiss from the notification sheet

Hooks and the JSONL watcher do not cause this transition.

### Releasing `needs-input` (User Selection Ack)

When the user selects an option on a permission prompt, Claude resumes work but does not fire a `prompt-submit` hook. Therefore the `needs-input → busy` transition cannot be detected from hooks alone, so the client sends an explicit ack.

**Flow**:

1. `PermissionPromptItem.handleSelect` — after `sendSelection` succeeds, sends a `status:ack-notification` WS message with the current `lastEvent.seq`
2. `StatusManager.ackNotificationInput(tabId, seq)`:
   - If `cliState !== 'needs-input'`, ignore
   - If `lastEvent.name !== 'notification'` or `lastEvent.seq !== seq`, ignore (a newer hook has already arrived)
   - Otherwise: `applyCliState(busy)` + `persistToLayout` + `broadcastUpdate`

**Meaning of the seq guard**: if another hook (consecutive `notification` or `stop`) arrives before the ack does, `entry.lastEvent.seq` increments and no longer matches the ack → ignored. Since the server has already moved to a newer state, the late ack cannot overwrite it (race protection).

`eventSeq` is not incremented — this is a client action, not a hook event. The next real hook will arrive with a value larger than the current seq and be processed normally.

### Tab Display State (`TTabDisplayStatus`)

`selectTabDisplayStatus(tabs, tabId)` maps `cliState` to a UI display value:

| cliState | Display state | UI indicator |
| --- | --- | --- |
| `busy` | `busy` | Spinner |
| `ready-for-review` | `ready-for-review` | Purple dot (pulse) |
| `needs-input` | `needs-input` | Amber dot (pulse) |
| `unknown` | `unknown` | Gray dot (static) |
| `idle` | `idle` | None |
| `inactive` | `idle` | None |
| `cancelled` | (component-specific) | — |

### Session View (`TSessionView`)

Derived state that decides which screen the Claude panel shows.

| State | Condition |
| --- | --- |
| `loading` | `claudeStatus === 'starting'`, or `claudeStatus === 'running' && isTimelineLoading`, or `isResuming` |
| `restarting` | `isRestarting === true` |
| `not-installed` | `claudeStatus === 'not-installed'` |
| `timeline` | `claudeStatus === 'running' && !isTimelineLoading` |
| `inactive` | None of the above |

---

## Tab Store (`useTabStore`)

A Zustand store that manages all tab state as `Record<tabId, ITabState>`.

### Key Fields

| Field | Type | Source | Purpose |
| --- | --- | --- | --- |
| `terminalConnected` | `boolean` | Terminal WS | Whether input is allowed |
| `claudeStatus` | `TClaudeStatus` | Terminal/Timeline WS | Decides the session view |
| `claudeStatusCheckedAt` | `number` | Server timestamp | Prevent stale updates |
| `cliState` | `TCliState` | Server WS (`status:update` / hook derivation) | Work state, tab indicator |
| `lastEvent` | `ILastEvent \| null` | Server WS (`status:hook-event`) | Track event order, trigger PermissionPrompt re-fetch |
| `eventSeq` | `number` | Server WS | Monotonic counter to prevent reordering |
| `isTimelineLoading` | `boolean` | Whether the timeline WS init has been received | Branch into the `loading` session view |
| `isRestarting` | `boolean` | User "new conversation" action | Branch into the `restarting` session view |
| `isResuming` | `boolean` | Session resume action | Branch into the `loading` session view |
| `compactingSince` | `number \| null` | `pre-compact`/`post-compact` hooks | Drives the timeline compacting indicator |

### Write Paths

| Path | Action | Notes |
| --- | --- | --- |
| Server sync (`status:sync`) | `syncAllFromServer` | Initial load, `cancelled` protected |
| Server update (`status:update`) | `updateFromServer` | Metadata + cliState, `cancelled` protected, **stale seq preserves cliState/busySince/readyForReviewAt/dismissedAt** |
| Server event (`status:hook-event`) | `applyHookEvent` | Updates only `lastEvent`/`eventSeq`, prevents seq reordering |
| User dismiss | `dismissTab` | Local immediate `ready-for-review → idle` + WS `status:tab-dismissed` |
| User tab delete | `cancelTab` | `cliState = 'cancelled'`, local only |

**The client never propagates `cliState` back to the server.** The legacy `notifyCliState` / `status:cli-state` paths have been removed.

### Stale Seq Guard in `updateFromServer`

When `status:update` arrives with `update.eventSeq < existing.eventSeq`, the broadcast is a metadata-only message that was queued behind a newer seq-bearing event. In that case `updateFromServer` preserves `cliState`, `busySince`, `readyForReviewAt`, and `dismissedAt` from the existing state and merges only the non-state metadata fields. This prevents a late `busy` metadata broadcast from clobbering an `idle` state that a higher-seq `interrupt` (or any future event) already set.

### `isCliIdle()` Helper

Both `idle` and `ready-for-review` mean "waiting for work", so:

```ts
export const isCliIdle = (cliState: TCliState): boolean =>
  cliState === 'idle' || cliState === 'ready-for-review';
```

Used in: `WebInputBar` input mode, restart-complete detection, dismiss-on-focus.

---

## Claude Code Hook System

Uses Claude Code's [Hook](https://docs.anthropic.com/en/docs/claude-code/hooks) feature to receive Claude's work state immediately.

### Hook Settings

`ensureHookSettings()` runs at server startup and creates `~/.purplemux/hooks.json`.

| File | Purpose |
| --- | --- |
| `~/.purplemux/hooks.json` | Hook event → shell script mapping |
| `~/.purplemux/status-hook.sh` | Script that POSTs to the server |
| `~/.purplemux/port` | Current server port (referenced by the script) |

### Hook Event Mapping

| Claude Code Hook | Sent event | Result |
| --- | --- | --- |
| `SessionStart` | `session-start` | → `idle` |
| `UserPromptSubmit` | `prompt-submit` | → `busy` |
| `Notification` | `notification` | → `needs-input` (filtered by notificationType) |
| `Stop` | `stop` | → `ready-for-review` |
| `StopFailure` | `stop` | → `ready-for-review` |
| `PreCompact` | `pre-compact` | → `compactingSince = now` (cliState unchanged) |
| `PostCompact` | `post-compact` | → `compactingSince = null` (cliState unchanged) |
| _(synthesized by JSONL watcher)_ | `interrupt` | → `idle` (see below) |

`pre-compact`/`post-compact` do not touch `cliState`/`eventSeq`/`lastEvent`; they only set the separate `compactingSince` field. That value drives the timeline-view's compacting indicator (60s window). To handle a missing `post-compact`, the server auto-clears it via a `COMPACT_STALE_MS = 60s` timer.

### Notification Filtering (`INPUT_REQUESTING_NOTIFICATION_TYPES`)

Claude's `Notification` hook fires at many moments, but only cases that need user input should transition to `needs-input`. The whitelist in `status-manager.ts`:

```ts
const INPUT_REQUESTING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'worker_permission_prompt']);
```

The hook script parses `notification_type` from the stdin JSON and includes it in the payload, so the server ignores types that are not in the whitelist (e.g. idle notifications) without transitioning state.

### Hook Script

`~/.purplemux/status-hook.sh` is generated from `HOOK_SCRIPT_CONTENT` in `hook-settings.ts`. Core behavior:

- Looks up the session name with `tmux display-message` (so the server knows which tab)
- If `event === 'notification'`, parses `notification_type` from stdin JSON and includes it in the payload
- POSTs `{ event, session, notificationType? }` to `/api/status/hook` via `curl`

### Synthetic Interrupt Event

Claude CLI aborts a streaming turn locally when the user presses Esc and writes `[Request interrupted by user]` into the transcript JSONL without firing any hook (`query.ts:createUserInterruptionMessage`). To recover `busy → idle` without leaving the tab stuck, `onJsonlFileChange` synthesizes a hook-equivalent `interrupt` event:

1. `scanLines` sets `interrupted: true` when the last non-sidechain user entry's first content block starts with `[Request interrupted by user` (see `INTERRUPT_PREFIX`). This naturally handles the "user typed a new prompt right after Esc" case — the new user entry becomes the last match and suppresses the synthesis.
2. `onJsonlFileChange` fires `updateTabFromHook(tmuxSession, 'interrupt')` when **all** of the following hold:
   - `entry.cliState === 'busy'`
   - `scan.lastEntryTs > entry.lastInterruptTs` (dedup: new interrupt line, not a previously processed one)
   - `scan.lastEntryTs > entry.lastEvent.at` (race guard: no real hook arrived after the interrupt was written)
3. `updateTabFromHook` goes through the usual path — bump `eventSeq`, broadcast `status:hook-event`, apply `deriveStateFromEvent → 'idle'`, `persistToLayout`, `status:update`. Push notifications are skipped because only `ready-for-review`/`needs-input` trigger push.

The `lastEvent.at` comparison protects against a narrow race: `prompt-submit` hook POST arriving at the server before the JSONL FS event fires for the interrupt line. Without the guard, the synthetic interrupt could fire after `prompt-submit` was already processed and drag the state back to `idle`.

After transitioning to `idle`, `applyCliState` stops the JSONL watcher (idle is not a watched state). It will be restarted by the next `prompt-submit` hook.

### Agent Tab Hooks (Reference)

Normal tabs go through the shell script above, but **agent tabs / brain sessions** use `type: 'http'` hooks generated by `buildAgentTabHookSettings` / `buildAgentBrainHookSettings`, which POST directly to `/api/agent-rpc/{agentId}/...` (only `Stop` / `StopFailure`). They are separate from the StatusManager path and are out of scope here.

### Hook API Endpoint

`/api/status/hook` — localhost only. Receives `event` and `session` and calls `StatusManager.updateTabFromHook()`. If `event` is `poll` or `session` is missing, it triggers a full poll.

### Processing Flow (`updateTabFromHook`)

```
hook received
  │
  ├─ look up tabId/entry (return if missing)
  ├─ check event whitelist (session-start/prompt-submit/notification/stop)
  │
  ├─ entry.eventSeq += 1
  ├─ entry.lastEvent = { name, at: Date.now(), seq }
  ├─ broadcast status:hook-event (seq + name + at)
  │
  ├─ newState = deriveStateFromEvent(entry.lastEvent, prevState)
  │   (if prevState === 'cancelled', stays the same)
  │
  └─ if prevState !== newState:
      ├─ applyCliState(tabId, entry, newState)
      ├─ persistToLayout(entry)
      └─ broadcast status:update
```

After a `stop` event, `refreshSnippet` asynchronously reads the final JSONL state and broadcasts `currentAction` / `lastAssistantSnippet` (with a 500ms delay).

### Event Shadowing (`status:hook-event`)

`status:hook-event` is **always** broadcast even if `cliState` doesn't change (e.g. consecutive `notification` while already in `needs-input`). The client only applies it in `applyHookEvent` when `event.seq > prev.eventSeq`, preventing reordering.

`PermissionPromptItem` subscribes to `lastEvent.seq` as a `useEffect` dep so that consecutive permission prompts auto-refetch new options:

```
Consecutive permission prompts:
prompt-submit → lastEvent{name:'prompt-submit', seq:1} → busy
notification  → lastEvent{name:'notification', seq:2}  → needs-input
user selection
notification  → lastEvent{name:'notification', seq:3}  → needs-input (same cliState, seq++)
stop          → lastEvent{name:'stop', seq:4}          → ready-for-review
```

---

## Server Restart Policy

The only state that can be lost across a server restart is `busy` (Claude might fire `stop`/`notification` while the server is down). All other states have "the ball in the user's court", so no automatic transitions occur and the persisted value can stay as-is.

`StatusManager.scanAll` reads the persisted `cliState` from the layout:

| Persisted cliState | After restart | Follow-up |
| --- | --- | --- |
| `busy` | **`unknown`** | `resolveUnknown` scheduled immediately |
| `needs-input` | unchanged | JSONL watcher started |
| Others | unchanged | — |

### `resolveUnknown` — Background Recovery for Unknown Tabs

For tabs converted to `unknown` from `busy`, only definitive signals are used to promote:

1. **Claude process check** — `isClaudeRunning(panePid)` fails → confirm `idle` (silent, no push)
2. **JSONL tail check** — `checkJsonlIdle` returns `idle && !stale && lastAssistantSnippet` → confirm `ready-for-review` (silent)
3. **Otherwise** → keep `unknown`, wait for the next hook

**Pane capture is not used.** A previous permission prompt left in the scrollback could be misread as the current one.

JSONL watcher is also started in the `unknown` state — it does not change `cliState`, but `currentAction` / `lastAssistantMessage` metadata keep updating.

### Busy Stuck Safety Net

If a `busy` state lasts longer than `BUSY_STUCK_MS` (**10 minutes**) and the Claude process has died, silently recover to `idle`. Performed inside the metadata poll loop. Designed to handle dropped `stop` hooks (e.g. SIGKILL).

---

## JSONL Watcher (Metadata Only)

For tabs in `busy` / `needs-input` / `unknown` / `ready-for-review`, an `fs.watch` is set on the JSONL file and `checkJsonlIdle` is called on file changes.

| Trigger | Action |
| --- | --- |
| Start | Entering `busy`/`needs-input`/`unknown` (hook path or scanAll) |
| Process | Updates only `currentAction`, `lastAssistantMessage`, reset signals → broadcast `status:update` |
| Release | Transition to `idle`/`inactive`, tab deletion, shutdown |

**Key**: the JSONL watcher normally touches only metadata. The one exception is the synthetic `interrupt` event (see "Synthetic Interrupt Event") — it is the only path where the JSONL watcher drives a `cliState` transition, and it does so by going through the standard `updateTabFromHook` pipeline rather than bypassing it. There used to be an automatic `busy → ready-for-review` promotion path, but that was removed; only the `stop` hook triggers `ready-for-review`.

---

## Metadata Poll

A **metadata-only** poll that does not touch `cliState`.

### Cadence

| Tab count | Interval |
| --- | --- |
| 1–10 | 30s |
| 11–20 | 45s |
| 21+ | 60s |

### Cost per poll

| Operation | Count |
| --- | --- |
| `tmux list-panes -a` | 1 (single batch) |
| Filesystem reads (workspace/layout JSON) | workspace count + α |
| Process check (`pgrep`/`ps`) | only for tabs caught by the busy stuck check |
| JSONL tail read | 1 per newly discovered tab (existing tabs go through the watcher path) |

### What Each Poll Does

- New tab found → `readTabMetadata` loads initial metadata + creates entry
  - Persisted `cliState === 'busy'` → converted to `'unknown'` + `resolveUnknown` scheduled
- Existing tab → updates process/ports/title/summary (cliState untouched)
- Busy stuck check → 10 minutes elapsed + Claude process dead → silent `idle`
- Deleted tabs → cleanup + `broadcastRemove`

Removing the `cliState` decision and the `hasPermissionPrompt` check has reduced poll cost by roughly 80% compared to pre-Phase 1.

---

## Data Flow

```
[Claude Code Hook]
  ~/.purplemux/status-hook.sh
  └─ curl POST /api/status/hook
     │
     ▼
[/api/status/hook] (localhost only)
  └─ StatusManager.updateTabFromHook(session, event)
     │
     ├─ entry.eventSeq++
     ├─ entry.lastEvent = { name, at, seq }
     ├─ broadcast status:hook-event
     ├─ deriveStateFromEvent → newState
     └─ if prevState !== newState:
         ├─ applyCliState (idempotent guard + push notification)
         ├─ persistToLayout (layout JSON)
         └─ broadcast status:update
             │
             ▼
[JSONL Watcher] (parallel)
  Watches only busy/needs-input/unknown/ready-for-review tabs
  On file change: checkJsonlIdle → updates currentAction/lastAssistantSnippet
  └─ broadcast status:update (cliState unchanged)
             │
             ▼
[Metadata Poll] (parallel, 30–60s)
  - Detect new / removed tabs
  - Update process/ports/summary
  - Busy stuck safety net
  - Persisted busy → unknown conversion + resolveUnknown
             │
             ▼
[Status WebSocket] /api/status
  Server → client: status:sync / status:update / status:hook-event
  Client → server: status:tab-dismissed / status:ack-notification / status:request-sync
             │
             ▼
[Zustand store] useTabStore
  syncAllFromServer / updateFromServer (metadata + cliState)
  applyHookEvent (lastEvent/eventSeq, prevents seq reordering)
  dismissTab / cancelTab (local actions)
             │
             ▼
[UI components]
  TabStatusIndicator         tab-bar indicator
  WorkspaceStatusIndicator   sidebar workspace
  PermissionPromptItem       timeline, re-fetched via lastEvent.seq
  NotificationSheet          notification sheet
  Bell icon                  sidebar + app header
  useBrowserTitle            browser tab title
```

### Terminal WS Path (Process Detection, Independent of cliState)

```
tmux title change → onTitleChange
  ├─ formatTabTitle → updates tab display name
  └─ fetch /api/check-claude
      └─ isClaudeRunning(panePid)
          └─ setClaudeStatus(tabId, 'starting' | 'not-running')
```

### Timeline WS Path (Sessions + Entries)

```
Timeline WS connects → server runs detectActiveSession
  ├─ session-changed → reflected in claudeStatus
  ├─ timeline:init → entries received, isTimelineLoading = false
  └─ timeline:append → entries appended
      └─ useTimeline.onSync callback
          ├─ setClaudeStatus(tabId, status, checkedAt)
          └─ setTimelineLoading(tabId, loading)
```

`useTimeline` **no longer derives `cliState` locally** (the old `deriveCliState` was removed). The timeline WS handles only metadata (entries, summaries); `cliState` is updated solely via the hook path.

---

## Logging Configuration

### Global Level

```bash
LOG_LEVEL=debug pnpm dev      # all groups
```

### Per-module Level

The `LOG_LEVELS` env var splits levels per group. `createLogger(name)` applies the group's level to a child logger.

```bash
# Trace only the Claude Code hook behavior in debug
LOG_LEVELS=hooks=debug pnpm dev

# Multiple groups at once
LOG_LEVELS=hooks=debug,status=warn pnpm dev
```

Main groups:

| Group | Source | Debugging target |
| --- | --- | --- |
| `hooks` | `api/status/hook.ts`, `status-manager.ts` (`hookLog`) | Hook receive/process/transition |
| `status` | `status-manager.ts` (`log`) | Poll, JSONL watcher, broadcast |
| `tmux` | `lib/tmux.ts` | tmux command execution |

With `hooks=debug` you see, for example:

- `[hooks] received { event, session }` — hook endpoint received
- `[hooks] no tabId for session` / `no entry for tab` — failure cases
- `[hooks] processed { tabId, event, seq, prevState, newState, transition }` — processing result

### How It Works

`src/lib/logger.ts` parses `LOG_LEVELS`, sets the root logger's level to the minimum across groups, then `createLogger(name)` applies each group's level to its child logger. Pino requires the root to be open down to the lowest level for child filtering to work.

---

## Related Files

### Types

| File | Description |
| --- | --- |
| `src/types/status.ts` | `ITabStatusEntry`, `ILastEvent`, `TEventName`, `TTabDisplayStatus`, WebSocket messages |
| `src/types/timeline.ts` | `TCliState`, `TClaudeStatus` |

### Server

| File | Description |
| --- | --- |
| `src/lib/status-manager.ts` | `deriveStateFromEvent`, `updateTabFromHook`, `applyCliState`, `resolveUnknown`, `readTabMetadata`, busy stuck safety net, metadata poll, JSONL watcher |
| `src/lib/status-server.ts` | `/api/status` WebSocket handler |
| `src/lib/hook-settings.ts` | Hook settings file generation, script management |
| `src/pages/api/status/hook.ts` | Hook API endpoint (localhost only) |
| `src/lib/session-detection.ts` | `detectActiveSession`, `isClaudeRunning` |
| `src/pages/api/check-claude.ts` | Claude process detection API |
| `src/lib/layout-store.ts` | `updateTabCliStatus`, etc. (layout JSON writes) |
| `src/lib/logger.ts` | `LOG_LEVELS` parsing + per-group pino child |

### Client

| File | Description |
| --- | --- |
| `src/hooks/use-tab-store.ts` | Zustand tab store, `applyHookEvent`, `selectTabDisplayStatus` |
| `src/hooks/use-claude-status.ts` | Status WebSocket, `status:hook-event` / `status:update` handling, `dismissTab` |
| `src/hooks/use-timeline.ts` | Timeline WS data (no cliState derivation) |
| `src/hooks/use-web-input.ts` | Input mode decision (`unknown` allows input) |
| `src/hooks/use-native-notification.ts` | Desktop native notifications |
| `src/hooks/use-browser-title.ts` | Browser title attention count |

### UI Components

| File | Role |
| --- | --- |
| `src/components/features/terminal/tab-status-indicator.tsx` | Tab-bar indicator |
| `src/components/features/terminal/workspace-status-indicator.tsx` | Sidebar workspace dot |
| `src/components/features/mobile/mobile-workspace-tab-bar.tsx` | Mobile tab bar |
| `src/components/features/timeline/permission-prompt-item.tsx` | Permission prompt UI (`lastEvent.seq` subscriber) |
| `src/components/features/terminal/notification-sheet.tsx` | Notification sheet + `useNotificationCount` |

---

## Notification System

### Notification Sheet (`NotificationSheet`)

Shown as a Sheet when the Bell icon is clicked. Four sections: in-progress (`busy`), awaiting input (`needs-input`), review (`ready-for-review`), done (`done`).

The done section shows tabs that were acknowledged via `dismissTab` (have a `dismissedAt` value and `cliState` is `idle`/`inactive`), excluding the currently active tab, sorted by recency. When new work starts on such a tab, `dismissedAt` is reset and the tab leaves the list.

### Count Aggregation Scope

The `useNotificationCount` hook walks all tabs and aggregates `busy` / `needs-input` / `ready-for-review`. The currently active tab is included, so the sidebar, app header, and notification sheet share the same count and the number does not drop just because you opened the tab.

### `unknown` Handling

Tabs in `unknown` are **excluded** from both attention and busy counts. This is intentional, so the indeterminate state right after a restart does not raise a notification. Only the sidebar badge shows quietly as a gray dot.

### Push Notification Policy

Auto-fired from the `applyCliState` call path:

- `newState === 'ready-for-review'` → web push "Task Complete"
- `newState === 'needs-input'` → web push "Input Required"

The idempotent guard at the top of the function (`prevState === newState`) blocks duplicate calls, so callers don't have to track state.

"Silent" paths such as `resolveUnknown` / `dismissTab` / busy-stuck safety net / server restart recovery suppress the push by passing `{ silent: true }`.
