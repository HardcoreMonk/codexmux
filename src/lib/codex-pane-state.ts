const INTERRUPTED_MARKER_RE = /■\s*Conversation interrupted\s*-\s*tell the model\s+what to do differently/i;
const INTERRUPTED_LINE_RE = /Conversation interrupted/i;
const CODEX_INPUT_PROMPT_RE = /^\s*›(?:\s+.*)?$/m;
const ACTIVE_OUTPUT_AFTER_INTERRUPT_RE = /^\s*(?:[•↳⠋]|Running\b|Thinking\b|Executing\b|Reading\b|Writing\b)/m;

export const hasCodexInterruptedPrompt = (paneContent: string): boolean => {
  const normalized = paneContent.replace(/\r/g, '');
  if (!INTERRUPTED_MARKER_RE.test(normalized.replace(/\n/g, ' '))) return false;

  const lines = normalized.split('\n');
  const interruptLineIndex = lines.findLastIndex((line) => INTERRUPTED_LINE_RE.test(line));
  if (interruptLineIndex < 0) return false;

  const tail = lines.slice(interruptLineIndex + 1).join('\n');
  return CODEX_INPUT_PROMPT_RE.test(tail) && !ACTIVE_OUTPUT_AFTER_INTERRUPT_RE.test(tail);
};
