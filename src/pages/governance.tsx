import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useTranslations } from 'next-intl';
import GovernanceDocumentDrawer from '@/components/features/governance/governance-document-drawer';
import GovernanceActionHistory from '@/components/features/governance/governance-action-history';
import GovernanceReadModel from '@/components/features/governance/governance-read-model';
import GovernanceScaffoldPanel from '@/components/features/governance/governance-scaffold-panel';
import GovernanceScaffoldPreviewDrawer from '@/components/features/governance/governance-scaffold-preview-drawer';
import GovernanceSetupPanel from '@/components/features/governance/governance-setup-panel';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import useBrowserTitle from '@/hooks/use-browser-title';
import useManagedProjects from '@/hooks/use-managed-projects';
import useGovernanceScaffold from '@/hooks/use-governance-scaffold';

const GovernancePage = () => {
  const t = useTranslations('governance');
  const governance = useManagedProjects();
  const selectedProject = governance.projects.find((project) => project.id === governance.selectedProjectId) ?? null;
  const scaffold = useGovernanceScaffold({
    projectId: governance.selectedProjectId,
    onChanged: governance.refresh,
  });
  useBrowserTitle(t('title'));

  return (
    <>
      <Head><title>{t('pageTitle')}</title></Head>
      <GovernanceSetupPanel roots={governance.roots} onChanged={governance.refresh} />
      <GovernanceReadModel
        projects={governance.projects}
        selectedProjectId={governance.selectedProjectId}
        summary={governance.summary}
        documents={governance.documents}
        lifecycle={governance.lifecycle}
        audit={governance.audit}
        health={governance.health}
        loading={governance.loading}
        error={governance.error}
        onSelectProject={governance.setSelectedProjectId}
        onRefresh={governance.refresh}
        onOpenDocument={governance.openDocument}
        scaffoldPanel={selectedProject ? (
          <GovernanceScaffoldPanel
            key={selectedProject.id}
            projectTitle={selectedProject.title}
            writeState={governance.health?.writeState ?? 'degraded'}
            busy={scaffold.busy}
            error={scaffold.error}
            onPreview={scaffold.requestPreview}
          />
        ) : null}
        actionHistory={selectedProject ? (
          <GovernanceActionHistory
            actions={scaffold.actions}
            busy={scaffold.busy}
            onPreviewRollback={scaffold.requestRollbackPreview}
          />
        ) : null}
      />
      <GovernanceDocumentDrawer
        detail={governance.documentDetail}
        loading={governance.documentLoading}
        error={governance.documentError}
        onOpenChange={(open) => { if (!open) governance.closeDocument(); }}
      />
      <GovernanceScaffoldPreviewDrawer
        preview={scaffold.preview}
        mode="scaffold"
        busy={scaffold.busy}
        onConfirm={scaffold.confirmScaffold}
        onOpenChange={(open) => { if (!open) scaffold.closePreview(); }}
      />
      <GovernanceScaffoldPreviewDrawer
        preview={scaffold.rollbackPreview}
        mode="rollback"
        busy={scaffold.busy}
        onConfirm={scaffold.confirmRollback}
        onOpenChange={(open) => { if (!open) scaffold.closeRollbackPreview(); }}
      />
    </>
  );
};

GovernancePage.getLayout = getPageShellWithTitlebarLayout;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { requireAuth } = await import('@/lib/require-auth');
  const { loadMessagesServerBundle } = await import('@/lib/load-messages');
  return requireAuth(context, async () => {
    const { locale, messages } = await loadMessagesServerBundle();
    return { props: { messages, messagesLocale: locale } };
  });
};

export default GovernancePage;
