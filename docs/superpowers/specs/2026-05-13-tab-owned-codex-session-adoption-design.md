# Tab-Owned Codex Session Adoption Design

## Problem

Codex can keep one long-lived process alive while creating a newer JSONL session in the same cwd. Mapping that process only by start time can leave a tab pinned to an old JSONL. Mapping it by cwd-latest JSONL can attach the tab to another Codex tab in the same workspace.

## Design

Codexmux treats same-cwd latest JSONL as unsafe unless the tab has an ownership signal.

- Web input records a tab-scoped prompt claim when the user sends a non-slash prompt.
- The claim stores the prompt text and server-side send timestamp in the tab layout.
- Claim storage emits a timeline refresh signal so already-open legacy/runtime timeline sockets retry ownership resolution while Codex is writing the JSONL.
- Timeline adoption checks candidate Codex JSONLs for matching cwd, matching user message text, and a user-message timestamp inside the claim window.
- If more than one JSONL matches the same prompt claim, the match is ambiguous and no automatic adoption happens.
- Existing interrupted-JSONL fallback stays allowed because that path represents a broken current session rather than a healthy active pane.

## Non-Goals

- Raw terminal typing is not treated as a safe ownership signal.
- Codex prompts are not modified with hidden markers.
- Codex process restart is not automatic.

## Validation

Unit coverage must prove:

- an idle active JSONL is not replaced by cwd-latest without a prompt claim;
- a matching prompt claim can move a long-lived tab to its newer JSONL;
- an open timeline connection reacts to a prompt-claim refresh signal and switches only through claimed ownership;
- no-active/stored JSONL fallback does not switch to cwd-latest without ownership;
- ambiguous same-cwd prompt matches are rejected.
