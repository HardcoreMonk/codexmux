import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Group, Panel, Separator, type GroupImperativeHandle } from 'react-resizable-panels';
import { ChevronDown, ChevronUp, Loader2, Plus, TerminalSquare, WifiOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab, TDisconnectReason, TPanelType } from '@/types/terminal';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import { useLayoutStore } from '@/hooks/use-layout';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useShallow } from 'zustand/react/shallow';
import TerminalContainer from '@/components/features/terminal/terminal-container';
import ClaudeCodePanel from '@/components/features/terminal/claude-code-panel';
import WebInputBar from '@/components/features/terminal/web-input-bar';
import QuickPromptBar from '@/components/features/terminal/quick-prompt-bar';
import ConnectionStatus from '@/components/features/terminal/connection-status';
import useQuickPrompts from '@/hooks/use-quick-prompts';
import PaneTabBar from '@/components/features/terminal/pane-tab-bar';
import { formatTabTitle, isClaudeProcess } from '@/lib/tab-title';
import { isAppShortcut, isClearShortcut, isFocusInputShortcut, isShiftEnter } from '@/lib/keyboard-shortcuts';
import type { TCliState } from '@/types/timeline';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import { reportActiveTab, dismissTab as dismissStatusTab } from '@/hooks/use-claude-status';

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
  onUpdateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
}

const CLAUDE_CODE_FONT_SIZE = 11;

