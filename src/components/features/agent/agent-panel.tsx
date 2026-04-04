import { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Bot, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import AgentCard from '@/components/features/agent/agent-card';
import AgentCreateDialog from '@/components/features/agent/agent-create-dialog';
import AgentSettingsSheet from '@/components/features/agent/agent-settings-sheet';
import AgentDeleteDialog from '@/components/features/agent/agent-delete-dialog';
import AgentChatPanel from '@/components/features/agent/agent-chat-panel';
import useAgentStore, { selectAgentList } from '@/hooks/use-agent-store';
import useAgentStatus from '@/hooks/use-agent-status';
import type { IAgentInfo } from '@/types/agent';

const SkeletonCards = () => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {[0, 1].map((i) => (
      <div key={i} className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="mt-1.5 h-3 w-32" />
        <Skeleton className="mt-4 h-3 w-20" />
      </div>
    ))}
  </div>
);

const EmptyState = ({ onCreateClick }: { onCreateClick: () => void }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-20">
    <Bot className="h-8 w-8 text-muted-foreground/40" />
    <div className="text-center">
      <p className="text-sm text-muted-foreground">아직 에이전트가 없습니다</p>
      <p className="text-sm text-muted-foreground">첫 에이전트를 만들어보세요</p>
    </div>
    <Button variant="outline" size="sm" onClick={onCreateClick}>
      <Plus className="h-3.5 w-3.5" />
      새 에이전트 만들기
    </Button>
  </div>
);

const AgentPanel = () => {
  const agents = useAgentStore(useShallow(selectAgentList));
  const isLoading = useAgentStore((s) => s.isLoading);
  const error = useAgentStore((s) => s.error);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const deleteAgent = useAgentStore((s) => s.deleteAgent);

  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsAgent, setSettingsAgent] = useState<IAgentInfo | null>(null);
  const [deleteAgent_, setDeleteAgent] = useState<IAgentInfo | null>(null);
  const [fadingOutId, setFadingOutId] = useState<string | null>(null);

  useAgentStatus();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCardClick = useCallback((agent: IAgentInfo) => {
    setActiveAgentId(agent.id);
  }, []);

  const handleCreated = useCallback((agentId: string) => {
    setActiveAgentId(agentId);
  }, []);

  const handleBackToList = useCallback(() => {
    setActiveAgentId(null);
  }, []);

  const handleSettingsClick = useCallback((agent: IAgentInfo) => {
    setSettingsAgent(agent);
  }, []);

  const handleDeleteClick = useCallback(() => {
    if (settingsAgent) {
      setDeleteAgent(settingsAgent);
    }
  }, [settingsAgent]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteAgent_) return;
    const id = deleteAgent_.id;

    setDeleteAgent(null);
    setSettingsAgent(null);

    setFadingOutId(id);
    await new Promise((r) => setTimeout(r, 200));

    await deleteAgent(id);
    setFadingOutId(null);
  }, [deleteAgent_, deleteAgent]);

  const handleRetry = useCallback(() => {
    fetchAgents();
  }, [fetchAgents]);

  if (activeAgentId) {
    return <AgentChatPanel agentId={activeAgentId} onBack={handleBackToList} />;
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold">My Agents</h1>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              새 에이전트
            </Button>
          </div>

          {isLoading ? (
            <SkeletonCards />
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCw className="h-3 w-3" />
                재시도
              </Button>
            </div>
          ) : agents.length === 0 ? (
            <EmptyState onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="list">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onClick={() => handleCardClick(agent)}
                  onSettingsClick={() => handleSettingsClick(agent)}
                  isFadingOut={fadingOutId === agent.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AgentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <AgentSettingsSheet
        agent={settingsAgent}
        open={!!settingsAgent}
        onOpenChange={(open) => { if (!open) setSettingsAgent(null); }}
        onDeleteClick={handleDeleteClick}
      />

      {deleteAgent_ && (
        <AgentDeleteDialog
          agentName={deleteAgent_.name}
          open={!!deleteAgent_}
          onOpenChange={(open) => { if (!open) setDeleteAgent(null); }}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </>
  );
};

export default AgentPanel;
