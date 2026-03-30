import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { Group, Panel, Separator, type GroupImperativeHandle } from 'react-resizable-panels';
import { ChevronDown, ChevronUp, Loader2, Plus, TerminalSquare, WifiOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab, TDisconnectReason, TPanelType } from '@/types/terminal';
import { findPane } from '@/lib/layout-tree';
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
import { formatTabTitle } from '@/lib/tab-title';
import { isAppShortcut, isClearShortcut, isFocusInputShortcut, isShiftEnter } from '@/lib/keyboard-shortcuts';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useTabStore, { selectSessionView, isCliIdle } from '@/hooks/use-tab-store';
import { dismissTab as dismissStatusTab } from '@/hooks/use-claude-status';
import isElectron from '@/hooks/use-is-electron';

const escapeShellPath = (filePath: string): string =>
  filePath.replace(/[ \t\\'"(){}[\]!#$&;`|*?<>~^%]/g, '\\$&');

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
}

const CLAUDE_CODE_FONT_SIZE = 11;
const EMPTY_TABS: ITab[] = [];

const PaneContainer = memo(({ paneId, paneNumber }: IPaneContainerProps) => {
  const pane = useLayoutStore((s) => (s.layout ? findPane(s.layout.root, paneId) : null));
  const tabs = pane?.tabs ?? EMPTY_TABS;
  const activeTabId = pane?.activeTabId ?? null;
  const isFocused = useLayoutStore((s) => s.layout?.activePaneId === paneId);
  const paneCount = useLayoutStore((s) => s.paneCount);
  const isSplitting = useLayoutStore((s) => s.isSplitting);

  const switchTabInPane = useLayoutStore((s) => s.switchTabInPane);
  const createTabInPane = useLayoutStore((s) => s.createTabInPane);
  const deleteTabInPane = useLayoutStore((s) => s.deleteTabInPane);
  const closePane = useLayoutStore((s) => s.closePane);
  const focusPane = useLayoutStore((s) => s.focusPane);
  const moveTab = useLayoutStore((s) => s.moveTab);
  const renameTabInPane = useLayoutStore((s) => s.renameTabInPane);
  const reorderTabsInPane = useLayoutStore((s) => s.reorderTabsInPane);
  const updateTabPanelType = useLayoutStore((s) => s.updateTabPanelType);

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

  const scrollToBottomRef = useRef<(() => void) | undefined>(undefined);
  const pendingRestartRef = useRef(false);
  const lastTitleRef = useRef('');

  const claudeCliState = useTabStore((s) => activeTabId ? s.tabs[activeTabId]?.cliState ?? 'inactive' : 'inactive');
  const claudeStatus = useTabStore((s) => activeTabId ? s.tabs[activeTabId]?.claudeStatus ?? 'unknown' : 'unknown');
  const sessionView = useTabStore((s) => activeTabId ? selectSessionView(s.tabs, activeTabId) : 'inactive');
  const claudeInputVisible = sessionView === 'timeline';

  const { prompts: quickPrompts } = useQuickPrompts();

  const claudeModeShownTabsRef = useRef<Set<string>>(new Set());
  const [showClaudeModePrompt, setShowClaudeModePrompt] = useState(false);

  useEffect(() => {
    if (!activeTabId || !isClaudeCode) return;
    if (isFocused && isCliIdle(claudeCliState)) {
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
      closePane(paneId);
      return;
    }

    const sorted = [...currentTabs].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.id === currentActiveTabId);
    const adjacent = sorted[idx + 1] || sorted[idx - 1];
    if (adjacent) {
      switchTabInPane(paneId, adjacent.id);
    }

    setClosingTabId(currentActiveTabId);
    try {
      await deleteTabInPane(paneId, currentActiveTabId);
    } finally {
      setClosingTabId(null);
    }
  }, [paneId, switchTabInPane, deleteTabInPane, closePane]);

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
      const tabId = activeTabIdRef.current;
      if (tabId) useTabStore.getState().setTerminalConnected(tabId, true);
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
      lastTitleRef.current = '';
    }

    // 탭 전환 시 스토어 초기화 (layout.json 값 + 터미널 리셋)
    useTabStore.getState().initTab(activeTabId, {
      cliState: tab.cliState ?? 'inactive',
      terminalConnected: false,
      claudeStatus: 'unknown',
    });

    connectedSessionRef.current = tab.sessionName;
    const { cols, rows } = fit();
    connect(tab.sessionName, cols, rows);
  }, [isReady, activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    useTabStore.getState().setTerminalConnected(tabId, status === 'connected');
  }, [status]);

  useEffect(() => {
    if (
      status === 'disconnected' &&
      hasEverConnected &&
      prevConnectedTabIdRef.current &&
      prevConnectedTabIdRef.current !== activeTabId &&
      tabs.some((t) => t.id === prevConnectedTabIdRef.current)
    ) {
      connectedSessionRef.current = null;
      switchTabInPane(paneId, prevConnectedTabIdRef.current);
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
      dismissStatusTab(tabId);
      switchTabInPane(paneId, tabId);
    },
    [paneId, activeTabId, switchTabInPane],
  );

  const handleCreateTab = useCallback(async () => {
    setIsCreating(true);
    const newTab = await createTabInPane(paneId);
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
  }, [paneId, createTabInPane]);

  const handleDeleteTab = useCallback(
    async (tabId: string) => {
      if (closingTabId) return;
      const isLastTab = tabs.length === 1;
      if (isLastTab && paneCount > 1) {
        closePane(paneId);
        return;
      }
      const isActive = tabId === activeTabId;
      if (isActive) {
        const sorted = [...tabs].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((t) => t.id === tabId);
        const adjacent = sorted[idx + 1] || sorted[idx - 1];
        if (adjacent) {
          switchTabInPane(paneId, adjacent.id);
        }
      }
      setClosingTabId(tabId);
      try {
        await deleteTabInPane(paneId, tabId);
      } finally {
        setClosingTabId(null);
      }
    },
    [paneId, activeTabId, tabs, paneCount, closingTabId, switchTabInPane, deleteTabInPane, closePane],
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
      renameTabInPane(paneId, tabId, name);
    },
    [paneId, renameTabInPane],
  );

  const handleReorderTabs = useCallback(
    (tabIds: string[]) => {
      reorderTabsInPane(paneId, tabIds);
    },
    [paneId, reorderTabsInPane],
  );

  const handleMoveTab = useCallback(
    (tabId: string, fromPaneId: string, toIndex: number) => {
      moveTab(tabId, fromPaneId, paneId, toIndex);
    },
    [paneId, moveTab],
  );

  const handleFocusPane = useCallback(() => {
    focusPane(paneId);
  }, [paneId, focusPane]);

  const handleTogglePanelType = useCallback(() => {
    if (!activeTabId) return;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const current = activeTab?.panelType ?? 'terminal';
    const next: TPanelType = current === 'terminal' ? 'claude-code' : 'terminal';

    setIsPanelTransitioning(true);
    updateTabPanelType(paneId, activeTabId, next);
  }, [paneId, activeTabId, tabs, updateTabPanelType]);

  useEffect(() => {
    if (!activeTabId || claudeStatus !== 'running' || activePanelType !== 'terminal') {
      setShowClaudeModePrompt(false);
      return;
    }
    if (claudeModeShownTabsRef.current.has(activeTabId)) return;

    claudeModeShownTabsRef.current.add(activeTabId);
    setShowClaudeModePrompt(true);
  }, [activeTabId, claudeStatus, activePanelType]);

  const [showPathInput, setShowPathInput] = useState(false);
  const [droppedFileHint, setDroppedFileHint] = useState('');
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showPathInput) pathInputRef.current?.focus();
  }, [showPathInput]);

  const handleTerminalDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleTerminalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const { files } = e.dataTransfer;
    if (files.length === 0) return;

    const electronAPI = isElectron
      ? (window as unknown as { electronAPI: { getPathForFile: (file: File) => string } }).electronAPI
      : null;

    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const filePath = electronAPI?.getPathForFile(files[i]);
      if (filePath) {
        paths.push(escapeShellPath(filePath));
      }
    }

    if (paths.length > 0) {
      wsActionsRef.current.sendStdin(`\x1b[200~${paths.join(' ')}\x1b[201~`);
      focus();
    } else {
      const names = Array.from(files).map((f) => f.name).join(', ');
      setDroppedFileHint(names);
      setShowPathInput(true);
    }
  }, [focus]);

  const handlePathInputSubmit = useCallback((value: string) => {
    setShowPathInput(false);
    setDroppedFileHint('');
    if (value.trim()) {
      const escaped = escapeShellPath(value.trim());
      wsActionsRef.current.sendStdin(`\x1b[200~${escaped}\x1b[201~`);
      focus();
    }
  }, [focus]);

  const handlePathInputDismiss = useCallback(() => {
    setShowPathInput(false);
    setDroppedFileHint('');
    focus();
  }, [focus]);

  const handleNewClaudeSession = useCallback(() => {
    if (status !== 'connected' || !activeTabId) return;
    useTabStore.getState().setRestarting(activeTabId, true);
    const dangerous = useWorkspaceStore.getState().dangerouslySkipPermissions;
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
    const dangerous = useWorkspaceStore.getState().dangerouslySkipPermissions;
    const settings = '--settings ~/.purplemux/hooks.json';
    const cmd = dangerous ? `claude ${settings} --dangerously-skip-permissions` : `claude ${settings}`;
    sendStdin(`${cmd}\r`);
  }, [claudeStatus, status, sendStdin]);

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
        onClosePane={() => closePane(paneId)}
        onMoveTab={handleMoveTab}
        onFocusPane={handleFocusPane}
        onRetry={() => {}}
      />

      <div
        role="tabpanel"
        className="relative min-h-0 flex-1 flex flex-col"
        style={{ backgroundColor: terminalTheme.colors.background }}
        onDragOver={handleTerminalDragOver}
        onDrop={handleTerminalDrop}
      >
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
              {isClaudeCode && activeTab && !showInitialLoading && activeTabId && (
                <ClaudeCodePanel
                  key={activeTab.sessionName}
                  tabId={activeTabId}
                  sessionName={activeTab.sessionName}
                  claudeSessionId={activeTab.claudeSessionId}
                  cwd={activeTabCwd || activeTab.cwd}
                  onClose={handleTogglePanelType}
                  onNewSession={handleNewClaudeSession}
                  scrollToBottomRef={scrollToBottomRef}
                />
              )}
              {isClaudeCode && !showInitialLoading && claudeInputVisible && (
                <WebInputBar
                  key={activeTabId}
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
              {isClaudeCode && !showInitialLoading && claudeInputVisible && activeTabId && (
                <QuickPromptBar
                  prompts={quickPrompts}
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
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/80 animate-delayed-fade-in">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">프로세스 정리 중...</span>
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

        {showPathInput && (
          <div className="absolute bottom-3 left-3 right-3 z-30 rounded-lg border border-border bg-card shadow-lg animate-[fadeIn_150ms_ease-out]">
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <span className="text-xs text-muted-foreground">웹에서는 파일 드래그앤드롭을 지원하지 않습니다</span>
              <button
                className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                onClick={handlePathInputDismiss}
                aria-label="닫기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="px-3 pt-1 pb-2.5">
              <div className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5">
                <span className="shrink-0 text-xs text-muted-foreground/60">{droppedFileHint}</span>
                <input
                  ref={pathInputRef}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                  placeholder="전체 경로를 입력하세요 (예: /Users/...)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePathInputSubmit(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      handlePathInputDismiss();
                    }
                  }}
                />
              </div>
            </div>
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
});
PaneContainer.displayName = 'PaneContainer';

export default PaneContainer;
