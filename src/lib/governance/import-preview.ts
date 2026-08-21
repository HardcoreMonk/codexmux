import { createHash, randomBytes } from 'node:crypto';

export type TProjectImportStatus = 'add' | 'update' | 'conflict' | 'unchanged';

export interface IProjectImportCandidate {
  externalId: string;
  title: string;
  relativePath: string;
}

export interface IExistingImportedProject extends IProjectImportCandidate {
  id: string;
}

export interface IProjectImportAction extends IProjectImportCandidate {
  status: TProjectImportStatus;
  projectId?: string;
}

export interface IProjectImportPreview {
  token: string;
  digest: string;
  sourceFingerprint: string;
  expiresAt: number;
  actions: IProjectImportAction[];
  counts: Record<TProjectImportStatus, number>;
}

interface IProjectImportPreviewDependencies {
  isApprovedRoot: (approvedRootId: string) => boolean;
  now: () => number;
  randomToken: () => string;
  ttlMs: number;
}

interface IStoredPreview extends IProjectImportPreview {
  approvedRootId: string;
}

const fingerprint = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

const previewError = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code, retryable: false });

const classifyCandidate = (
  candidate: IProjectImportCandidate,
  existingProjects: IExistingImportedProject[],
): IProjectImportAction => {
  const byExternalId = existingProjects.find((project) => project.externalId === candidate.externalId);
  const byPath = existingProjects.find((project) => project.relativePath === candidate.relativePath);
  if (!byExternalId && !byPath) return { ...candidate, status: 'add' };
  if (!byExternalId || !byPath || byExternalId.id !== byPath.id) {
    return { ...candidate, status: 'conflict', projectId: byExternalId?.id ?? byPath?.id };
  }
  if (byExternalId.title === candidate.title) {
    return { ...candidate, status: 'unchanged', projectId: byExternalId.id };
  }
  return { ...candidate, status: 'update', projectId: byExternalId.id };
};

const countActions = (actions: IProjectImportAction[]): Record<TProjectImportStatus, number> => ({
  add: actions.filter((action) => action.status === 'add').length,
  update: actions.filter((action) => action.status === 'update').length,
  conflict: actions.filter((action) => action.status === 'conflict').length,
  unchanged: actions.filter((action) => action.status === 'unchanged').length,
});

export const createProjectImportPreviewService = (
  overrides: Partial<IProjectImportPreviewDependencies> & Pick<IProjectImportPreviewDependencies, 'isApprovedRoot'>,
) => {
  const deps: IProjectImportPreviewDependencies = {
    now: () => Date.now(),
    randomToken: () => randomBytes(32).toString('base64url'),
    ttlMs: 10 * 60 * 1_000,
    ...overrides,
  };
  const previews = new Map<string, IStoredPreview>();

  return {
    createPreview({
      approvedRootId,
      sourceContent,
      candidates,
      existingProjects,
    }: {
      approvedRootId: string;
      sourceContent: string;
      candidates: IProjectImportCandidate[];
      existingProjects: IExistingImportedProject[];
    }): IProjectImportPreview {
      if (!deps.isApprovedRoot(approvedRootId)) {
        throw previewError('approved-project-root-required', 'Approved Project Root is required before import.');
      }
      const actions = candidates.map((candidate) => classifyCandidate(candidate, existingProjects));
      const counts = countActions(actions);
      const sourceFingerprint = fingerprint(sourceContent);
      const digest = fingerprint(JSON.stringify(actions.map(({ externalId, title, relativePath, status, projectId }) => ({
        externalId, title, relativePath, status, projectId,
      }))));
      const token = deps.randomToken();
      const preview: IStoredPreview = {
        token,
        digest,
        sourceFingerprint,
        expiresAt: deps.now() + deps.ttlMs,
        actions,
        counts,
        approvedRootId,
      };
      previews.set(token, preview);
      const { approvedRootId: _approvedRootId, ...result } = preview;
      return result;
    },

    confirmPreview({
      token,
      approvedRootId,
      sourceContent,
    }: {
      token: string;
      approvedRootId: string;
      sourceContent: string;
    }): ({ confirmed: true } & IProjectImportPreview) | { confirmed: false; reason: string } {
      const preview = previews.get(token);
      if (!preview) return { confirmed: false, reason: 'preview-not-found' };
      if (deps.now() > preview.expiresAt) return { confirmed: false, reason: 'expired' };
      if (preview.approvedRootId !== approvedRootId) return { confirmed: false, reason: 'root-changed' };
      if (!deps.isApprovedRoot(approvedRootId)) return { confirmed: false, reason: 'root-not-approved' };
      if (fingerprint(sourceContent) !== preview.sourceFingerprint) {
        return { confirmed: false, reason: 'source-changed' };
      }
      const { approvedRootId: _approvedRootId, ...result } = preview;
      return { confirmed: true, ...result };
    },
  };
};

interface IProjectImportPreviewGlobalState {
  __ptProjectImportPreviewService?: ReturnType<typeof createProjectImportPreviewService>;
  __ptApprovedProjectRootIds?: Set<string>;
}

const g = globalThis as unknown as IProjectImportPreviewGlobalState;

const getApprovedRootIds = (): Set<string> => {
  g.__ptApprovedProjectRootIds ??= new Set();
  return g.__ptApprovedProjectRootIds;
};

export const rememberApprovedProjectRoots = (rootIds: string[]): void => {
  const ids = getApprovedRootIds();
  ids.clear();
  rootIds.forEach((id) => ids.add(id));
};

export const getProjectImportPreviewService = (): ReturnType<typeof createProjectImportPreviewService> => {
  g.__ptProjectImportPreviewService ??= createProjectImportPreviewService({
    isApprovedRoot: (rootId) => getApprovedRootIds().has(rootId),
  });
  return g.__ptProjectImportPreviewService;
};
