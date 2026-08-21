import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useTranslations } from 'next-intl';
import SessionExplorer from '@/components/features/session-explorer/session-explorer';
import SessionReplayDrawer from '@/components/features/session-explorer/session-replay-drawer';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import useBrowserTitle from '@/hooks/use-browser-title';
import useSessionCatalog from '@/hooks/use-session-catalog';

const SessionsPage = () => {
  const t = useTranslations('sessionExplorer');
  const catalog = useSessionCatalog();
  useBrowserTitle(t('title'));

  return (
    <>
      <Head><title>{t('pageTitle')}</title></Head>
      <SessionExplorer
        query={catalog.query}
        page={catalog.page}
        health={catalog.health}
        savedFilters={catalog.savedFilters}
        loading={catalog.loading}
        error={catalog.error}
        selectedIndex={catalog.selectedIndex}
        onQueryChange={catalog.setQuery}
        onSearch={catalog.search}
        onLoadMore={catalog.loadMore}
        onSelectIndex={catalog.setSelectedIndex}
        onOpenSession={catalog.openReplay}
        onTogglePin={catalog.togglePin}
        onUpdateTags={catalog.updateTags}
        onRebuild={catalog.rebuild}
        onApplySavedFilter={(filter) => {
          catalog.setQuery(filter.query);
          void catalog.search(filter.query);
        }}
        onSaveFilter={catalog.saveFilter}
        onDeleteFilter={catalog.deleteFilter}
      />
      <SessionReplayDrawer
        sessionId={catalog.replay.sessionId}
        entries={catalog.replay.entries}
        loading={catalog.replay.loading}
        error={catalog.replay.error}
        hasMore={catalog.replay.hasMore}
        onOpenChange={(open) => { if (!open) catalog.closeReplay(); }}
        onRetry={() => {
          const sessionId = catalog.replay.sessionId;
          if (sessionId) catalog.openReplay(sessionId);
        }}
        onLoadMore={catalog.loadMoreReplay}
      />
    </>
  );
};

SessionsPage.getLayout = getPageShellWithTitlebarLayout;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { requireAuth } = await import('@/lib/require-auth');
  const { loadMessagesServerBundle } = await import('@/lib/load-messages');
  return requireAuth(context, async () => {
    const { locale, messages } = await loadMessagesServerBundle();
    return { props: { messages, messagesLocale: locale } };
  });
};

export default SessionsPage;
