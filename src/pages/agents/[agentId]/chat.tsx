import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import PageShell from '@/components/layout/page-shell';
import ChatHeader from '@/components/features/agent/chat-header';
import MessageList from '@/components/features/agent/message-list';
import ChatInput from '@/components/features/agent/chat-input';
import AgentSettingsSheet from '@/components/features/agent/agent-settings-sheet';
import AgentDeleteDialog from '@/components/features/agent/agent-delete-dialog';
import useAgentStore from '@/hooks/use-agent-store';
import useAgentChat from '@/hooks/use-agent-chat';

const AgentChatPage = () => {
  const router = useRouter();
  const agentId = router.query.agentId as string;

  const agent = useAgentStore((s) => (agentId ? s.agents[agentId] ?? null : null));
  const deleteAgent = useAgentStore((s) => s.deleteAgent);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const isStoreLoading = useAgentStore((s) => s.isLoading);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage],
  );

  const handleApproval = useCallback(
    (action: '승인' | '거부') => {
      sendMessage(action);
    },
    [sendMessage],
  );

  const handleDeleteClick = useCallback(() => {
    setDeleteOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!agentId) return;
    setDeleteOpen(false);
    setSettingsOpen(false);
    await deleteAgent(agentId);
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

  const title = agent ? `${agent.name} — purplemux` : '에이전트 채팅 — purplemux';

  const content = (
    <>
      <ChatHeader agent={agent} onSettingsClick={() => setSettingsOpen(true)} />

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

      <PageShell showAppHeader>
        {content}
      </PageShell>

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
    </>
  );
};

export default AgentChatPage;
