import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import MessageList from '@/components/features/agent/message-list';
import ChatInput from '@/components/features/agent/chat-input';
import AgentSettingsSheet from '@/components/features/agent/agent-settings-sheet';
import AgentDeleteDialog from '@/components/features/agent/agent-delete-dialog';
import useAgentStore from '@/hooks/use-agent-store';
import useAgentChat from '@/hooks/use-agent-chat';
import type { TAgentStatus } from '@/types/agent';

const statusConfig: Record<TAgentStatus, { className: string; label: string }> = {
  idle: { className: 'bg-muted-foreground/20', label: '대기 중' },
  working: { className: 'bg-ui-teal animate-pulse', label: '작업 중' },
  blocked: { className: 'bg-ui-amber animate-pulse', label: '응답 대기' },
  offline: { className: 'bg-muted-foreground/10', label: '오프라인' },
};

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
  const scrollToBottomRef = useRef<(() => void) | undefined>(undefined);

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
      scrollToBottomRef.current?.();
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

  const lastActivity = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'activity') return messages[i].content;
      if (messages[i].role === 'agent' && messages[i].type !== 'activity') break;
    }
    return null;
  }, [messages]);

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onBack}
            aria-label="에이전트 목록으로 돌아가기"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {agent && (
            <>
              <span className="truncate text-sm font-medium">{agent.name}</span>
              {agent.status !== 'idle' && (
                agent.status === 'working' ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-ui-teal">입력중</span>
                    <span className="flex gap-[2px]">
                      <span className="typing-dot h-[3px] w-[3px] rounded-full bg-ui-teal" />
                      <span className="typing-dot h-[3px] w-[3px] rounded-full bg-ui-teal" />
                      <span className="typing-dot h-[3px] w-[3px] rounded-full bg-ui-teal" />
                    </span>
                  </div>
                ) : (
                  <>
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                        statusConfig[agent.status].className,
                      )}
                    />
                    <span className="text-xs text-muted-foreground">{statusConfig[agent.status].label}</span>
                  </>
                )
              )}
              <div className="ml-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="에이전트 설정"
                >
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </>
          )}
        </div>

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
          scrollToBottomRef={scrollToBottomRef}
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