const PaneContainer = ({
  paneId,
  paneNumber,
  tabs,
  activeTabId,
  isFocused,
  paneCount,
  isSplitting,
  onClosePane,
  onFocusPane,
  onMoveTab,
  onCreateTab,
  onDeleteTab,
  onSwitchTab,
  onRenameTab,
  onReorderTabs,
  onUpdateTabPanelType,
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

  const layoutWsId = useLayoutStore((state) => state.workspaceId);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => {
      cancelAnimationFrame(id);
    };
  }, []);
  const termActionsRef = useRef<ITermActions>(NOOP_TERM_ACTIONS);
  const wsActionsRef = useRef<IWsActions>(NOOP_WS_ACTIONS);
  const connectedSessionRef = useRef<string | null>(null);
  const prevConnectedTabIdRef = useRef<string | null>(null);

  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const paneCountRef = useRef(paneCount);
  const isFocusedRef = useRef(isFocused);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
    paneCountRef.current = paneCount;
    isFocusedRef.current = isFocused;
  });

  const fetchAndUpdateCwd = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    const tab = tabId ? tabsRef.current.find((t) => t.id === tabId) : null;
    if (!tab) return;
    try {
      const res = await fetch(`/api/layout/cwd?session=${tab.sessionName}`);
      if (!res.ok) return;
      const { cwd, lastCommand } = await res.json();
      if (cwd) useTabMetadataStore.getState().setCwd(tab.id, cwd);
      if (lastCommand) useTabMetadataStore.getState().setLastCommand(tab.id, lastCommand);
    } catch {
      /* ignore */
    }
  }, []);

  const clearRef = useRef<() => void>(() => {});
  const focusInputRef = useRef<(() => void) | undefined>(undefined);
  const setInputValueRef = useRef<((v: string) => void) | undefined>(undefined);
  const clickedTerminalRef = useRef(false);

  const [claudeCliState, setClaudeCliState] = useState<TCliState>('inactive');
  const [claudeInputVisible, setClaudeInputVisible] = useState(false);
  const [isClaudeRunning, setIsClaudeRunning] = useState(false);
  const scrollToBottomRef = useRef<(() => void) | undefined>(undefined);
  const pendingRestartRef = useRef(false);
  const [isRestarting, setIsRestarting] = useState(false);

  const { prompts: quickPrompts } = useQuickPrompts();

  const claudeModeShownTabsRef = useRef<Set<string>>(new Set());
  const [showClaudeModePrompt, setShowClaudeModePrompt] = useState(false);

  useEffect(() => {
    if (!activeTabId || !isClaudeCode || claudeCliState === 'inactive') return;
    reportActiveTab(activeTabId, claudeCliState);
    if (isFocused && claudeCliState === 'idle') {
      dismissStatusTab(activeTabId);
    }
  }, [activeTabId, claudeCliState, isClaudeCode, isFocused]);

  useEffect(() => {
    if (activeTabId && isFocused) {
      dismissStatusTab(activeTabId);
    }
  }, [activeTabId, isFocused]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottomRef.current?.();
  }, []);

  const handleSelectQuickPrompt = useCallback((prompt: string) => {
    setInputValueRef.current?.(prompt);
    focusInputRef.current?.();
  }, []);

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
    if (isShiftEnter(event)) {
      event.preventDefault();
      wsActionsRef.current.sendStdin('\n');
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
      setIsClaudeRunning(isClaudeProcess(title));
      fetchAndUpdateCwd();
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

    const isLastTab = currentTabs.length === 1;
    if (isLastTab && currentPaneCount > 1) {
      onClosePane(paneId);
      return;
    }

    const sorted = [...currentTabs].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.id === currentActiveTabId);
    const adjacent = sorted[idx + 1] || sorted[idx - 1];
    if (adjacent) {
      onSwitchTab(paneId, adjacent.id);
    }

    setClosingTabId(currentActiveTabId);
    try {
      await onDeleteTab(paneId, currentActiveTabId);
    } finally {
      setClosingTabId(null);
    }
  }, [paneId, onSwitchTab, onDeleteTab, onClosePane]);

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
      prevConnectedTabIdRef.current = activeTabIdRef.current;
      const { cols, rows } = termActionsRef.current.fit();
      wsActionsRef.current.sendResize(cols, rows);
      if (isFocusedRef.current) {
        termActionsRef.current.focus();
      }
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
    const { cols, rows } = fit();
    connect(tab.sessionName, cols, rows);
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
      const targetTerminal = clickedTerminalRef.current;
      clickedTerminalRef.current = false;
      if (targetTerminal || !isClaudeCode || !claudeInputVisible) {
        focus();
      } else {
        focusInputRef.current?.();
      }
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

  const handleRestartTab = useCallback(
    async (tabId: string, command?: string) => {
      const ok = await useLayoutStore.getState().restartTabInPane(paneId, tabId, command);
      if (ok) reconnect();
    },
    [paneId, reconnect],
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

    setIsPanelTransitioning(true);
    onUpdateTabPanelType(paneId, activeTabId, next);
  }, [paneId, activeTabId, tabs, onUpdateTabPanelType]);

  useEffect(() => {
    if (!activeTabId || !isClaudeRunning || activePanelType !== 'terminal') {
      setShowClaudeModePrompt(false);
      return;
    }
    if (claudeModeShownTabsRef.current.has(activeTabId)) return;

    claudeModeShownTabsRef.current.add(activeTabId);
    setShowClaudeModePrompt(true);
  }, [activeTabId, isClaudeRunning, activePanelType]);

  const handleNewClaudeSession = useCallback(() => {
    if (status !== 'connected') return;
    const dangerous = useWorkspaceStore.getState().dangerouslySkipPermissions;
    const cmd = dangerous ? 'claude --dangerously-skip-permissions' : 'claude';
    sendStdin(`${cmd}\r`);
  }, [status, sendStdin]);

  const handleRestartClaudeSession = useCallback(() => {
    if (status !== 'connected') return;
    pendingRestartRef.current = true;
    setIsRestarting(true);
    sendStdin('/exit\r');
  }, [status, sendStdin]);

  useEffect(() => {
    if (!pendingRestartRef.current || isClaudeRunning) return;
    pendingRestartRef.current = false;
    if (status !== 'connected') return;
    const dangerous = useWorkspaceStore.getState().dangerouslySkipPermissions;
    const cmd = dangerous ? 'claude --dangerously-skip-permissions' : 'claude';
    sendStdin(`${cmd}\r`);
  }, [isClaudeRunning, status, sendStdin]);

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
      if (isFocused) {
        if (isClaudeCode) {
          if (claudeInputVisible) focusInputRef.current?.();
        } else {
          focus();
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [isClaudeCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFocused && isClaudeCode && claudeInputVisible) {
      focusInputRef.current?.();
    }
  }, [claudeInputVisible]); // eslint-disable-line react-hooks/exhaustive-deps

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
        isLoading={false}
        error={null}
        isCreating={isCreating}
        paneCount={paneCount}
        isSplitting={isSplitting}
        onSwitchTab={handleSwitchTab}
        onCreateTab={handleCreateTab}
        onDeleteTab={handleDeleteTab}
        onRenameTab={handleRenameTab}
        onReorderTabs={handleReorderTabs}
        onClosePane={() => onClosePane(paneId)}
        onMoveTab={handleMoveTab}
        onFocusPane={handleFocusPane}
        onRetry={() => {}}
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
            <div className={cn('flex h-full flex-col bg-card', isTerminalCollapsed && 'pb-3')}>
              {isClaudeCode && activeTab && !showInitialLoading && (
                <ClaudeCodePanel
                  sessionName={activeTab.sessionName}
                  claudeSessionId={activeTab.claudeSessionId}
                  isClaudeRunning={isClaudeRunning}
                  terminalWsConnected={status === 'connected'}
                  cwd={activeTabCwd}
                  onCliStateChange={handleCliStateChange}
                  onInputVisibleChange={handleInputVisibleChange}
                  onClose={handleTogglePanelType}
                  onNewSession={handleNewClaudeSession}
                  isRestarting={isRestarting}
                  onRestartComplete={() => setIsRestarting(false)}
                  scrollToBottomRef={scrollToBottomRef}
                />
              )}
              {isClaudeCode && !showInitialLoading && claudeInputVisible && (
                <WebInputBar
                  tabId={activeTabId ?? undefined}
                  wsId={layoutWsId ?? undefined}
                  cliState={claudeCliState}
                  sendStdin={sendWebStdin}
                  terminalWsConnected={status === 'connected'}
                  visible
                  focusTerminal={focus}
                  focusInputRef={focusInputRef}
                  setInputValueRef={setInputValueRef}
                  onRestartSession={handleRestartClaudeSession}
                  onSend={handleScrollToBottom}
                />
              )}
              {isClaudeCode && !showInitialLoading && claudeInputVisible && (
                <QuickPromptBar
                  prompts={quickPrompts}
                  cliState={claudeCliState}
                  visible
                  onSelect={handleSelectQuickPrompt}
                />
              )}
            </div>
          </Panel>

          <Separator
            className={cn(
              'group flex items-center justify-center overflow-hidden bg-card',
              isClaudeCode && !isTerminalCollapsed ? 'h-3' : 'h-0',
            )}
            disabled={!isClaudeCode || isTerminalCollapsed}
          >
            <div className="h-px w-16 rounded-full bg-border transition-colors group-hover:bg-muted-foreground group-data-[resize-handle-active]:bg-muted-foreground" />
          </Separator>

          {isClaudeCode && (
            <button
              className="flex h-6 w-full shrink-0 cursor-pointer items-center gap-1.5 border-t border-border bg-black/3 px-2 text-muted-foreground transition-colors hover:bg-black/5 dark:bg-white/3 dark:hover:bg-white/5"
              onClick={handleToggleTerminal}
            >
              <TerminalSquare className="h-3 w-3" />
              <span className="text-[11px] font-medium">Terminal</span>
              {activeTabCwd && (
                <span className="min-w-0 truncate text-[11px] opacity-60">
                  {activeTabCwd.replace(/^\/Users\/[^/]+/, '~')}
                </span>
              )}
              <span className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center">
                {isTerminalCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </span>
            </button>
          )}

          <Panel id="terminal-area" minSize={0} collapsible collapsedSize={0}>
            <div className="flex h-full flex-col" onMouseDown={() => { clickedTerminalRef.current = true; }}>
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
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/80 animate-[fadeIn_400ms_ease-out_200ms_both]">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">프로세스 정리 중...</span>
          </div>
        )}

        {showInitialLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 animate-[fadeIn_300ms_ease-out_150ms_both]">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">연결 중...</span>
          </div>
        )}

        {!noTabs && status === 'disconnected' && disconnectReason === 'session-not-found' && activeTabId && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <WifiOff className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {DISCONNECT_MESSAGES['session-not-found']}
            </span>
            <div className="flex flex-col items-center gap-3">
              {activeTab?.cwd && (
                <span className="max-w-72 truncate text-xs text-muted-foreground/60">{activeTab.cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
              )}
              {activeTab?.lastCommand && (
                <div className="flex flex-col items-center gap-2">
                  <code className="max-w-64 truncate rounded bg-muted px-2 py-1 text-xs">{activeTab.lastCommand}</code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestartTab(activeTabId, activeTab.lastCommand!)}
                  >
                    이 커맨드로 시작
                  </Button>
                </div>
              )}
              {activeTab?.lastCommand && (
                <div className="flex w-40 items-center gap-2 text-muted-foreground/40">
                  <div className="h-px flex-1 bg-current" />
                  <span className="text-[11px]">또는</span>
                  <div className="h-px flex-1 bg-current" />
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestartTab(activeTabId)}
              >
                새 터미널로 시작
              </Button>
            </div>
          </div>
        )}

        {showClaudeModePrompt && (
          <div className="absolute right-3 bottom-3 z-20 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg animate-[fadeIn_200ms_ease-out]">
            <span className="text-xs text-muted-foreground">CLAUDE 모드로 전환할까요?</span>
            <Button
              variant="default"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                setShowClaudeModePrompt(false);
                handleTogglePanelType();
              }}
            >
              전환
            </Button>
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={() => setShowClaudeModePrompt(false)}
              aria-label="닫기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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
