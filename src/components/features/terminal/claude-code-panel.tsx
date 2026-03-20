import { useState, useEffect, useRef, useCallback } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import useTimeline from '@/hooks/use-timeline';
import TimelineView from '@/components/features/timeline/timeline-view';
import TerminalContainer from '@/components/features/terminal/terminal-container';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';

const TERMINAL_SCALE = 0.5;

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

  const wsActionsRef = useRef({
    sendStdin: (() => {}) as (data: string) => void,
    sendResize: (() => {}) as (cols: number, rows: number) => void,
  });

  const { terminalRef, write, fit, focus, isReady } = useTerminal({
    onInput: (data) => wsActionsRef.current.sendStdin(data),
    onResize: (cols, rows) => wsActionsRef.current.sendResize(cols, rows),
  });

  const { connect, sendStdin, sendResize } = useTerminalWebSocket({
    onData: (data) => write(data),
    onConnected: () => {
      fit();
      focus();
    },
  });

  useEffect(() => {
    wsActionsRef.current = { sendStdin, sendResize };
  });

  useEffect(() => {
    if (isReady && sessionName) {
      connect(sessionName);
    }
  }, [isReady, sessionName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTerminalClick = useCallback(() => {
    focus();
  }, [focus]);

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <Group orientation="vertical" className="h-full">
        <Panel id="timeline" defaultSize={70} minSize={30}>
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
        </Panel>

        <Separator className="group flex h-2 items-center justify-center">
          <div className="h-px w-16 rounded-full bg-border transition-colors group-hover:bg-muted-foreground group-data-[resize-handle-active]:bg-muted-foreground" />
        </Separator>

        <Panel id="terminal" defaultSize={30} minSize={10}>
          <div
            className="h-full w-full overflow-hidden"
            onClick={handleTerminalClick}
            role="presentation"
          >
            <div
              style={{
                transform: `scale(${TERMINAL_SCALE})`,
                transformOrigin: 'top left',
                width: `${100 / TERMINAL_SCALE}%`,
                height: `${100 / TERMINAL_SCALE}%`,
              }}
            >
              <TerminalContainer ref={terminalRef} />
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
};

export default ClaudeCodePanel;
