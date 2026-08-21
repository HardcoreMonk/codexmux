import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { IApprovedProjectRoot } from '@/lib/governance/contracts';

const rootFormSchema = z.object({
  label: z.string().trim().min(1).max(120),
  path: z.string().min(1).max(4096),
});
const projectFormSchema = z.object({
  approvedRootId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  path: z.string().min(1).max(4096),
});
const importFormSchema = z.object({ approvedRootId: z.string().min(1) });

type TRootForm = z.infer<typeof rootFormSchema>;
type TProjectForm = z.infer<typeof projectFormSchema>;
type TImportForm = z.infer<typeof importFormSchema>;

interface IRootPreview {
  token: string;
  digest: string;
  label: string;
  expiresAt: number;
}

interface IImportPreview {
  token: string;
  digest: string;
  sourceFingerprint: string;
  expiresAt: number;
  actions: Array<{
    externalId: string;
    title: string;
    relativePath: string;
    status: 'add' | 'update' | 'conflict' | 'unchanged';
  }>;
  counts: Record<'add' | 'update' | 'conflict' | 'unchanged', number>;
}

interface IGovernanceSetupPanelProps {
  roots: IApprovedProjectRoot[];
  onChanged: () => void | Promise<void>;
}

const mutate = async <T,>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
};

const RootSelect = ({ roots, ...props }: {
  roots: IApprovedProjectRoot[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className="min-h-11 rounded-md border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    {...props}
  >
    <option value="">—</option>
    {roots.map((root) => <option key={root.id} value={root.id}>{root.label}</option>)}
  </select>
);

const GovernanceSetupPanel = ({ roots, onChanged }: IGovernanceSetupPanelProps) => {
  const t = useTranslations('governance');
  const rootForm = useForm<TRootForm>({ resolver: zodResolver(rootFormSchema), defaultValues: { label: '', path: '' } });
  const projectForm = useForm<TProjectForm>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { approvedRootId: '', title: '', path: '' },
  });
  const importForm = useForm<TImportForm>({ resolver: zodResolver(importFormSchema), defaultValues: { approvedRootId: '' } });
  const [rootPreview, setRootPreview] = useState<IRootPreview | null>(null);
  const [rootConfirmation, setRootConfirmation] = useState('');
  const [importPreview, setImportPreview] = useState<IImportPreview | null>(null);
  const [importConfirmation, setImportConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const reportError = (error: unknown): void => {
    toast.error(error instanceof Error ? error.message : t('genericError'));
  };

  const previewRoot = rootForm.handleSubmit(async (values) => {
    setBusy(true);
    try {
      setRootPreview(await mutate<IRootPreview>('/api/governance/roots/preview', values));
      setRootConfirmation('');
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  });

  const confirmRoot = async (): Promise<void> => {
    if (!rootPreview) return;
    setBusy(true);
    try {
      await mutate('/api/governance/roots/confirm', {
        token: rootPreview.token,
        digest: rootPreview.digest,
        confirmation: rootConfirmation,
      });
      setRootPreview(null);
      rootForm.reset();
      toast.success(t('rootApproved'));
      await onChanged();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const registerProject = projectForm.handleSubmit(async (values) => {
    setBusy(true);
    try {
      await mutate('/api/governance/projects', values);
      projectForm.reset();
      toast.success(t('projectRegistered'));
      await onChanged();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  });

  const previewImport = importForm.handleSubmit(async (values) => {
    setBusy(true);
    try {
      setImportPreview(await mutate<IImportPreview>('/api/governance/import/preview', values));
      setImportConfirmation('');
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  });

  const confirmImport = async (): Promise<void> => {
    if (!importPreview) return;
    const approvedRootId = importForm.getValues('approvedRootId');
    setBusy(true);
    try {
      await mutate('/api/governance/import/confirm', {
        approvedRootId,
        token: importPreview.token,
        digest: importPreview.digest,
        sourceFingerprint: importPreview.sourceFingerprint,
        confirmation: importConfirmation,
        selections: importPreview.actions.map((action) => ({
          externalId: action.externalId,
          selectedFields: action.status === 'unchanged' ? [] : ['title', 'relativePath'],
        })),
      });
      setImportPreview(null);
      toast.success(t('importCompleted'));
      await onChanged();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="border-b bg-muted/10 text-xs">
      <summary className="min-h-11 cursor-pointer px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {t('catalogSetup')}
      </summary>
      <div className="grid gap-3 border-t p-3 lg:grid-cols-3">
        <form onSubmit={previewRoot} className="space-y-2 rounded-md border bg-background p-3">
          <h2 className="font-semibold">{t('approveRoot')}</h2>
          <Input {...rootForm.register('label')} aria-label={t('rootLabel')} placeholder={t('rootLabel')} className="min-h-11" />
          <Input {...rootForm.register('path')} aria-label={t('absolutePath')} placeholder="/srv/projects" className="min-h-11 font-mono text-xs" />
          {!rootPreview
            ? <Button type="submit" size="sm" disabled={busy}>{t('preview')}</Button>
            : (
              <div className="space-y-2 rounded bg-muted/40 p-2">
                <div>{t('previewReady')}</div>
                <Input value={rootConfirmation} onChange={(event) => setRootConfirmation(event.target.value)} aria-label={t('exactConfirmation')} placeholder="APPROVE PROJECT ROOT" className="min-h-11 font-mono text-xs" />
                <Button type="button" size="sm" disabled={busy || rootConfirmation !== 'APPROVE PROJECT ROOT'} onClick={() => void confirmRoot()}>{t('confirm')}</Button>
              </div>
            )}
        </form>

        <form onSubmit={registerProject} className="space-y-2 rounded-md border bg-background p-3">
          <h2 className="font-semibold">{t('registerProject')}</h2>
          <RootSelect roots={roots} {...projectForm.register('approvedRootId')} aria-label={t('approvedRoot')} />
          <Input {...projectForm.register('title')} aria-label={t('projectTitle')} placeholder={t('projectTitle')} className="min-h-11" />
          <Input {...projectForm.register('path')} aria-label={t('absolutePath')} placeholder="/srv/projects/example" className="min-h-11 font-mono text-xs" />
          <Button type="submit" size="sm" disabled={busy || roots.length === 0}>{t('register')}</Button>
        </form>

        <form onSubmit={previewImport} className="space-y-2 rounded-md border bg-background p-3">
          <h2 className="font-semibold">{t('importProjects')}</h2>
          <RootSelect roots={roots} {...importForm.register('approvedRootId')} aria-label={t('approvedRoot')} />
          {!importPreview
            ? <Button type="submit" size="sm" disabled={busy || roots.length === 0}>{t('preview')}</Button>
            : (
              <div className="space-y-2 rounded bg-muted/40 p-2">
                <div>{t('importCounts', importPreview.counts)}</div>
                <div className="max-h-28 overflow-y-auto font-mono text-[10px]">
                  {importPreview.actions.map((action) => <div key={action.externalId}>{action.status} · {action.relativePath}</div>)}
                </div>
                <Input value={importConfirmation} onChange={(event) => setImportConfirmation(event.target.value)} aria-label={t('exactConfirmation')} placeholder="IMPORT PROJECTS" className="min-h-11 font-mono text-xs" />
                <Button type="button" size="sm" disabled={busy || importConfirmation !== 'IMPORT PROJECTS'} onClick={() => void confirmImport()}>{t('confirm')}</Button>
              </div>
            )}
        </form>
      </div>
    </details>
  );
};

export default GovernanceSetupPanel;
