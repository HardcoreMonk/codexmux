# Bridge External Trace Handoff

Date: 2026-05-05 KST

## Scope

codexmux now has a summary-only forwarder for status updates into the
codex-ai-bridge external trace ingress.

## Runtime Contract

- Enable with `CODEXMUX_BRIDGE_TRACE_URL`.
- Authenticate with `CODEXMUX_BRIDGE_TRACE_TOKEN`.
- The token must match codex-ai-bridge `BRIDGE_EXTERNAL_TRACE_TOKEN`.
- Payload contains workspace directory, tab id/name, Codex session id, state,
  current action, last assistant snippet, and last user message.
- Payload does not contain Discord tokens, raw transcript, full stdout, or
  attachment bodies. Payload fields are length-capped before POST.

## Verification

- `corepack pnpm vitest run tests/unit/lib/bridge-trace-forwarder.test.ts`: pass.
- `corepack pnpm tsc --noEmit`: pass.
- `corepack pnpm test`: pass, 96 files / 478 tests.

## Operational Notes

- Forwarding is best-effort and does not block status WebSocket broadcasts.
- Identical state/action updates per tab are deduped before POST.
- Discord visibility still depends on codex-ai-bridge resolving the project
  channel and finding `/추적` enabled.
