import { useState, useCallback, useEffect } from 'react';
import ChatHeader from '@/components/features/agent/chat-header';
import MessageList from '@/components/features/agent/message-list';
import ChatInput from '@/components/features/agent/chat-input';
import AgentSettingsSheet from '@/components/features/agent/agent-settings-sheet';
import AgentDeleteDialog from '@/components/features/agent/agent-delete-dialog';
import useAgentStore from '@/hooks/use-agent-store';
import useAgentChat from '@/hooks/use-agent-chat';

interface IAgentChatPanelProps {
  agentId: string;
  onBack: () => void;
}

const AgentChatPanel = ({ agentId, onBack }: IAgentChatPanelProps) => {
  const agent = useAgentStore((s) => s.agents[agentId] ?? null);
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
  } = useAgentChat(agentId);

  useEffect(() => {
    if (!agent) {
      fetchAgents();
    }
  }, [agent, fetchAgents]);

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
    setDeleteOpen(false);
    setSettingsOpen(false);
    await deleteAgent(agentId);
    onBack();
  }, [agentId, deleteAgent, onBack]);

  const agentStatus = agent?.status ?? 'offline';

  return (
    <>
      <div className="flex h-full flex-col">
        <ChatHeader
          agent={agent}
          onSettingsClick={() => setSettingsOpen(true)}
          onBack={onBack}
        />

        <MessageList
          messages={messages}
          agentStatus={agentStatus}
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
      </div>

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

export default AgentChatPanel;
