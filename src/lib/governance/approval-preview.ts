import { createHash, randomBytes } from 'node:crypto';
import { resolveApprovedProjectRoot } from '@/lib/governance/project-path-policy';

interface IApprovedRootPreview {
  token: string;
  digest: string;
  label: string;
  expiresAt: number;
}

interface IStoredApprovedRootPreview extends IApprovedRootPreview {
  canonicalPath: string;
}

interface IApprovedRootPreviewServiceOptions {
  now?: () => number;
  randomToken?: () => string;
  ttlMs?: number;
}

const approvalError = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code, retryable: false });

const fingerprint = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

export const createApprovedRootPreviewService = (options: IApprovedRootPreviewServiceOptions = {}) => {
  const now = options.now ?? (() => Date.now());
  const randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
  const ttlMs = options.ttlMs ?? 10 * 60 * 1_000;
  const previews = new Map<string, IStoredApprovedRootPreview>();

  return {
    async createPreview(candidatePath: string, label: string): Promise<IApprovedRootPreview> {
      const { canonicalPath } = await resolveApprovedProjectRoot(candidatePath);
      const token = randomToken();
      const digest = fingerprint(JSON.stringify({ canonicalPath, label }));
      const preview = { token, digest, label, canonicalPath, expiresAt: now() + ttlMs };
      previews.set(token, preview);
      const { canonicalPath: _canonicalPath, ...result } = preview;
      return result;
    },

    async confirmPreview(token: string, digest: string): Promise<{ label: string; canonicalPath: string }> {
      const preview = previews.get(token);
      if (!preview) throw approvalError('approved-root-preview-not-found', 'Approved root preview was not found.');
      if (now() > preview.expiresAt) {
        previews.delete(token);
        throw approvalError('approved-root-preview-expired', 'Approved root preview expired.');
      }
      if (preview.digest !== digest) {
        throw approvalError('approved-root-preview-changed', 'Approved root preview digest changed.');
      }
      const { canonicalPath } = await resolveApprovedProjectRoot(preview.canonicalPath);
      if (canonicalPath !== preview.canonicalPath) {
        throw approvalError('approved-root-preview-changed', 'Approved root changed after preview.');
      }
      previews.delete(token);
      return { label: preview.label, canonicalPath };
    },
  };
};

interface IApprovedRootPreviewGlobalState {
  __ptApprovedRootPreviewService?: ReturnType<typeof createApprovedRootPreviewService>;
}

const g = globalThis as unknown as IApprovedRootPreviewGlobalState;

export const getApprovedRootPreviewService = (): ReturnType<typeof createApprovedRootPreviewService> => {
  g.__ptApprovedRootPreviewService ??= createApprovedRootPreviewService();
  return g.__ptApprovedRootPreviewService;
};
