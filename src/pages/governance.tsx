import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useTranslations } from 'next-intl';
import GovernanceDocumentDrawer from '@/components/features/governance/governance-document-drawer';
import GovernanceReadModel from '@/components/features/governance/governance-read-model';
import GovernanceSetupPanel from '@/components/features/governance/governance-setup-panel';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import useBrowserTitle from '@/hooks/use-browser-title';
import useManagedProjects from '@/hooks/use-managed-projects';

const GovernancePage = () => {
  const t = useTranslations('governance');
  const governance = useManagedProjects();
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
      />
      <GovernanceDocumentDrawer
        detail={governance.documentDetail}
        loading={governance.documentLoading}
        error={governance.documentError}
        onOpenChange={(open) => { if (!open) governance.closeDocument(); }}
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
