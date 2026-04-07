import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import AgentCreateDialog from '@/components/features/agent/agent-create-dialog';
import useAgentStore, { selectAgentList } from '@/hooks/use-agent-store';

const LAST_AGENT_KEY = 'last-agent-id';

const EmptyState = ({ onCreateClick }: { onCreateClick: () => void }) => {
  const t = useTranslations('agents');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <Bot className="h-8 w-8 text-muted-foreground/40" />
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{t('emptyTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('emptyDescription')}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onCreateClick}>
        <Plus className="h-3.5 w-3.5" />
        {t('createAgent')}
      </Button>
    </div>
  );
};

const AgentsPage = () => {
  const t = useTranslations('agents');
  const router = useRouter();
  const agents = useAgentStore(useShallow(selectAgentList));
  const isLoading = useAgentStore((s) => s.isLoading);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);

  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const redirectTarget = useMemo(() => {
    if (isLoading || agents.length === 0) return null;
    const lastId = localStorage.getItem(LAST_AGENT_KEY);
    return agents.find((a) => a.id === lastId) ?? agents[0];
  }, [isLoading, agents]);

  useEffect(() => {
    if (redirectTarget) {
      router.replace(`/agents/${redirectTarget.id}/chat`);
    }
  }, [redirectTarget, router]);

  const handleCreated = useCallback(
    (agentId: string) => {
      localStorage.setItem(LAST_AGENT_KEY, agentId);
      router.push(`/agents/${agentId}/chat`);
    },
    [router],
  );

  const showEmpty = !isLoading && agents.length === 0;

  if (!showEmpty) return null;

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
      </Head>

      <EmptyState onCreateClick={() => setCreateOpen(true)} />

      <AgentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </>
  );
};

AgentsPage.getLayout = getPageShellWithTitlebarLayout;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { requireAuth } = await import('@/lib/require-auth');
  const { loadMessagesServer } = await import('@/lib/load-messages');
  return requireAuth(context, async () => {
    const messages = await loadMessagesServer();
    return { props: { messages } };
  });
};

export default AgentsPage;
