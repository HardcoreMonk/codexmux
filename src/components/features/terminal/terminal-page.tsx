import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Plus, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TDisconnectReason } from '@/types/terminal';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import useTabs from '@/hooks/use-tabs';
import TerminalContainer from '@/components/features/terminal/terminal-container';
import ConnectionStatus from '@/components/features/terminal/connection-status';
import TabBar from '@/components/features/terminal/tab-bar';

const DISCONNECT_MESSAGES: Record<NonNullable<TDisconnectReason>, string> = {
  'max-connections': '동시 접속 수를 초과했습니다. 다른 탭을 닫아주세요.',
  'pty-error': '터미널을 시작할 수 없습니다',
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

const TerminalPage = () => {
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const termActionsRef = useRef<ITermActions>(NOOP_TERM_ACTIONS);
  const wsActionsRef = useRef<IWsActions>(NOOP_WS_ACTIONS);
  const connectedSessionRef = useRef<string | null>(null);
  const tabsRef = useRef<ReturnType<typeof useTabs> | null>(null);
  const activeTabIdRef = useRef<string | null>(null);
  const prevConnectedTabIdRef = useRef<string | null>(null);

  const {
    tabs,
    activeTabId,
    isLoading: tabsLoading,
    error: tabsError,
    isCreating,
    createTab,
    deleteTab,
    switchTab,
    renameTab,
    reorderTabs,
    removeTabLocally,
    retry: retryTabs,
  } = useTabs();

  useEffect(() => {
    tabsRef.current = {
      tabs,
      activeTabId,
      isLoading: tabsLoading,
      error: tabsError,
      isCreating,
      createTab,
      deleteTab,
      switchTab,
      renameTab,
      reorderTabs,
      removeTabLocally,
      retry: retryTabs,
    };
    activeTabIdRef.current = activeTabId;
  });

  const { terminalRef, write, reset, fit, focus, isReady } = useTerminal({
    onInput: (data) => wsActionsRef.current.sendStdin(data),
    onResize: (cols, rows) => wsActionsRef.current.sendResize(cols, rows),
  });

  const handleSessionEnded = useCallback(() => {
    const currentTabId = activeTabIdRef.current;
    const current = tabsRef.current;
    if (!currentTabId || !current) return;

    const sorted = [...current.tabs].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.id === currentTabId);
    const adjacent = sorted[idx + 1] || sorted[idx - 1];

    current.removeTabLocally(currentTabId);

    if (adjacent) {
      current.switchTab(adjacent.id);
    }
  }, []);

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

  useEffect(() => {
    if (!isReady || tabsLoading || !activeTabId) return;

    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    if (connectedSessionRef.current === tab.sessionName) return;

    if (connectedSessionRef.current !== null) {
      reset();
    }

    connectedSessionRef.current = tab.sessionName;
    connect(tab.sessionName);
  }, [isReady, tabsLoading, activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      status === 'disconnected' &&
      hasEverConnected &&
      prevConnectedTabIdRef.current &&
      prevConnectedTabIdRef.current !== activeTabId &&
      tabs.some((t) => t.id === prevConnectedTabIdRef.current)
    ) {
      connectedSessionRef.current = null;
      switchTab(prevConnectedTabIdRef.current);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchTab = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) return;
      switchTab(tabId);
    },
    [activeTabId, switchTab],
  );

  const handleCreateTab = useCallback(async () => {
    await createTab();
  }, [createTab]);

  const handleDeleteTab = useCallback(
    async (tabId: string) => {
      const isActive = tabId === activeTabId;

      if (isActive) {
        const sorted = [...tabs].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((t) => t.id === tabId);
        const adjacent = sorted[idx + 1] || sorted[idx - 1];

        if (adjacent) {
          switchTab(adjacent.id);
        }
      }

      await deleteTab(tabId);
    },
    [activeTabId, tabs, switchTab, deleteTab],
  );

  const handleRenameTab = useCallback(
    (tabId: string, name: string) => {
      renameTab(tabId, name);
    },
    [renameTab],
  );

  const handleReorderTabs = useCallback(
    (tabIds: string[]) => {
      reorderTabs(tabIds);
    },
    [reorderTabs],
  );

  const noTabs = !tabsLoading && !tabsError && tabs.length === 0;
  const ready = isReady && !tabsLoading && status === 'connected' && !noTabs;
  const showInitialLoading =
    !noTabs &&
    (!isReady ||
      (tabsLoading && tabs.length === 0) ||
      (isReady && !tabsLoading && !tabsError && status === 'connecting' && !hasEverConnected));

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden"
      style={{ backgroundColor: '#1e1f29' }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        isLoading={tabsLoading}
        error={tabsError}
        isCreating={isCreating}
        onSwitchTab={handleSwitchTab}
        onCreateTab={handleCreateTab}
        onDeleteTab={handleDeleteTab}
        onRenameTab={handleRenameTab}
        onReorderTabs={handleReorderTabs}
        onRetry={retryTabs}
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
            <Button
              className="gap-1.5"
              onClick={handleCreateTab}
              disabled={isCreating}
            >
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

        {!tabsLoading && !tabsError && !noTabs && status === 'disconnected' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <WifiOff className="h-5 w-5 text-zinc-500" />
            <span className="text-sm text-zinc-400">
              {(disconnectReason && DISCONNECT_MESSAGES[disconnectReason]) ??
                '서버에 연결할 수 없습니다'}
            </span>
            <Button variant="outline" size="sm" onClick={reconnect}>
              다시 연결
            </Button>
          </div>
        )}

        {!tabsLoading && !tabsError && !noTabs && (
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

export default TerminalPage;
