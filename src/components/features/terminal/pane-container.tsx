import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Group, Panel, Separator, type GroupImperativeHandle } from 'react-resizable-panels';
import { ChevronDown, ChevronUp, Loader2, Plus, TerminalSquare, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab, TDisconnectReason, TPanelType } from '@/types/terminal';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import { useShallow } from 'zustand/react/shallow';
import TerminalContainer from '@/components/features/terminal/terminal-container';
import ClaudeCodePanel from '@/components/features/terminal/claude-code-panel';
import WebInputBar from '@/components/features/terminal/web-input-bar';
import ConnectionStatus from '@/components/features/terminal/connection-status';
import PaneTabBar from '@/components/features/terminal/pane-tab-bar';
import { formatTabTitle, isShellProcess } from '@/lib/tab-title';
import { isAppShortcut, isClearShortcut, isFocusInputShortcut } from '@/lib/keyboard-shortcuts';
import type { TCliState } from '@/types/timeline';
import useTerminalTheme from '@/hooks/use-terminal-theme';

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
  onUpdateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
  onEqualizeRatios: () => void;
}

const CLAUDE_CODE_FONT_SIZE = 10;

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
  onUpdateTabPanelType,
  onEqualizeRatios,
}: IPaneContainerProps) => {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activePanelType: TPanelType = activeTab?.panelType ?? 'terminal';
  const isClaudeCode = activePanelType === 'claude-code';

  const { theme: terminalTheme } = useTerminalTheme();
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isPanelTransitioning, setIsPanelTransitioning] = useState(false);

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const tabTitles = useTabMetadataStore(
    useShallow((state) => {
      const result: Record<string, string> = {};
      for (const id of tabIds) {
        const t = state.metadata[id]?.title;
        if (t) result[id] = t;
      }
      return result;
    }),
  );

  const activeTabCwd = useTabMetadataStore(
    (state) => (activeTabId ? state.metadata[activeTabId]?.cwd : undefined),
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => {
      cancelAnimationFrame(id);
      if (claudeCheckTimerRef.current) clearTimeout(claudeCheckTimerRef.current);
    };
  }, []);
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

  const fetchAndUpdateCwd = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    const tab = tabId ? tabsRef.current.find((t) => t.id === tabId) : null;
    if (!tab) return;
    try {
      const res = await fetch(`/api/layout/cwd?session=${tab.sessionName}`);
      if (!res.ok) return;
      const { cwd } = await res.json();
      if (cwd) useTabMetadataStore.getState().setCwd(tab.id, cwd);
    } catch {
      /* ignore */
    }
  }, []);

  const clearRef = useRef<() => void>(() => {});
  const focusInputRef = useRef<(() => void) | undefined>(undefined);
  const processHintRef = useRef<((isClaudeRunning: boolean) => void) | undefined>(undefined);
  const manualToggleCooldownRef = useRef<Record<string, number>>({});
  const claudeCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkClaudeSession = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab || tab.panelType === 'claude-code') return;

    const cooldownTime = manualToggleCooldownRef.current[tabId];
    if (cooldownTime && Date.now() - cooldownTime < 10_000) return;

    try {
      const res = await fetch(`/api/timeline/session?session=${tab.sessionName}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'active') {
        const currentTab = tabsRef.current.find((t) => t.id === tabId);
        if (currentTab?.panelType !== 'claude-code') {
          setIsPanelTransitioning(true);
          onUpdateTabPanelType(paneId, tabId, 'claude-code');
        }
      }
    } catch {
      /* ignore */
    }
  }, [paneId, onUpdateTabPanelType]);

  const [claudeCliState, setClaudeCliState] = useState<TCliState>('inactive');
  const [claudeInputVisible, setClaudeInputVisible] = useState(false);

  const handleCliStateChange = useCallback((state: TCliState) => {
    setClaudeCliState(state);
  }, []);

  const handleInputVisibleChange = useCallback((visible: boolean) => {
    setClaudeInputVisible(visible);
  }, []);

  const handleCustomKeyEvent = useCallback((event: KeyboardEvent): boolean => {
    if (isAppShortcut(event)) {
      event.preventDefault();
      if (isClearShortcut(event)) clearRef.current();
      if (isFocusInputShortcut(event)) focusInputRef.current?.();
      return false;
    }
    return true;
  }, []);

  const { terminalRef, write, clear, reset, fit, focus, isReady } = useTerminal({
    theme: terminalTheme.colors,
    fontSize: isClaudeCode ? CLAUDE_CODE_FONT_SIZE : undefined,
    onInput: (data) => wsActionsRef.current.sendStdin(data),
    onResize: (cols, rows) => wsActionsRef.current.sendResize(cols, rows),
    onTitleChange: (title) => {
      const tabId = activeTabIdRef.current;
      if (!tabId) return;
      const formatted = formatTabTitle(title);
      useTabMetadataStore.getState().setTitle(tabId, formatted);
      fetchAndUpdateCwd();

      if (isShellProcess(title)) {
        processHintRef.current?.(false);
      } else {
        processHintRef.current?.(true);

        const tab = tabsRef.current.find((t) => t.id === tabId);
        if (tab?.panelType !== 'claude-code') {
          if (claudeCheckTimerRef.current) clearTimeout(claudeCheckTimerRef.current);
          claudeCheckTimerRef.current = setTimeout(() => checkClaudeSession(tabId), 500);
        }
      }
    },
    customKeyEventHandler: handleCustomKeyEvent,
  });

  useEffect(() => {
    clearRef.current = clear;
  });

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isFocusInputShortcut(e) && isFocused) {
        e.preventDefault();
        focusInputRef.current?.();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isFocused]);

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
      onRemoveTabLocally(paneId, currentActiveTabId);
    }
  }, [paneId, onSwitchTab, onRemoveTabLocally, onClosePane]);

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
      fetchAndUpdateCwd();
    },
    onSessionEnded: handleSessionEnded,
  });

  useEffect(() => {
    termActionsRef.current = { write, reset, fit, focus };
    wsActionsRef.current = { sendStdin, sendResize };
  });

  useEffect(() => {
    if (!isReady) {
      connectedSessionRef.current = null;
    }
  }, [isReady]);

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
    }, 150);
    return () => clearTimeout(timer);
  }, [paneCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isReady || status !== 'connected') return;
    const timer = setTimeout(() => {
      const { cols, rows } = fit();
      wsActionsRef.current.sendResize(cols, rows);
    }, 300);
    return () => clearTimeout(timer);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFocused && isReady && status === 'connected') {
      const { cols, rows } = fit();
      wsActionsRef.current.sendResize(cols, rows);
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
    const newTab = await onCreateTab(paneId);
    if (newTab) {
      const currentTabId = activeTabIdRef.current;
      const currentTitle = currentTabId
        ? useTabMetadataStore.getState().metadata[currentTabId]?.title
        : null;
      if (currentTitle) {
        useTabMetadataStore.getState().setTitle(newTab.id, currentTitle);
      }
    }
    setIsCreating(false);
  }, [paneId, onCreateTab]);

  const handleDeleteTab = useCallback(
    async (tabId: string) => {
      if (closingTabId) return;
      const isLastTab = tabs.length === 1;
      if (isLastTab && paneCount > 1) {
        onClosePane(paneId);
        return;
      }
      const isActive = tabId === activeTabId;
      if (isActive) {
        const sorted = [...tabs].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((t) => t.id === tabId);
        const adjacent = sorted[idx + 1] || sorted[idx - 1];
        if (adjacent) {
          onSwitchTab(paneId, adjacent.id);
        }
      }
      setClosingTabId(tabId);
      try {
        await onDeleteTab(paneId, tabId);
      } finally {
        setClosingTabId(null);
      }
    },
    [paneId, activeTabId, tabs, paneCount, closingTabId, onSwitchTab, onDeleteTab, onClosePane],
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

  const handleTogglePanelType = useCallback(() => {
    if (!activeTabId) return;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const current = activeTab?.panelType ?? 'terminal';
    const next: TPanelType = current === 'terminal' ? 'claude-code' : 'terminal';

    if (current === 'claude-code' && next === 'terminal') {
      manualToggleCooldownRef.current[activeTabId] = Date.now();
    }

    setIsPanelTransitioning(true);
    onUpdateTabPanelType(paneId, activeTabId, next);
  }, [paneId, activeTabId, tabs, onUpdateTabPanelType]);

  const splitGroupRef = useRef<GroupImperativeHandle>(null);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);

  const handleToggleTerminal = useCallback(() => {
    if (!splitGroupRef.current) return;
    setIsPanelTransitioning(true);
    const next = !isTerminalCollapsed;
    setIsTerminalCollapsed(next);
    splitGroupRef.current.setLayout(
      next
        ? { timeline: 100, 'terminal-area': 0 }
        : { timeline: 70, 'terminal-area': 30 },
    );
    setTimeout(() => {
      setIsPanelTransitioning(false);
      if (!isReady || status !== 'connected') return;
      const { cols, rows } = fit();
      wsActionsRef.current.sendResize(cols, rows);
    }, 150);
  }, [isTerminalCollapsed, isReady, status, fit]);

  useEffect(() => {
    if (!splitGroupRef.current) return;
    if (isClaudeCode) {
      setIsTerminalCollapsed(false);
      splitGroupRef.current.setLayout({ timeline: 70, 'terminal-area': 30 });
    } else {
      splitGroupRef.current.setLayout({ timeline: 0, 'terminal-area': 100 });
    }
    const timer = setTimeout(() => {
      setIsPanelTransitioning(false);
      if (!isReady || status !== 'connected') return;
      const { cols, rows } = fit();
      wsActionsRef.current.sendResize(cols, rows);
    }, 150);
    return () => clearTimeout(timer);
  }, [isClaudeCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const noTabs = tabs.length === 0;
  const ready = isReady && status === 'connected' && !noTabs;
  const showInitialLoading =
    !noTabs &&
    (!isReady ||
      (isReady && status === 'connecting' && !hasEverConnected));

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden',
        paneCount > 1 && 'border',
        paneCount > 1 && isFocused ? 'border-ui-purple' : 'border-transparent',
      )}
      style={{
        opacity: !mounted ? 0 : undefined,
        transition: 'opacity 200ms ease-out, border-color 150ms',
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
        tabTitles={tabTitles}
        activeTabCwd={activeTabCwd}
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
        onEqualizeRatios={onEqualizeRatios}
        activePanelType={activePanelType}
        activeTabCliState={claudeCliState}
        onTogglePanelType={handleTogglePanelType}
      />

      <div role="tabpanel" className="relative min-h-0 flex-1 flex flex-col" style={{ backgroundColor: terminalTheme.colors.background }}>
        <Group
          groupRef={splitGroupRef}
          orientation="vertical"
          defaultLayout={isClaudeCode
            ? { timeline: 70, 'terminal-area': 30 }
            : { timeline: 0, 'terminal-area': 100 }
          }
          className={cn('min-h-0 flex-1', isPanelTransitioning && '[&>[data-panel]]:[transition:flex-grow_150ms_ease-out]')}
        >
          <Panel
            id="timeline"
            minSize={0}
            collapsible
            collapsedSize={0}
            disabled={!isClaudeCode}
          >
            <div className="flex h-full flex-col bg-muted">
              {isClaudeCode && activeTab && (
                <ClaudeCodePanel
                  sessionName={activeTab.sessionName}
                  claudeSessionId={activeTab.claudeSessionId}
                  onCliStateChange={handleCliStateChange}
                  onInputVisibleChange={handleInputVisibleChange}
                  onClose={handleTogglePanelType}
                  processHintRef={processHintRef}
                />
              )}
              {isClaudeCode && (
                <WebInputBar
                  cliState={claudeCliState}
                  sendStdin={sendStdin}
                  terminalWsConnected={status === 'connected'}
                  visible={claudeInputVisible}
                  focusTerminal={focus}
                  focusInputRef={focusInputRef}
                />
              )}
            </div>
          </Panel>

          <Separator
            className={cn(
              'group flex items-center justify-center bg-muted',
              isClaudeCode && !isTerminalCollapsed ? 'h-4' : 'h-0',
            )}
            disabled={!isClaudeCode || isTerminalCollapsed}
          >
            <div className="h-px w-16 rounded-full bg-border transition-colors group-hover:bg-muted-foreground group-data-[resize-handle-active]:bg-muted-foreground" />
          </Separator>

          <Panel id="terminal-area" minSize={0} collapsible collapsedSize={0}>
            <div className="flex h-full flex-col">
              {isClaudeCode && (
                <div className="flex h-6 shrink-0 items-center gap-1.5 border-t border-border px-2 text-muted-foreground">
                  <TerminalSquare className="h-3 w-3" />
                  <span className="text-[11px] font-medium">Terminal</span>
                  {activeTabCwd && (
                    <span className="min-w-0 truncate text-[11px] opacity-60">
                      {activeTabCwd.replace(/^\/Users\/[^/]+/, '~')}
                    </span>
                  )}
                  <button
                    className="ml-auto flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
                    onClick={handleToggleTerminal}
                  >
                    {isTerminalCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
              )}

              <TerminalContainer
                ref={terminalRef}
                className={cn(
                  'min-h-0 flex-1 transition-opacity duration-150',
                  ready ? 'opacity-100' : 'opacity-0',
                )}
              />
            </div>
          </Panel>
        </Group>

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

        {closingTabId && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/80">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">프로세스 정리 중...</span>
          </div>
        )}

        {showInitialLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">연결 중...</span>
          </div>
        )}

        {!noTabs && status === 'disconnected' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <WifiOff className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
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
