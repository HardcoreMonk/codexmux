import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Plus, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab, TDisconnectReason } from '@/types/terminal';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import TerminalContainer from '@/components/features/terminal/terminal-container';
import ConnectionStatus from '@/components/features/terminal/connection-status';
import PaneTabBar from '@/components/features/terminal/pane-tab-bar';

const DISCONNECT_MESSAGES: Record<NonNullable<TDisconnectReason>, string> = {
  'max-connections': '동시 접속 수를 초과했습니다. 다른 탭을 닫아주세요.',
  'pty-error': '터미널을 시작할 수 없습니다',
  'session-not-found': '세션을 찾을 수 없습니다',
};

interface ITermActions {
  write: (data: Uint8Array) => void;
  reset: () => void;
  fit: () => { cols: number; rows: number };
  focus: () => void;
}

interface IWsActions {
  sendStdin: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
}

const NOOP_TERM_ACTIONS: ITermActions = {
  write: () => {},
  reset: () => {},
  fit: () => ({ cols: 80, rows: 24 }),
  focus: () => {},
};

const NOOP_WS_ACTIONS: IWsActions = {
  sendStdin: () => {},
  sendResize: () => {},
};

interface IPaneContainerProps {
  paneId: string;
  paneNumber: number;
  tabs: ITab[];
  activeTabId: string | null;
  isFocused: boolean;
  paneCount: number;
  canSplit: boolean;
  isSplitting: boolean;
  onSplitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => void;
  onClosePane: (paneId: string) => void;
  onFocusPane: (paneId: string) => void;
  onMoveTab: (tabId: string, fromPaneId: string, toPaneId: string, toIndex: number) => void;
  onCreateTab: (paneId: string) => Promise<ITab | null>;
  onDeleteTab: (paneId: string, tabId: string) => Promise<void>;
  onSwitchTab: (paneId: string, tabId: string) => void;
  onRenameTab: (paneId: string, tabId: string, name: string) => Promise<void>;
  onReorderTabs: (paneId: string, tabIds: string[]) => void;
  onRemoveTabLocally: (paneId: string, tabId: string) => void;
}

