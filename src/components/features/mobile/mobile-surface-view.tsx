import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Plus, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab, TDisconnectReason, TPanelType } from '@/types/terminal';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import TerminalContainer from '@/components/features/terminal/terminal-container';
import ConnectionStatus from '@/components/features/terminal/connection-status';
import MobileClaudeCodePanel from '@/components/features/mobile/mobile-claude-code-panel';
import MobileTerminalToolbar from '@/components/features/mobile/mobile-terminal-toolbar';
import { formatTabTitle } from '@/lib/tab-title';
import { isAppShortcut, isClearShortcut, isFocusInputShortcut, isShiftEnter } from '@/lib/keyboard-shortcuts';
import type { TCliState } from '@/types/timeline';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useTabStore from '@/hooks/use-tab-store';
import { useLayoutStore } from '@/hooks/use-layout';
import useConfigStore from '@/hooks/use-config-store';

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
  fit: () => ({ cols: 40, rows: 24 }),
  focus: () => {},
};

const NOOP_WS_ACTIONS: IWsActions = {
  sendStdin: () => {},
  sendResize: () => {},
};

interface IMobileSurfaceViewProps {
  paneId: string;
  tabs: ITab[];
  activeTabId: string | null;
  panelType: TPanelType;
  onCreateTab: (paneId: string, panelType?: TPanelType, command?: string) => Promise<ITab | null>;
  onDeleteTab: (paneId: string, tabId: string) => Promise<void>;
  onSwitchTab: (paneId: string, tabId: string) => void;
  onRemoveTabLocally: (paneId: string, tabId: string) => void;
  onUpdateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
  onCliStateChange?: (state: TCliState) => void;
  onOpenNewTabDialog?: () => void;
}

const MOBILE_FONT_SIZE = 11;

