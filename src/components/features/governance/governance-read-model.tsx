import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { AlertTriangle, BookOpen, RefreshCw, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  IGovernanceAuditCandidate,
  IGovernanceWorkerHealth,
  IManagedProject,
  IProjectDocumentRef,
  IProjectGovernanceSummary,
  IProjectLifecycleSnapshot,
} from '@/lib/governance/contracts';

interface IGovernanceReadModelProps {
  projects: IManagedProject[];
  selectedProjectId: string | null;
  summary: IProjectGovernanceSummary | null;
  documents: IProjectDocumentRef[];
  lifecycle: IProjectLifecycleSnapshot | null;
  audit: IGovernanceAuditCandidate[];
  health: IGovernanceWorkerHealth | null;
  loading: boolean;
  error: string | null;
  onSelectProject: (projectId: string) => void;
  onRefresh: () => void | Promise<void>;
  onOpenDocument: (documentPath: string) => void | Promise<void>;
  scaffoldPanel?: ReactNode;
  actionHistory?: ReactNode;
}

const GovernanceReadModel = ({
  projects,
  selectedProjectId,
  summary,
  documents,
  lifecycle,
  audit,
  health,
  loading,
  error,
  onSelectProject,
  onRefresh,
  onOpenDocument,
  scaffoldPanel,
  actionHistory,
}: IGovernanceReadModelProps) => {
  const t = useTranslations('governance');
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const writeState = health?.writeState ?? 'degraded';
  const degraded = health?.state === 'degraded' || writeState === 'degraded'
    || error === 'governance-worker-unavailable';
  const errorLabel = error === 'origin-forbidden'
    ? t('permissionDenied')
    : error === 'managed-project-not-found'
      ? t('invalidProject')
      : error && !degraded
        ? t('genericError')
        : null;
  const indexState = summary?.indexState ?? health?.state ?? 'degraded';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden [word-break:keep-all]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-agent-active" />
          <h1 className="text-sm font-semibold">{t('title')}</h1>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium">{t('engine')}</span>
          <span className={cn(
            'rounded px-2 py-0.5 text-[11px] font-medium',
            writeState === 'ready'
              ? 'bg-agent-active/10 text-agent-active'
              : 'bg-ui-yellow/10 text-ui-yellow',
          )}>{t(`writeState.${writeState}`)}</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void onRefresh()}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('refresh')}
        </Button>
      </header>

      <div className="border-b bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
        {writeState === 'ready' ? t('writePhaseBoundary') : t('phaseBoundary')}
      </div>

      {(degraded || errorLabel) && (
        <div className="flex items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <div className="font-medium">{degraded ? t('degraded') : errorLabel}</div>
            {degraded && <div className="mt-0.5 text-muted-foreground">{t('degradedDescription')}</div>}
          </div>
        </div>
      )}

      {summary?.indexState === 'stale' && (
        <div className="border-b border-ui-yellow/20 bg-ui-yellow/5 px-4 py-3 text-xs">
          <div className="font-medium text-ui-yellow">{t('partialScan')}</div>
          <div className="mt-0.5 text-muted-foreground">{t('partialScanDescription')}</div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r p-2">
          <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('projects')}</div>
          {projects.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-xs">
              <div className="font-medium">{t('noProjects')}</div>
              <div className="mt-1 text-muted-foreground">{t('noProjectsDescription')}</div>
            </div>
          )}
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={cn(
                'mb-1 min-h-11 w-full rounded-md border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                project.id === selectedProjectId ? 'border-agent-active/40 bg-agent-active/5' : 'hover:bg-muted/50',
              )}
              onClick={() => onSelectProject(project.id)}
            >
              <span className="block truncate font-medium">{project.title}</span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">{project.relativePath}</span>
            </button>
          ))}
        </aside>

        <main className="min-h-0 overflow-y-auto p-3">
          {loading && <div className="p-8 text-center text-xs text-muted-foreground">{t('loading')}</div>}
          {!loading && !selectedProject && projects.length > 0 && (
            <div className="p-8 text-center text-xs text-muted-foreground">{t('selectProject')}</div>
          )}
          {selectedProject && (
            <div className="grid gap-3 xl:grid-cols-2">
              <section className="rounded-md border p-3 xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{selectedProject.title}</h2>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">{selectedProject.relativePath}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded bg-muted px-2 py-1">{t(`indexState.${indexState}`)}</span>
                    <span className="rounded bg-muted px-2 py-1">{t('documentCount', { count: summary?.documentCount ?? documents.length })}</span>
                    <span className="rounded bg-muted px-2 py-1">{t('warnings', { count: summary?.warningCount ?? 0 })}</span>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {t('lastIndexed', {
                    time: summary?.indexedAt ? dayjs(summary.indexedAt).format('YYYY-MM-DD HH:mm') : t('never'),
                  })}
                </div>
              </section>

              {scaffoldPanel}

              <section className="min-h-48 rounded-md border">
                <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold">
                  <BookOpen className="h-3.5 w-3.5" />
                  {t('documents')}
                </div>
                <div className="divide-y">
                  {documents.map((document) => (
                    <button
                      key={document.path}
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => void onOpenDocument(document.path)}
                      aria-label={`${t('openDocument')}: ${document.path}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{document.title}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">{document.path}</span>
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">{t(`kind.${document.kind}`)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="min-h-48 rounded-md border p-3">
                <div className="text-xs font-semibold">{t('lifecycle')}</div>
                <div className="mt-3 text-lg font-semibold text-agent-active">
                  {t(`stage.${lifecycle?.stage ?? summary?.lifecycleStage ?? 'intake'}`)}
                </div>
                <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  {lifecycle?.evidence.map((item) => (
                    <div key={`${item.stage}:${item.artifactPath}`} className="flex items-center justify-between gap-3">
                      <span>{t(`stage.${item.stage}`)}</span>
                      <span className="truncate font-mono text-[10px]">{item.artifactPath}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-md border p-3 xl:col-span-2">
                <div className="text-xs font-semibold">{t('audit')}</div>
                {audit.length === 0
                  ? <div className="mt-3 text-xs text-muted-foreground">{t('auditEmpty')}</div>
                  : (
                    <div className="mt-2 divide-y">
                      {audit.map((candidate) => (
                        <div key={`${candidate.path}:${candidate.line}:${candidate.category}`} className="flex min-h-10 items-center justify-between gap-3 py-2 text-xs">
                          <span className="truncate font-mono">{candidate.path}</span>
                          <span className="shrink-0 text-muted-foreground">{candidate.category} · {t('line', { line: candidate.line })}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </section>
              {actionHistory}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default GovernanceReadModel;
export type { IGovernanceReadModelProps };
