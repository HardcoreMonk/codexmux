import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab, TPanelType } from '@/types/terminal';
import WebBrowserPanel from '@/components/features/workspace/web-browser-panel';
import DiffPanel from '@/components/features/workspace/diff-panel';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import TerminalContainer from '@/components/features/workspace/terminal-container';
import ConnectionStatus from '@/components/features/workspace/connection-status';
import MobileAgentPanel from '@/components/features/mobile/mobile-agent-panel';
import MobileTerminalToolbar from '@/components/features/mobile/mobile-terminal-toolbar';
import { formatTabTitle, isShellProcess } from '@/lib/tab-title';
import {
  isAppShortcut,
  isClearShortcut,
  isFocusInputShortcut,
  isShiftEnter,
  isTerminalEofShortcut,
  TERMINAL_EOF_INPUT,
} from '@/lib/keyboard-shortcuts';
import type { TCliState } from '@/types/timeline';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useTabStore, { selectAgentProcess, selectAgentProcessCheckedAt, selectSessionView } from '@/hooks/use-tab-store';
import { useLayoutStore } from '@/hooks/use-layout';
import { buildCodexCommandFromStore } from '@/lib/codex-client-command';
import { readAgentSessionId } from '@/lib/agent-tab-fields';
import { isAgentPanelType } from '@/lib/panel-type';


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
  onRemoveTabLocally: _onRemoveTabLocally,
  onUpdateTabPanelType,
  onCliStateChange,
  onOpenNewTabDialog,
}: IMobileSurfaceViewProps) => {
  const t = useTranslations('mobile');
  const tt = useTranslations('terminal');
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const isAgentPanel = isAgentPanelType(panelType);
  const isWebBrowser = panelType === 'web-browser';
  const isDiff = panelType === 'diff';

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
  const closingTabIdRef = useRef<string | null>(null);
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

  const pendingRestartRef = useRef<string | null>(null);
  const pendingAgentInputRef = useRef<string | null>(null);
  const lastTitleRef = useRef('');
  const agentProcess = useTabStore((s) => activeTabId ? selectAgentProcess(s.tabs, activeTabId) : null);
  const sessionView = useTabStore((s) => activeTabId ? selectSessionView(s.tabs, activeTabId) : null);

  const handleCliStateChange = useCallback((state: TCliState) => {
    onCliStateChange?.(state);
  }, [onCliStateChange]);

  const handleInputVisibleChange = useCallback((_visible: boolean) => {}, []);

  const handleCustomKeyEvent = useCallback((event: KeyboardEvent): boolean => {
    if (isTerminalEofShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      wsActionsRef.current.sendStdin(TERMINAL_EOF_INPUT);
      return false;
    }
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
    fontSize: isAgentPanel ? undefined : MOBILE_FONT_SIZE,
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
      if (isShellProcess(title) && pendingRestartRef.current) {
        const cmd = pendingRestartRef.current;
        pendingRestartRef.current = null;
        wsActionsRef.current.sendStdin(`${cmd}\r`);
      }
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab) {
        const prevCheckedAt = selectAgentProcessCheckedAt(useTabStore.getState().tabs, tabId);
        fetch(`/api/check-agent?session=${tab.sessionName}`)
          .then((res) => res.json())
          .then(({ running, checkedAt }) => {
            const current = useTabStore.getState().tabs[tabId];
            if (current && selectAgentProcessCheckedAt(useTabStore.getState().tabs, tabId) !== prevCheckedAt) {
              if (selectAgentProcess(useTabStore.getState().tabs, tabId) !== running) {
                setTimeout(() => {
                  fetch(`/api/check-agent?session=${tab.sessionName}`)
                    .then((r) => r.json())
                    .then(({ running, checkedAt }) => {
                      useTabStore.getState().setAgentProcess(tabId, running, checkedAt);
                    })
                    .catch(() => {});
                }, 500);
              }
              return;
            }
            useTabStore.getState().setAgentProcess(tabId, running, checkedAt);
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
    if (closingTabIdRef.current) return;

    const currentTabs = tabsRef.current;
    const currentActiveTabId = activeTabIdRef.current;
    if (!currentActiveTabId) return;

    closingTabIdRef.current = currentActiveTabId;

    const sorted = [...currentTabs].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.id === currentActiveTabId);
    const adjacent = sorted[idx + 1] || sorted[idx - 1];

    if (adjacent) {
      onSwitchTab(paneId, adjacent.id);
    }

    try {
      await onDeleteTab(paneId, currentActiveTabId);
    } finally {
      closingTabIdRef.current = null;
    }
  }, [paneId, onSwitchTab, onDeleteTab]);

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

  const handleReconnect = useCallback(() => {
    const tabId = activeTabIdRef.current;
    const tab = tabId ? tabsRef.current.find((t) => t.id === tabId) : null;
    if (!tab || tab.panelType === 'web-browser') {
      reconnect();
      return;
    }

    connectedSessionRef.current = tab.sessionName;
    setAttemptedTabId(tab.id);
    const { cols, rows } = termActionsRef.current.fit();
    connect(tab.sessionName, cols, rows);
  }, [connect, reconnect]);

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
    if (tab.panelType === 'web-browser') {
      connectedSessionRef.current = null;
      lastTitleRef.current = '';
      return;
    }
    if (connectedSessionRef.current === tab.sessionName) return;

    if (connectedSessionRef.current !== null) reset();

    useTabStore.getState().initTab(activeTabId, {
      terminalConnected: false,
      panelType: tab.panelType,
    });

    connectedSessionRef.current = tab.sessionName;
    setAttemptedTabId(activeTabId);
    const { cols, rows } = fit();
    connect(tab.sessionName, cols, rows);
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
    if (isAgentPanel) {
      waitingForResizeRef.current = false;
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      fetchAndUpdateCwd();
      return;
    }
    if (isReady && status === 'connected') {
      waitingForResizeRef.current = true;
      queueMicrotask(() => setShowTerminal(false));
      showTimerRef.current = setTimeout(() => {
        waitingForResizeRef.current = false;
        setShowTerminal(true);
      }, 200);
      return () => {
        if (showTimerRef.current) clearTimeout(showTimerRef.current);
        waitingForResizeRef.current = false;
      };
    }
    queueMicrotask(() => setShowTerminal(true));
  }, [isAgentPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateTab = useCallback(async () => {
    setIsCreating(true);
    await onCreateTab(paneId);
    setIsCreating(false);
  }, [paneId, onCreateTab]);

  const buildAgentCommand = useCallback((): string => {
    return buildCodexCommandFromStore();
  }, []);

  const handleNewAgentSession = useCallback(() => {
    if (status !== 'connected' || !activeTabId) return;
    useTabStore.getState().setSessionView(activeTabId, 'check');
    sendStdin(`${buildAgentCommand()}\r`);
  }, [status, sendStdin, activeTabId, buildAgentCommand]);

  const handleRestartAgentSession = useCallback(() => {
    if (status !== 'connected' || !activeTabId) return;
    pendingRestartRef.current = buildAgentCommand();
    useTabStore.getState().setSessionView(activeTabId, 'check');
    sendStdin('/exit\r');
  }, [status, sendStdin, activeTabId, buildAgentCommand]);

  useEffect(() => {
    if (!pendingRestartRef.current || agentProcess === true) return;
    if (status !== 'connected') return;
    if (!isShellProcess(lastTitleRef.current)) return;
    const cmd = pendingRestartRef.current;
    pendingRestartRef.current = null;
    sendStdin(`${cmd}\r`);
  }, [agentProcess, status, sendStdin]);

  const handleSendToAgent = useCallback((text: string) => {
    if (!activeTabId) return;
    pendingAgentInputRef.current = text;
    onUpdateTabPanelType(paneId, activeTabId, 'codex');
  }, [activeTabId, paneId, onUpdateTabPanelType]);

  useEffect(() => {
    if (!isAgentPanel || !pendingAgentInputRef.current) return;
    const text = pendingAgentInputRef.current;
    pendingAgentInputRef.current = null;
    const timer = window.setTimeout(() => {
      setInputValueRef.current?.(text);
      focusInputRef.current?.();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [isAgentPanel]);

  const handleWebUrlChange = useCallback((url: string) => {
    if (!activeTabId || !layoutWsId) return;
    fetch(`/api/layout/pane/${paneId}/tabs/${activeTabId}?workspace=${layoutWsId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webUrl: url }),
    }).catch(() => {});
  }, [activeTabId, paneId, layoutWsId]);

  const noTabs = tabs.length === 0;
  const ready = isWebBrowser || isDiff || (isReady && status === 'connected' && !noTabs);
  const isFirstConnectionForTab =
    activeTabId !== null && attemptedTabId !== activeTabId;

  const autoRestartedTabsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (status !== 'disconnected' || disconnectReason !== 'session-not-found') return;
    if (isFirstConnectionForTab) return;
    if (!activeTabId || !activeTab) return;
    const effectivePanelType = activeTab.panelType ?? 'terminal';
    if (effectivePanelType !== 'terminal') return;
    if (activeTab.lastCommand) return;
    if (autoRestartedTabsRef.current.has(activeTabId)) return;
    autoRestartedTabsRef.current.add(activeTabId);
    (async () => {
      const ok = await useLayoutStore.getState().restartTabInPane(paneId, activeTabId);
      if (ok) handleReconnect();
    })();
  }, [status, disconnectReason, activeTabId, activeTab, isFirstConnectionForTab, paneId, handleReconnect]);

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        backgroundColor: terminalTheme.colors.background,
        overscrollBehavior: 'none',
      }}
    >
      {isWebBrowser && activeTabId && (
        <WebBrowserPanel
          key={activeTabId}
          tabId={activeTabId}
          initialUrl={activeTab?.webUrl}
          onUrlChange={handleWebUrlChange}
        />
      )}

      {isDiff && activeTab && (
        <DiffPanel
          key={activeTab.sessionName}
          sessionName={activeTab.sessionName}
          onSendToAgent={handleSendToAgent}
        />
      )}

      {isAgentPanel && activeTab && (
        <MobileAgentPanel
          key={`${activeTab.sessionName}:${panelType}`}
          tabId={activeTabId ?? undefined}
          wsId={layoutWsId ?? undefined}
          sessionName={activeTab.sessionName}
          agentSessionId={readAgentSessionId(activeTab)}
          panelType={panelType}
          cwd={activeTabCwd}
          sendStdin={sendWebStdin}
          terminalWsConnected={status === 'connected'}
          focusTerminal={focus}
          focusInputRef={focusInputRef}
          setInputValueRef={setInputValueRef}
          onCliStateChange={handleCliStateChange}
          onInputVisibleChange={handleInputVisibleChange}
          onRestartSession={handleRestartAgentSession}
          onNewSession={handleNewAgentSession}
        />
      )}

      {!isWebBrowser && !isDiff && (
        <TerminalContainer
          ref={terminalRef}
          className={cn(
            !isAgentPanel && 'transition-opacity duration-150',
            isAgentPanel ? 'absolute inset-0 pointer-events-none opacity-0' : 'min-h-0 flex-1',
            !isAgentPanel && ready && showTerminal ? 'opacity-100' : '',
            !isAgentPanel && (!ready || !showTerminal) ? 'opacity-0' : '',
          )}
        />
      )}

      {!isAgentPanel && !isWebBrowser && !isDiff && status === 'connected' && (
        <MobileTerminalToolbar sendStdin={sendWebStdin} terminalConnected={status === 'connected'} />
      )}

      {noTabs && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 text-center">
          <Button
            className="gap-1.5 transition-transform active:scale-[0.99]"
            onClick={onOpenNewTabDialog ?? handleCreateTab}
            disabled={isCreating}
          >
            {isCreating ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {tt('openNewTab')}
          </Button>
        </div>
      )}


      {!noTabs && !isWebBrowser && status === 'disconnected' && !isFirstConnectionForTab && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 text-center">
          <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-xl border border-border/70 bg-card/90 px-5 py-5 ring-1 ring-border/30">
            <WifiOff className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {disconnectReason === 'max-connections'
                ? t('disconnectedMaxConnections')
                : disconnectReason === 'pty-error'
                  ? t('disconnectedPtyError')
                  : disconnectReason === 'session-not-found'
                    ? tt('disconnectedSessionNotFound')
                    : t('cannotConnectServer')}
            </span>
            {disconnectReason === 'session-not-found' && activeTabId ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="transition-transform active:scale-[0.99]"
                  onClick={async () => {
                    const ok = await useLayoutStore.getState().restartTabInPane(paneId, activeTabId);
                    if (ok) handleReconnect();
                  }}
                >
                  {t('restart')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="transition-transform active:scale-[0.99]"
                  onClick={() => onDeleteTab(paneId, activeTabId)}
                >
                  {tt('closeTabLabel')}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="transition-transform active:scale-[0.99]"
                onClick={handleReconnect}
              >
                {t('reconnect')}
              </Button>
            )}
          </div>
        </div>
      )}

      {!noTabs && !isWebBrowser && !isDiff && !(isAgentPanel && sessionView === 'check') && (
        <ConnectionStatus
          status={status}
          retryCount={retryCount}
          disconnectReason={disconnectReason}
          onReconnect={handleReconnect}
        />
      )}
    </div>
  );
};

export default MobileSurfaceView;
