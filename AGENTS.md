# Agent Instructions

AI-generated code should look as if a senior engineer wrote it. Avoid excessive
comments, unnecessary explanations, and AI-specific patterns.

Always respond in the same language the user wrote in. Project rules like
"commit messages in English" apply only to the artifacts they describe.

## Project Overview

- Framework: Next.js Pages Router.
- Package manager: pnpm.
- Styling: Tailwind CSS v4 and shadcn/ui.
- Language: TypeScript.
- Product target: codexmux is a Codex-focused web session manager.

## Core Rules

- Use the Pages Router, not the App Router.
- Do not add `"use client"`.
- `src/proxy.ts` is the auth middleware path for this Next.js version.
- Use `@/` imports instead of relative parent paths.
- Keep filenames lowercase with dashes.
- Prefer arrow functions over `function` declarations.
- Prefix interfaces with `I` and union/alias types with `T`.
- Use lucide-react for icons unless an existing icon component is already local.
- Use react-hook-form, zod, and @hookform/resolvers for forms.
- Use dayjs for date/time handling.
- Use sonner for notifications.

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm tsc --noEmit
```

Use pnpm for package management. The shadcn CLI is the one exception:

```bash
npx shadcn@latest add <component-name>
```

## Codex And Terminal Rules

When dealing with terminal process names, paths, or Codex session state, reuse
existing utilities. Do not call `pgrep`, `ps`, or `lsof` directly.

Client helpers:

| Function | File | Purpose |
| --- | --- | --- |
| `parseCurrentCommand(raw)` | `src/lib/tab-title.ts` | Extract process name from title |
| `isShellProcess(raw)` | `src/lib/tab-title.ts` | Detect whether the foreground process is a shell |
| `formatTabTitle(raw)` | `src/lib/tab-title.ts` | Convert to tab display name |
| `onTitleChange` | `src/hooks/use-terminal.ts` | Receive title change events |

Server helpers:

| Function | File | Purpose |
| --- | --- | --- |
| `getPaneCurrentCommand(session)` | `src/lib/tmux.ts` | Get foreground process name |
| `getSessionCwd(session)` | `src/lib/tmux.ts` | Get current working directory |
| `getSessionPanePid(session)` | `src/lib/tmux.ts` | Get the pane shell PID |
| `checkTerminalProcess(session)` | `src/lib/tmux.ts` | Safe shell check before resume |
| `isCodexRunning(panePid)` | `src/lib/codex-session-detection.ts` | Check whether Codex is running under the pane |
| `detectActiveCodexSession(panePid)` | `src/lib/codex-session-detection.ts` | Detect active Codex session metadata |
| `watchCodexSessions(panePid, cb)` | `src/lib/codex-session-detection.ts` | Watch Codex session start/stop |

## Shared State

The custom server (`server.ts`) and Next.js API routes run in separate module
graphs inside one Node process. Shared singleton state must live on
`globalThis`, guarded against reinitialization.

```typescript
const g = globalThis as unknown as { __ptFooStore?: Map<string, IFoo> };
if (!g.__ptFooStore) g.__ptFooStore = new Map();
const store = g.__ptFooStore;
```

Preserve nearby key conventions. New shared state should generally use `__pt`
plus a PascalCase name. Keep existing `__codexmux*` or `__cmux*` keys as-is when
editing nearby code.

## Documentation

Complex topics live under `docs/`:

| Document | Purpose |
| --- | --- |
| `docs/STATUS.md` | Codex work-state detection and status flow |
| `docs/TMUX.md` | tmux, terminal management, and WebSocket flow |
| `docs/DATA-DIR.md` | `~/.codexmux/` directory structure |
| `docs/STYLE.md` | Theme and color usage rules |

When modifying status-related code (`TCliState`, `ITabState`, `StatusManager`,
`selectSessionView`, `agentSessionId`, provider detection, etc.), update
`docs/STATUS.md` together.

## Comment Policy

Only add comments when they explain why something non-obvious is needed. Avoid
comments that restate what the code already says.

## Refactoring Exclusions

Do not refactor third-party component folders unless required:

| Directory | Description |
| --- | --- |
| `src/components/ui/` | shadcn/ui components |
| `src/components/ai-elements/` | AI Elements components |

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.
<!-- END:nextjs-agent-rules -->
