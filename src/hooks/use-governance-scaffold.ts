import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type {
  IGovernanceActionSummary,
  IGovernanceRollbackPreview,
  IScaffoldPreview,
  TScaffoldArtifactId,
  TScaffoldTemplateInput,
} from '@/lib/governance/scaffold-contracts';

const readJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json() as T & { error?: string; message?: string };
  if (!response.ok) {
    throw Object.assign(new Error(payload.message ?? payload.error ?? `HTTP ${response.status}`), {
      code: payload.error ?? 'governance-request-failed',
    });
  }
  return payload;
};

const postJson = async <T>(url: string, body: unknown): Promise<T> => readJson<T>(await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}));

export interface IUseGovernanceScaffoldOptions {
  projectId: string | null;
  onChanged?: () => void | Promise<void>;
}

const useGovernanceScaffold = ({ projectId, onChanged }: IUseGovernanceScaffoldOptions) => {
  const t = useTranslations('governance');
  const [preview, setPreview] = useState<IScaffoldPreview | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<IGovernanceRollbackPreview | null>(null);
  const [actions, setActions] = useState<IGovernanceActionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshActions = useCallback(async () => {
    if (!projectId) {
      setActions([]);
      return;
    }
    try {
      const result = await readJson<IGovernanceActionSummary[]>(
        await fetch(`/api/governance/projects/${encodeURIComponent(projectId)}/actions`),
      );
      setActions(result);
      setError(null);
    } catch (requestError) {
      setError(requestError && typeof requestError === 'object' && 'code' in requestError
        ? String(requestError.code)
        : 'governance-request-failed');
    }
  }, [projectId]);

  useEffect(() => {
    setPreview(null);
    setRollbackPreview(null);
    setError(null);
    void refreshActions();
  }, [projectId, refreshActions]);

  const run = useCallback(async <TResult>(task: () => Promise<TResult>): Promise<TResult | null> => {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (requestError) {
      const code = requestError && typeof requestError === 'object' && 'code' in requestError
        ? String(requestError.code)
        : 'governance-request-failed';
      setError(code);
      toast.error(t('scaffold.error'), { description: code });
      return null;
    } finally {
      setBusy(false);
    }
  }, [t]);

  const requestPreview = useCallback(async (input: {
    artifacts: TScaffoldArtifactId[];
    input: TScaffoldTemplateInput;
  }) => {
    if (!projectId) return;
    const result = await run(() => postJson<IScaffoldPreview>(
      `/api/governance/projects/${encodeURIComponent(projectId)}/scaffold/preview`,
      input,
    ));
    if (result) setPreview(result);
  }, [projectId, run]);

  const confirmScaffold = useCallback(async (confirmation: string) => {
    if (!projectId || !preview) return;
    const result = await run(() => postJson<IGovernanceActionSummary>(
      `/api/governance/projects/${encodeURIComponent(projectId)}/scaffold/confirm`,
      { token: preview.token, digest: preview.digest, confirmation },
    ));
    if (!result) return;
    setPreview(null);
    toast.success(t('scaffold.committed'));
    await Promise.all([refreshActions(), onChanged?.()]);
  }, [onChanged, preview, projectId, refreshActions, run, t]);

  const requestRollbackPreview = useCallback(async (actionId: string) => {
    if (!projectId) return;
    const result = await run(() => postJson<IGovernanceRollbackPreview>(
      `/api/governance/projects/${encodeURIComponent(projectId)}/actions/${encodeURIComponent(actionId)}/rollback/preview`,
      {},
    ));
    if (result) setRollbackPreview(result);
  }, [projectId, run]);

  const confirmRollback = useCallback(async (confirmation: string) => {
    if (!projectId || !rollbackPreview) return;
    const result = await run(() => postJson<IGovernanceActionSummary>(
      `/api/governance/projects/${encodeURIComponent(projectId)}/actions/${encodeURIComponent(rollbackPreview.action.id)}/rollback/confirm`,
      { token: rollbackPreview.token, digest: rollbackPreview.digest, confirmation },
    ));
    if (!result) return;
    setRollbackPreview(null);
    toast.success(t('scaffold.rolledBack'));
    await Promise.all([refreshActions(), onChanged?.()]);
  }, [onChanged, projectId, refreshActions, rollbackPreview, run, t]);

  return {
    preview,
    rollbackPreview,
    actions,
    busy,
    error,
    requestPreview,
    confirmScaffold,
    requestRollbackPreview,
    confirmRollback,
    refreshActions,
    closePreview: () => setPreview(null),
    closeRollbackPreview: () => setRollbackPreview(null),
  };
};

export default useGovernanceScaffold;
