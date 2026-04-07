import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import ChatHeader from '@/components/features/agent/chat-header';
import MessageList from '@/components/features/agent/message-list';
import ChatInput from '@/components/features/agent/chat-input';
import AgentSettingsSheet from '@/components/features/agent/agent-settings-sheet';
import AgentDeleteDialog from '@/components/features/agent/agent-delete-dialog';
import AgentCreateDialog from '@/components/features/agent/agent-create-dialog';
import useAgentStore, { selectAgentList } from '@/hooks/use-agent-store';
import useAgentChat from '@/hooks/use-agent-chat';

const LAST_AGENT_KEY = 'last-agent-id';

const AgentChatPage = () => {
  const t = useTranslations('agents');
  const router = useRouter();
  const agentId = router.query.agentId as string;

  const agent = useAgentStore((s) => (agentId ? s.agents[agentId] ?? null : null));
  const agents = useAgentStore(useShallow(selectAgentList));
  const deleteAgent = useAgentStore((s) => s.deleteAgent);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const markRead = useAgentStore((s) => s.markRead);
  const hasUnread = useAgentStore((s) => (agentId ? s.unreadAgentIds.has(agentId) : false));
  const isStoreLoading = useAgentStore((s) => s.isLoading);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const {
    messages,
    hasMore,
    isLoading,
    isLoadingMore,
    isSending,
    isConnected,
    connectionError,
    loadError,
    failedMessageIds,
    sendMessage,
    resendMessage,
    loadMore,
    fetchHistory,
  } = useAgentChat(agentId || '');

  useEffect(() => {
    if (!agent && agentId) {
      fetchAgents();
    }
  }, [agent, agentId, fetchAgents]);

  useEffect(() => {
    if (agentId) {
      localStorage.setItem(LAST_AGENT_KEY, agentId);
      markRead(agentId);
    }
  }, [agentId, markRead]);

  useEffect(() => {
    if (agentId && hasUnread) {
      markRead(agentId);
    }
  }, [agentId, hasUnread, markRead]);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage],
  );

  const handleApproval = useCallback(
    (action: 'approve' | 'reject') => {
      sendMessage(action);
    },
    [sendMessage],
  );

  const handleAgentSelect = useCallback(
    (id: string) => {
      localStorage.setItem(LAST_AGENT_KEY, id);
      router.push(`/agents/${id}/chat`);
    },
    [router],
  );

  const handleCreated = useCallback(
    (id: string) => {
      localStorage.setItem(LAST_AGENT_KEY, id);
      router.push(`/agents/${id}/chat`);
    },
    [router],
  );

  const handleDeleteClick = useCallback(() => {
    setDeleteOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!agentId) return;
    setDeleteOpen(false);
    setSettingsOpen(false);
    await deleteAgent(agentId);
    localStorage.removeItem(LAST_AGENT_KEY);
    router.push('/agents');
  }, [agentId, deleteAgent, router]);

  const lastActivity = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'activity') return messages[i].content;
      if (messages[i].role === 'agent' && messages[i].type !== 'activity') break;
    }
    return null;
  }, [messages]);

  if (!agentId) return null;

  const agentStatus = agent?.status ?? 'offline';

  const title = agent ? t('chatPageTitle', { name: agent.name }) : t('chatDefaultTitle');

  const content = (
    <>
      <ChatHeader
        agent={agent}
        agents={agents}
        onSettingsClick={() => setSettingsOpen(true)}
        onCreateClick={() => setCreateOpen(true)}
        onAgentSelect={handleAgentSelect}
      />

      <MessageList
        messages={messages}
        agentStatus={agentStatus}
        lastActivity={lastActivity}
        isLoading={isLoading || (isStoreLoading && !agent)}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        isConnected={isConnected}
        connectionError={connectionError}
        loadError={loadError}
        failedMessageIds={failedMessageIds}
        onRetry={fetchHistory}
        onLoadMore={loadMore}
        onResend={resendMessage}
        onApproval={handleApproval}
      />

      <ChatInput
        agentId={agentId}
        onSend={handleSend}
        agentStatus={agentStatus}
        isSending={isSending}
      />
    </>
  );

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      {content}

      <AgentSettingsSheet
        agent={agent}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onDeleteClick={handleDeleteClick}
      />

      {agent && deleteOpen && (
        <AgentDeleteDialog
          agentName={agent.name}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onConfirm={handleDeleteConfirm}
        />
      )}

      <AgentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </>
  );
};

AgentChatPage.getLayout = getPageShellWithTitlebarLayout;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { requireAuth } = await import('@/lib/require-auth');
  const { loadMessagesServer } = await import('@/lib/load-messages');
  return requireAuth(context, async () => {
    const messages = await loadMessagesServer();
    return { props: { messages } };
  });
};

export default AgentChatPage;
