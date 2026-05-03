import type { NextApiResponse } from 'next';
import { ZodError, type ZodSchema } from 'zod';

export class RuntimeApiValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(', '));
    this.name = 'RuntimeApiValidationError';
  }
}

export const parseRuntimeApiBody = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new RuntimeApiValidationError(parsed.error.issues.map((issue) => issue.message));
};

export const sendRuntimeDisabled = (res: NextApiResponse): void => {
  res.status(404).json({ error: 'runtime-v2-disabled' });
};

const runtimeErrorStatusByCode: Record<string, number> = {
  'runtime-v2-pane-not-found': 404,
  'runtime-v2-pending-tab-not-found': 404,
  'runtime-v2-terminal-session-not-found': 404,
  'runtime-v2-terminal-subscriber-not-found': 404,
  'runtime-v2-pane-workspace-mismatch': 409,
  'runtime-v2-sqlite-unavailable': 500,
  'runtime-v2-worker-script-missing': 500,
  'runtime-v2-tmux-config-missing': 500,
  'runtime-v2-tmux-config-source-failed': 500,
  'runtime-v2-schema-too-new': 500,
};

export const sendRuntimeApiError = (res: NextApiResponse, err: unknown): void => {
  if (err instanceof RuntimeApiValidationError || err instanceof ZodError) {
    res.status(400).json({ error: 'invalid-runtime-v2-request', message: err.message });
    return;
  }

  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    const retryable = Boolean((err as { retryable?: unknown }).retryable);
    const message = err instanceof Error ? err.message : code;
    if (retryable || code === 'worker-exited' || code === 'worker-error') {
      res.status(503).json({ error: code, message, retryable: true });
      return;
    }
    res.status(runtimeErrorStatusByCode[code] ?? 500).json({ error: code, message });
    return;
  }

  res.status(500).json({
    error: 'runtime-v2-error',
    message: err instanceof Error ? err.message : String(err),
  });
};
