import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import useTimeline from '@/hooks/use-timeline';
import TimelineView from '@/components/features/timeline/timeline-view';

interface IClaudeCodePanelProps {
  sessionName: string;
  className?: string;
}

const ClaudeCodePanel = ({ sessionName, className }: IClaudeCodePanelProps) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const res = await fetch('/api/workspace');
        if (!res.ok) return;
        const data = await res.json();
        setWorkspaceId(data.activeWorkspaceId);
      } catch {}
    };
    fetchWorkspace();
  }, []);

  const {
    entries,
    sessionStatus,
    wsStatus,
    isAutoScrollEnabled,
    setAutoScrollEnabled,
    isLoading,
    error,
    loadMore,
    hasMore,
    retrySession,
  } = useTimeline({
    sessionName,
    workspaceId: workspaceId ?? '',
    enabled: !!workspaceId,
  });

  return (
    <div className={cn('h-full w-full', className)}>
      <TimelineView
        entries={entries}
        sessionStatus={sessionStatus}
        wsStatus={wsStatus}
        isLoading={isLoading}
        error={error}
        isAutoScrollEnabled={isAutoScrollEnabled}
        onAutoScrollChange={setAutoScrollEnabled}
        onRetry={retrySession}
        onLoadMore={loadMore}
        hasMore={hasMore}
      />
    </div>
  );
};

export default ClaudeCodePanel;