const PaneContainer = ({
  paneId,
  paneNumber,
  tabs,
  activeTabId,
  isFocused,
  paneCount,
  canSplit,
  isSplitting,
  onSplitPane,
  onClosePane,
  onFocusPane,
  onMoveTab,
  onCreateTab,
  onDeleteTab,
  onSwitchTab,
  onRenameTab,
  onReorderTabs,
  onRemoveTabLocally,
}: IPaneContainerProps) => {
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const termActionsRef = useRef<ITermActions>(NOOP_TERM_ACTIONS);
  const wsActionsRef = useRef<IWsActions>(NOOP_WS_ACTIONS);
  const connectedSessionRef = useRef<string | null>(null);
  const prevConnectedTabIdRef = useRef<string | null>(null);

  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const paneCountRef = useRef(paneCount);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
    paneCountRef.current = paneCount;
  });

  const { terminalRef, write, reset, fit, focus, isReady } = useTerminal({
    onInput: (data) => wsActionsRef.current.sendStdin(data),
    onResize: (cols, rows) => wsActionsRef.current.sendResize(cols, rows),
  });

  const handleSessionEnded = useCallback(async () => {
    const currentTabs = tabsRef.current;
    const currentActiveTabId = activeTabIdRef.current;
    const currentPaneCount = paneCountRef.current;

    if (!currentActiveTabId) return;

    const sorted = [...currentTabs].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.id === currentActiveTabId);
    const adjacent = sorted[idx + 1] || sorted[idx - 1];

    if (adjacent) {
      onSwitchTab(paneId, adjacent.id);
      onRemoveTabLocally(paneId, currentActiveTabId);
    } else if (currentPaneCount > 1) {
      onClosePane(paneId);
    } else {
      const newTab = await onCreateTab(paneId);
      if (newTab) {
        onRemoveTabLocally(paneId, currentActiveTabId);
      }
    }
  }, [paneId, onSwitchTab, onRemoveTabLocally, onClosePane, onCreateTab]);

  const {
    status,
    retryCount,
    disconnectReason,
    connect,
    reconnect,
    sendStdin,
    sendResize,
  } = useTerminalWebSocket({
    onData: (data) => termActionsRef.current.write(data),
    onConnected: () => {
      setHasEverConnected(true);
      prevConnectedTabIdRef.current = activeTabIdRef.current;
      const { cols, rows } = termActionsRef.current.fit();
      wsActionsRef.current.sendResize(cols, rows);
      termActionsRef.current.focus();
    },
    onSessionEnded: handleSessionEnded,
  });

  useEffect(() => {
    termActionsRef.current = { write, reset, fit, focus };
    wsActionsRef.current = { sendStdin, sendResize };
  });

  // Connect to active tab's session
  useEffect(() => {
    if (!isReady || !activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    if (connectedSessionRef.current === tab.sessionName) return;

    if (connectedSessionRef.current !== null) {
      reset();
    }

    connectedSessionRef.current = tab.sessionName;
    connect(tab.sessionName);
  }, [isReady, activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rollback on connection failure
  useEffect(() => {
    if (
      status === 'disconnected' &&
      hasEverConnected &&
      prevConnectedTabIdRef.current &&
      prevConnectedTabIdRef.current !== activeTabId &&
      tabs.some((t) => t.id === prevConnectedTabIdRef.current)
    ) {
      connectedSessionRef.current = null;
      onSwitchTab(paneId, prevConnectedTabIdRef.current);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus xterm when pane gets focus
  useEffect(() => {
    if (isFocused && isReady && status === 'connected') {
      focus();
    }
  }, [isFocused]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchTab = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) return;
      onSwitchTab(paneId, tabId);
    },
    [paneId, activeTabId, onSwitchTab],
  );

  const handleCreateTab = useCallback(async () => {
    setIsCreating(true);
    await onCreateTab(paneId);
    setIsCreating(false);
  }, [paneId, onCreateTab]);

  const handleDeleteTab = useCallback(
    async (tabId: string) => {
      const isActive = tabId === activeTabId;
      if (isActive) {
        const sorted = [...tabs].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((t) => t.id === tabId);
        const adjacent = sorted[idx + 1] || sorted[idx - 1];
        if (adjacent) {
          onSwitchTab(paneId, adjacent.id);
        }
      }
      await onDeleteTab(paneId, tabId);
    },
    [paneId, activeTabId, tabs, onSwitchTab, onDeleteTab],
  );

  const handleRenameTab = useCallback(
    (tabId: string, name: string) => {
      onRenameTab(paneId, tabId, name);
    },
    [paneId, onRenameTab],
  );

  const handleReorderTabs = useCallback(
    (tabIds: string[]) => {
      onReorderTabs(paneId, tabIds);
    },
    [paneId, onReorderTabs],
  );

  const handleMoveTab = useCallback(
    (tabId: string, fromPaneId: string, toIndex: number) => {
      onMoveTab(tabId, fromPaneId, paneId, toIndex);
    },
    [paneId, onMoveTab],
  );

  const handleFocusPane = useCallback(() => {
    onFocusPane(paneId);
  }, [paneId, onFocusPane]);

  const noTabs = tabs.length === 0;
  const ready = isReady && status === 'connected' && !noTabs;
  const showInitialLoading =
    !noTabs &&
    (!isReady ||
      (isReady && status === 'connecting' && !hasEverConnected));

  return (
    <div
      className={cn('flex h-full flex-col overflow-hidden')}
      style={{
        opacity: paneCount > 1 ? (isFocused ? 1.0 : 0.3) : undefined,
        transition: 'opacity 150ms',
      }}
      role="region"
      aria-label={`Pane ${paneNumber}`}
      aria-current={isFocused ? 'true' : undefined}
      onClick={handleFocusPane}
    >
      <PaneTabBar
        paneId={paneId}
        tabs={tabs}
        activeTabId={activeTabId}
        isLoading={false}
        error={null}
        isCreating={isCreating}
        paneCount={paneCount}
        canSplit={canSplit}
        isSplitting={isSplitting}
        onSwitchTab={handleSwitchTab}
        onCreateTab={handleCreateTab}
        onDeleteTab={handleDeleteTab}
        onRenameTab={handleRenameTab}
        onReorderTabs={handleReorderTabs}
        onSplitHorizontal={() => onSplitPane(paneId, 'horizontal')}
        onSplitVertical={() => onSplitPane(paneId, 'vertical')}
        onClosePane={() => onClosePane(paneId)}
        onMoveTab={handleMoveTab}
        onFocusPane={handleFocusPane}
        onRetry={() => {}}
      />

      <div role="tabpanel" className="relative min-h-0 flex-1">
        <TerminalContainer
          ref={terminalRef}
          className={cn(
            'transition-opacity duration-150',
            ready ? 'opacity-100' : 'opacity-0',
          )}
        />

        {noTabs && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <Button className="gap-1.5" onClick={handleCreateTab} disabled={isCreating}>
              {isCreating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              새 탭 열기
            </Button>
          </div>
        )}

        {showInitialLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            <span className="text-sm text-zinc-500">연결 중...</span>
          </div>
        )}

        {!noTabs && status === 'disconnected' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <WifiOff className="h-5 w-5 text-zinc-500" />
            <span className="text-sm text-zinc-400">
              {(disconnectReason && DISCONNECT_MESSAGES[disconnectReason]) ??
                '서버에 연결할 수 없습니다'}
            </span>
            {disconnectReason === 'session-not-found' && activeTabId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteTab(activeTabId)}
              >
                탭 닫기
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={reconnect}>
                다시 연결
              </Button>
            )}
          </div>
        )}

        {!noTabs && (
          <ConnectionStatus
            status={status}
            retryCount={retryCount}
            disconnectReason={disconnectReason}
            onReconnect={reconnect}
          />
        )}
      </div>
    </div>
  );
};

export default PaneContainer;
