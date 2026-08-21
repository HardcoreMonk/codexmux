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
  'timeline-jsonl-path-forbidden': 403,
  'timeline-provider-unknown': 400,
  'catalog-query-invalid': 400,
  'catalog-query-too-complex': 400,
  'catalog-cursor-invalid': 400,
  'catalog-path-forbidden': 403,
  'catalog-session-not-found': 404,
  'session-annotation-session-not-found': 404,
  'session-annotation-version-conflict': 409,
  'catalog-shadow-only': 503,
  'catalog-unavailable': 503,
  'approved-project-root-required': 403,
  'approved-root-preview-not-found': 404,
  'approved-root-preview-expired': 409,
  'approved-root-preview-changed': 409,
  'governance-path-invalid': 400,
  'governance-path-not-absolute': 400,
  'governance-path-traversal': 400,
  'governance-path-not-found': 404,
  'governance-path-not-directory': 400,
  'governance-path-magic-link': 403,
  'governance-path-nested-mount': 403,
  'governance-path-outside-root': 403,
  'projects-yaml-not-found': 404,
  'projects-yaml-not-regular': 400,
  'projects-yaml-too-large': 400,
  'projects-yaml-invalid': 400,
  'projects-yaml-field-too-long': 400,
  'projects-yaml-too-many-projects': 400,
  'projects-yaml-duplicate-id': 409,
  'projects-yaml-duplicate-path': 409,
  'project-import-preview-not-found': 404,
  'project-import-preview-expired': 409,
  'project-import-preview-root-changed': 409,
  'project-import-preview-root-not-approved': 403,
  'project-import-preview-source-changed': 409,
  'project-import-preview-mismatch': 409,
  'managed-project-not-found': 404,
  'project-document-not-found': 404,
  'project-document-path-forbidden': 403,
  'project-document-not-regular': 403,
  'project-document-binary': 403,
  'governance-worker-unavailable': 503,
  'governance-writes-disabled': 403,
  'governance-writes-recovering': 503,
  'governance-writes-degraded': 503,
  'governance-project-write-busy': 503,
  'approved-project-root-not-found': 404,
  'governance-action-not-rollbackable': 409,
  'governance-action-project-changed': 409,
  'scaffold-preview-not-found': 404,
  'scaffold-preview-expired': 409,
  'stale-preview': 409,
  'confirmation-mismatch': 409,
  'scaffold-preview-conflict': 409,
  'scaffold-no-changes': 409,
  'scaffold-design-requires-ui-project': 400,
  'scaffold-file-too-large': 413,
  'scaffold-action-too-large': 413,
  'governance-artifact-path-invalid': 400,
  'governance-artifact-symlink': 403,
  'governance-artifact-ancestor-not-directory': 409,
  'governance-artifact-not-regular': 409,
  'rollback-stale': 409,
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
    if (retryable || runtimeErrorStatusByCode[code] === 503 || code === 'worker-exited' || code === 'worker-error') {
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