const MobileSurfaceView = ({
  paneId,
  tabs,
  activeTabId,
  panelType,
  onCreateTab,
  onDeleteTab,
  onSwitchTab,
  onRemoveTabLocally,
  onCliStateChange,
  onOpenNewTabDialog,
}: IMobileSurfaceViewProps) => {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isClaudeCode = panelType === 'claude-code';

  const activeTabCwd = useTabMetadataStore(
    (state) => (activeTabId ? state.metadata[activeTabId]?.cwd : undefined),
  );
  const layoutWsId = useLayoutStore((state) => state.workspaceId);

  const { theme: terminalTheme } = useTerminalTheme();
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);

  const termActionsRef = useRef<ITermActions>(NOOP_TERM_ACTIONS);
  const wsActionsRef = useRef<IWsActions>(NOOP_WS_ACTIONS);
  const connectedSessionRef = useRef<string | null>(null);
  const prevConnectedTabIdRef = useRef<string | null>(null);
  const [attemptedTabId, setAttemptedTabId] = useState<string | null>(null);

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingForResizeRef = useRef(false);

  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  });

  const fetchAndUpdateCwd = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    const tab = tabId ? tabsRef.current.find((t) => t.id === tabId) : null;
    if (!tab) return;
    try {
      const res = await fetch(`/api/layout/cwd?session=${tab.sessionName}`);
      if (!res.ok) return;
      const { cwd } = await res.json();
      if (cwd) useTabMetadataStore.getState().setCwd(tab.id, cwd);
    } catch { /* ignore */ }
  }, []);

  const clearRef = useRef<() => void>(() => {});
  const focusInputRef = useRef<(() => void) | undefined>(undefined);
  const setInputValueRef = useRef<((v: string) => void) | undefined>(undefined);

  const pendingRestartRef = useRef(false);
  const lastTitleRef = useRef('');
  const claudeStatus = useTabStore((s) => activeTabId ? s.tabs[activeTabId]?.claudeStatus ?? 'unknown' : 'unknown');
  const isRestarting = useTabStore((s) => activeTabId ? s.tabs[activeTabId]?.isRestarting ?? false : false);

  const handleCliStateChange = useCallback((state: TCliState) => {
    onCliStateChange?.(state);
  }, [onCliStateChange]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleInputVisibleChange = useCallback((_visible: boolean) => {}, []);

  const handleCustomKeyEvent = useCallback((event: KeyboardEvent): boolean => {
    if (isAppShortcut(event)) {
      event.preventDefault();
      if (isClearShortcut(event)) clearRef.current();
      if (isFocusInputShortcut(event)) focusInputRef.current?.();
      return false;
    }
    if (isShiftEnter(event)) {
      event.preventDefault();
      wsActionsRef.current.sendStdin('\n');
      return false;
    }
    return true;
  }, []);

  const { terminalRef, write, clear, reset, fit, focus, isReady } = useTerminal({
    theme: terminalTheme.colors,
    fontSize: isClaudeCode ? undefined : MOBILE_FONT_SIZE,
    onInput: (data) => wsActionsRef.current.sendStdin(data),
    onResize: (cols, rows) => {
      wsActionsRef.current.sendResize(cols, rows);
      if (waitingForResizeRef.current) {
        if (showTimerRef.current) clearTimeout(showTimerRef.current);
        showTimerRef.current = setTimeout(() => {
          waitingForResizeRef.current = false;
          setShowTerminal(true);
        }, 200);
      }
    },
    onTitleChange: (title) => {
      const tabId = activeTabIdRef.current;
      if (!tabId) return;
      if (title === lastTitleRef.current) return;
      lastTitleRef.current = title;
      const formatted = formatTabTitle(title);
      useTabMetadataStore.getState().setTitle(tabId, formatted);
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab) {
        const prevCheckedAt = useTabStore.getState().tabs[tabId]?.claudeStatusCheckedAt ?? 0;
        fetch(`/api/check-claude?session=${tab.sessionName}`)
          .then((res) => res.json())
          .then(({ running, checkedAt }) => {
            const current = useTabStore.getState().tabs[tabId];
            if (current && current.claudeStatusCheckedAt !== prevCheckedAt) {
              if (current.claudeStatus !== (running ? 'running' : 'not-running')) {
                setTimeout(() => {
                  fetch(`/api/check-claude?session=${tab.sessionName}`)
                    .then((r) => r.json())
                    .then(({ running, checkedAt }) => {
                      useTabStore.getState().setClaudeStatus(tabId, running ? 'running' : 'not-running', checkedAt);
                    })
                    .catch(() => {});
                }, 500);
              }
              return;
            }
            useTabStore.getState().setClaudeStatus(tabId, running ? 'running' : 'not-running', checkedAt);
          })
          .catch(() => {});
      }
      fetchAndUpdateCwd();
    },
    customKeyEventHandler: handleCustomKeyEvent,
  });

  useEffect(() => {
    clearRef.current = clear;
  });

  const handleSessionEnded = useCallback(async () => {
    const currentTabs = tabsRef.current;
    const currentActiveTabId = activeTabIdRef.current;
    if (!currentActiveTabId) return;

    const sorted = [...currentTabs].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.id === currentActiveTabId);
    const adjacent = sorted[idx + 1] || sorted[idx - 1];

    if (adjacent) {
      onSwitchTab(paneId, adjacent.id);
      onRemoveTabLocally(paneId, currentActiveTabId);
    } else {
      onRemoveTabLocally(paneId, currentActiveTabId);
    }
  }, [paneId, onSwitchTab, onRemoveTabLocally]);

  const {
    status,
    retryCount,
    disconnectReason,
    connect,
    reconnect,
    sendStdin,
    sendWebStdin,
    sendResize,
  } = useTerminalWebSocket({
    onData: (data) => termActionsRef.current.write(data),
    onConnected: () => {
      setHasEverConnected(true);
      setAttemptedTabId(activeTabIdRef.current);
      prevConnectedTabIdRef.current = activeTabIdRef.current;
      const tabId = activeTabIdRef.current;
      if (tabId) useTabStore.getState().setTerminalConnected(tabId, true);
      const { cols, rows } = termActionsRef.current.fit();
      wsActionsRef.current.sendResize(cols, rows);
      fetchAndUpdateCwd();
    },
    onSessionEnded: handleSessionEnded,
  });

  useEffect(() => {
    termActionsRef.current = { write, reset, fit, focus };
    wsActionsRef.current = { sendStdin, sendResize };
  });

  useEffect(() => {
    if (!isReady) connectedSessionRef.current = null;
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    if (connectedSessionRef.current === tab.sessionName) return;

    if (connectedSessionRef.current !== null) reset();

    useTabStore.getState().initTab(activeTabId, {
      cliState: tab.cliState ?? 'inactive',
      terminalConnected: false,
      claudeStatus: 'unknown',
    });

    connectedSessionRef.current = tab.sessionName;
    connect(tab.sessionName);
  }, [isReady, activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    useTabStore.getState().setTerminalConnected(tabId, status === 'connected');
  }, [status]);

  useEffect(() => {
    if (status === 'disconnected' && hasEverConnected) {
      setAttemptedTabId(activeTabIdRef.current);
    }
  }, [status, hasEverConnected]);

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

  useEffect(() => {
    if (!isReady || status !== 'connected') return;
    const timer = setTimeout(() => {
      const { cols, rows } = fit();
      wsActionsRef.current.sendResize(cols, rows);
    }, 300);
    return () => clearTimeout(timer);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isClaudeCode) {
      setShowTerminal(false);
      waitingForResizeRef.current = false;
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      fetchAndUpdateCwd();
      return;
    }
    if (isReady && status === 'connected') {
      setShowTerminal(false);
      waitingForResizeRef.current = true;
      showTimerRef.current = setTimeout(() => {
        waitingForResizeRef.current = false;
        setShowTerminal(true);
      }, 200);
      return () => {
        if (showTimerRef.current) clearTimeout(showTimerRef.current);
        waitingForResizeRef.current = false;
      };
    }
    setShowTerminal(true);
  }, [isClaudeCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateTab = useCallback(async () => {
    setIsCreating(true);
    await onCreateTab(paneId);
    setIsCreating(false);
  }, [paneId, onCreateTab]);

  const handleNewClaudeSession = useCallback(() => {
    if (status !== 'connected' || !activeTabId) return;
    useTabStore.getState().setRestarting(activeTabId, true);
    const dangerous = useConfigStore.getState().dangerouslySkipPermissions;
    const settings = '--settings ~/.purplemux/hooks.json';
    const cmd = dangerous ? `claude ${settings} --dangerously-skip-permissions` : `claude ${settings}`;
    sendStdin(`${cmd}\r`);
  }, [status, sendStdin, activeTabId]);

  const handleRestartClaudeSession = useCallback(() => {
    if (status !== 'connected' || !activeTabId) return;
    pendingRestartRef.current = true;
    useTabStore.getState().setRestarting(activeTabId, true);
    sendStdin('/exit\r');
  }, [status, sendStdin, activeTabId]);

  useEffect(() => {
    if (!pendingRestartRef.current || claudeStatus === 'running') return;
    pendingRestartRef.current = false;
    if (status !== 'connected') return;
    const dangerous = useConfigStore.getState().dangerouslySkipPermissions;
    const settings = '--settings ~/.purplemux/hooks.json';
    const cmd = dangerous ? `claude ${settings} --dangerously-skip-permissions` : `claude ${settings}`;
    sendStdin(`${cmd}\r`);
  }, [claudeStatus, status, sendStdin]);

  const noTabs = tabs.length === 0;
  const ready = isReady && status === 'connected' && !noTabs;
  const isFirstConnectionForTab =
    activeTabId !== null && attemptedTabId !== activeTabId;
  const showInitialLoading =
    !noTabs &&
    (!isReady || (isReady && isFirstConnectionForTab && status !== 'connected'));

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        backgroundColor: terminalTheme.colors.background,
        overscrollBehavior: 'none',
      }}
    >
      {isClaudeCode && activeTab && (
        <MobileClaudeCodePanel
          tabId={activeTabId ?? undefined}
          wsId={layoutWsId ?? undefined}
          sessionName={activeTab.sessionName}
          claudeSessionId={activeTab.claudeSessionId}
          cwd={activeTabCwd}
          sendStdin={sendWebStdin}
          terminalWsConnected={status === 'connected'}
          focusTerminal={focus}
          focusInputRef={focusInputRef}
          setInputValueRef={setInputValueRef}
          onCliStateChange={handleCliStateChange}
          onInputVisibleChange={handleInputVisibleChange}
          onRestartSession={handleRestartClaudeSession}
          onNewSession={handleNewClaudeSession}
          isRestarting={isRestarting}
          onRestartComplete={() => { if (activeTabId) useTabStore.getState().setRestarting(activeTabId, false); }}
        />
      )}

      <TerminalContainer
        ref={terminalRef}
        className={cn(
          !isClaudeCode && 'transition-opacity duration-150',
          isClaudeCode ? 'absolute inset-0 pointer-events-none opacity-0' : 'min-h-0 flex-1',
          !isClaudeCode && ready && showTerminal ? 'opacity-100' : '',
          !isClaudeCode && (!ready || !showTerminal) ? 'opacity-0' : '',
        )}
      />

      {!isClaudeCode && status === 'connected' && (
        <MobileTerminalToolbar sendStdin={sendWebStdin} terminalConnected={status === 'connected'} />
      )}

      {noTabs && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
          <Button className="gap-1.5" onClick={onOpenNewTabDialog ?? handleCreateTab} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            새 탭 열기
          </Button>
        </div>
      )}


      {!noTabs && status === 'disconnected' && !isFirstConnectionForTab && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
          <WifiOff className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {(disconnectReason && DISCONNECT_MESSAGES[disconnectReason]) ??
              '서버에 연결할 수 없습니다'}
          </span>
          {disconnectReason === 'session-not-found' && activeTabId ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const ok = await useLayoutStore.getState().restartTabInPane(paneId, activeTabId);
                  if (ok) reconnect();
                }}
              >
                다시 시작
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteTab(paneId, activeTabId)}
              >
                탭 닫기
              </Button>
            </div>
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
  );
};

export default MobileSurfaceView;
