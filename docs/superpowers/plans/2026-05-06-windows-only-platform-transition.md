# Windows-only Platform Transition Plan

> **For agentic workers:** REQUIRED SUB-SKILL before implementation:
> `superpowers:writing-plans` plus `plan-eng-review`. Use
> `improve-codebase-architecture` only for candidates explicitly accepted in this
> plan. Do not dispatch sub-agents unless the user explicitly asks for delegated
> or parallel agent work.

**Goal:** Convert codexmux from a tmux-centered macOS/Linux server with client
shells into a Windows-only service/product.

**Architecture:** Keep the existing Next.js Pages Router, custom Node server,
Supervisor/Worker runtime, storage/timeline/status policies, and dense
operational UI stable while replacing platform infrastructure behind explicit
runtime and process adapters.

**Current step:** audit and planning baseline only. Future tasks below need their
own implementation specs/reviews before code changes.

---

## File Structure For This Planning Step

- Create: `docs/WINDOWS-ONLY-GAP-AUDIT.md`
- Create: `docs/superpowers/specs/2026-05-06-windows-only-platform-transition-design.md`
- Create: `docs/superpowers/plans/2026-05-06-windows-only-platform-transition.md`
- Modify: `docs/ADR.md`
- Modify: `docs/README.md`
- Modify: `AGENTS.md`

---

## Phase 0: Product Target Baseline

**Status:** In progress for this documentation step.

- [x] Record Windows-only as the product target in ADR.
- [x] Clarify that ADR-014's removed Windows companion integration stays removed.
- [x] Add a gap audit that names current tmux/macOS/Linux/Android assumptions.
- [x] Add a transition plan that starts with boundaries and tests before runtime
  replacement.
- [ ] Update public README once the first implementation slice is accepted, so
  user-facing docs do not claim a runtime that is not built yet.

## Phase 1: Platform Contracts And Tests

**Goal:** Make platform assumptions visible before changing behavior.

- [ ] Introduce terminal runtime contract tests around create, attach, detach,
  resize, stdin/stdout, cwd, and kill behavior.
- [ ] Introduce process inspection contract tests around PID running, children,
  cwd, command, start time, and Codex session correlation.
- [ ] Add Windows path fixtures for `~/.codex/sessions/`,
  `~/.codexmux/`, workspace paths, and JSONL validation.
- [ ] Tag or isolate Linux-only tests so Windows failures identify product gaps
  rather than incidental environment debt.
- [ ] Fix Windows install blockers such as POSIX `chmod` and `rm -rf` scripts.

## Phase 2: Terminal Runtime Boundary

**Goal:** Stop treating tmux as the domain terminal API.

- [ ] Move direct terminal lifecycle callers behind a runtime adapter boundary.
- [ ] Keep `/api/terminal` and `/api/v2/terminal` client protocol stable where
  possible.
- [ ] Reuse the existing `ITerminalWorkerRuntime` shape for runtime v2.
- [ ] Mark tmux metadata as adapter-specific where type compatibility requires
  keeping it temporarily.
- [ ] Keep tmux behavior available only as a migration fallback until Windows
  parity is proven.

## Phase 3: Windows Terminal Runtime

**Goal:** Build the Windows-native terminal runtime.

- [ ] Choose the Windows terminal implementation path, likely `node-pty`/ConPTY
  first unless a spike proves it cannot preserve reconnect semantics.
- [ ] Implement persistent session lifecycle, attach/reconnect, resize,
  paste/stdin, output buffering, cwd, and kill behavior.
- [ ] Preserve terminal/input/reconnect stability over UI polish.
- [ ] Add Windows smoke tests for new terminal creation, reload/reconnect, Codex
  command execution, approval prompt input, and kill/resume safety.

## Phase 4: Windows Process And Codex Session Detection

**Goal:** Restore status/timeline correctness without Linux `/proc`.

- [ ] Add a Windows process inspector adapter.
- [ ] Rebuild Codex process detection on the process inspector contract.
- [ ] Verify JSONL session mapping by session id, process start time, live
  process, and cwd fallback using Windows paths.
- [ ] Keep raw transcript, full terminal output, tokens, and private paths out of
  logs and notifications.

## Phase 5: Windows Host Operations

**Goal:** Make install, start, restart, update, and rollback Windows-native.

- [ ] Replace Linux `systemd --user` production assumptions with a Windows
  service, tray-host, scheduled startup, or installer-owned host decision.
- [ ] Add Windows preflight for Codex, Git, Node, pnpm, terminal runtime, auth,
  port binding, and firewall/network policy.
- [ ] Add Windows logs and health-check docs.
- [ ] Add rollback steps that do not depend on shell-specific commands.

## Phase 6: Packaging And Surface Cutover

**Goal:** Ship a Windows-only product without stale platform affordances.

- [ ] Define Windows package artifact and installer verification.
- [ ] Demote or remove Android scripts/docs once they no longer represent the
  supported product path.
- [ ] Replace macOS Electron packaging notes with Windows packaging notes if
  Electron remains the desktop shell.
- [ ] Rewrite README, docs map, testing docs, follow-up backlog, and operation
  handoff around Windows-only support.
- [ ] Remove tmux/systemd docs from the primary path after Windows runtime is
  green.

## Plan Design Review Notes

- Information architecture should keep current-state docs, audit docs, and future
  target docs distinct until runtime code exists.
- Operator error prevention depends on clear warnings that old Windows companion
  sync/bridge is not coming back.
- Discoverability improves by listing the gap audit in `docs/README.md` and
  naming Windows-only in `AGENTS.md`.

## Plan Eng Review Checklist

- [ ] Terminal runtime adapter has public behavior tests before implementation.
- [ ] Process inspector adapter handles Windows cwd/command/start-time without
  leaking sensitive command details.
- [ ] Runtime v2 Supervisor/Worker boundaries stay stable.
- [ ] SQLite temp database cleanup is safe on Windows.
- [ ] Install and smoke commands are PowerShell-safe.
- [ ] Rollback path is documented for each implementation slice.

## Verification For This Planning Step

```bash
git diff --check
```

No TypeScript, lint, or unit tests are required for this documentation-only
baseline.
