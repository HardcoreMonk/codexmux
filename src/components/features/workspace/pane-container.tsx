import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
import { Group, Panel, Separator, type GroupImperativeHandle } from 'react-resizable-panels';
import { ChevronDown, ChevronUp, Plus, TerminalSquare } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab, TPanelType } from '@/types/terminal';
import { findPane } from '@/lib/layout-tree';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import { useLayoutStore } from '@/hooks/use-layout';
import useConfigStore from '@/hooks/use-config-store';
import { useShallow } from 'zustand/react/shallow';
import TerminalContainer from '@/components/features/workspace/terminal-container';
import ClaudeCodePanel from '@/components/features/workspace/claude-code-panel';
import WebInputBar from '@/components/features/workspace/web-input-bar';
import QuickPromptBar from '@/components/features/workspace/quick-prompt-bar';
import ConnectionStatus from '@/components/features/workspace/connection-status';
import WebBrowserPanel from '@/components/features/workspace/web-browser-panel';
import DiffPanel from '@/components/features/workspace/diff-panel';
import PaneDisconnectedOverlay from '@/components/features/workspace/pane-disconnected-overlay';
import PaneClaudeModePrompt from '@/components/features/workspace/pane-claude-mode-prompt';
import PanePathInputOverlay from '@/components/features/workspace/pane-path-input-overlay';
import useQuickPrompts from '@/hooks/use-quick-prompts';
import useFileDrop from '@/hooks/use-file-drop';
import PaneTabBar from '@/components/features/workspace/pane-tab-bar';
import { formatTabTitle, parseCurrentCommand, isShellProcess } from '@/lib/tab-title';
import { isAppShortcut, isClearShortcut, isFocusInputShortcut, isShiftEnter } from '@/lib/keyboard-shortcuts';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useTabStore, { selectSessionView, isCliIdle } from '@/hooks/use-tab-store';
import { dismissTab as dismissStatusTab } from '@/hooks/use-claude-status';


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

const TERMINAL_FONT_SIZES: Record<string, { normal: number; claudeCode: number }> = {
  normal: { normal: 12, claudeCode: 10 },
  large: { normal: 14, claudeCode: 12 },
  'x-large': { normal: 16, claudeCode: 14 },
};

const EMPTY_TABS: ITab[] = [];

const PaneContainer = memo(({ paneId, paneNumber }: IPaneContainerProps) => {
  const t = useTranslations('terminal');

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
  const updateTabTerminalLayout = useLayoutStore((s) => s.updateTabTerminalLayout);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activePanelType: TPanelType = activeTab?.panelType ?? 'terminal';
  const isClaudeCode = activePanelType === 'claude-code';
  const isWebBrowser = activePanelType === 'web-browser';
  const isDiff = activePanelType === 'diff';

  const { theme: terminalTheme } = useTerminalTheme();
  const configFontSize = useConfigStore((s) => s.fontSize);
  const claudeShowTerminal = useConfigStore((s) => s.claudeShowTerminal);
  const effectiveTerminalCollapsed = activeTab?.terminalCollapsed ?? !claudeShowTerminal;
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [sessionSwitching, setSessionSwitching] = useState(false);
  const sessionSwitchTimerRef = useRef(0);
  const [isCreating, setIsCreating] = useState(false);
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

  const tabProcesses = useTabStore(
    useShallow((state) => {
      const result: Record<string, string> = {};
      for (const id of tabIds) {
        const p = state.tabs[id]?.currentProcess;
        if (p) result[id] = p;
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
  const closingTabIdRef = useRef<string | null>(null);

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
      useTabMetadataStore.getState().setLastCommand(tab.id, lastCommand ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  const clearRef = useRef<() => void>(() => {});
  const focusInputRef = useRef<(() => void) | undefined>(undefined);
  const setInputValueRef = useRef<((v: string) => void) | undefined>(undefined);
  const pendingClaudeInputRef = useRef<string | null>(null);
  const clickedTerminalRef = useRef(false);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingFocusRef = useRef<(() => void) | null>(null);
  const wasDragRef = useRef(false);

  const scrollToBottomRef = useRef<(() => void) | undefined>(undefined);
  const addPendingMessageRef = useRef<((text: string, options?: { autoHide?: boolean; attachmentPlaceholder?: boolean }) => string) | undefined>(undefined);
  const removePendingMessageRef = useRef<((id: string) => void) | undefined>(undefined);
  const attachFilesRef = useRef<((files: File[]) => Promise<boolean> | void) | undefined>(undefined);
  const pendingRestartRef = useRef<string | null>(null);
  const lastTitleRef = useRef('');

  const claudeCliState = useTabStore((s) => activeTabId ? s.tabs[activeTabId]?.cliState ?? 'inactive' : 'inactive');
  const claudeProcess = useTabStore((s) => activeTabId ? s.tabs[activeTabId]?.claudeProcess ?? null : null);
  const claudeSessionId = useTabStore((s) => activeTabId ? s.tabs[activeTabId]?.claudeSessionId ?? null : null);
  const sessionView = useTabStore((s) => activeTabId ? selectSessionView(s.tabs, activeTabId) : 'session-list');
  const claudeInputVisible = sessionView === 'timeline';

  const deferredFocusInput = useCallback((fn: () => void) => {
    if (wasDragRef.current) return;
    if (pointerDownPosRef.current) {
      pendingFocusRef.current = fn;
    } else {
      fn();
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    pendingFocusRef.current = null;
    wasDragRef.current = false;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const pos = pointerDownPosRef.current;
    pointerDownPosRef.current = null;
    const isDrag = !!pos && (e.clientX - pos.x) ** 2 + (e.clientY - pos.y) ** 2 >= 25;
    if (isDrag) {
      wasDragRef.current = true;
      requestAnimationFrame(() => { wasDragRef.current = false; });
    }
    if (pendingFocusRef.current && !isDrag) {
      pendingFocusRef.current();
    }
    pendingFocusRef.current = null;
  }, []);

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
    if (claudeCliState !== 'idle') return;
    scrollToBottomRef.current?.();
  }, [claudeCliState]);

  const handleOptimisticSend = useCallback((text: string) => {
    addPendingMessageRef.current?.(text);
  }, []);

  const handleAddPendingMessage = useCallback(
    (text: string, options?: { autoHide?: boolean; attachmentPlaceholder?: boolean }) =>
      addPendingMessageRef.current?.(text, options) ?? '',
    [],
  );

  const handleRemovePendingMessage = useCallback((id: string) => {
    removePendingMessageRef.current?.(id);
  }, []);

  const handleTimelineDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleTimelineDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    if (!attachFilesRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    void attachFilesRef.current(Array.from(e.dataTransfer.files));
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
    fontSize: (TERMINAL_FONT_SIZES[configFontSize] ?? TERMINAL_FONT_SIZES.normal)[isClaudeCode ? 'claudeCode' : 'normal'],
    onInput: (data) => {
      wsActionsRef.current.sendStdin(data);
    },
    onResize: (cols, rows) => wsActionsRef.current.sendResize(cols, rows),
    onTitleChange: (title) => {
      const tabId = activeTabIdRef.current;
      if (!tabId) return;
      const activeTab = tabsRef.current.find((t) => t.id === tabId);
      if (activeTab?.panelType === 'web-browser') return;
      if (title === lastTitleRef.current) return;
      lastTitleRef.current = title;

      const formatted = formatTabTitle(title);
      const process = parseCurrentCommand(title);
      useTabMetadataStore.getState().setTitle(tabId, formatted);
      useTabStore.getState().setCurrentProcess(tabId, process);
      if (isShellProcess(title) && pendingRestartRef.current) {
        const cmd = pendingRestartRef.current;
        pendingRestartRef.current = null;
        wsActionsRef.current.sendStdin(`${cmd}\r`);
      }
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab) {
        const prevCheckedAt = useTabStore.getState().tabs[tabId]?.claudeProcessCheckedAt ?? 0;
        fetch(`/api/check-claude?session=${tab.sessionName}`)
          .then((res) => res.json())
          .then(({ running, checkedAt }) => {
            const current = useTabStore.getState().tabs[tabId];
            if (current && current.claudeProcessCheckedAt !== prevCheckedAt) {
              if (current.claudeProcess !== running) {
                setTimeout(() => {
                  fetch(`/api/check-claude?session=${tab.sessionName}`)
                    .then((r) => r.json())
                    .then(({ running, checkedAt }) => {
                      useTabStore.getState().setClaudeProcess(tabId, running, checkedAt);
                    })
                    .catch(() => {});
                }, 500);
              }
              return;
            }
            useTabStore.getState().setClaudeProcess(tabId, running, checkedAt);
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
    if (closingTabIdRef.current) return;

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

    closingTabIdRef.current = currentActiveTabId;
    try {
      await deleteTabInPane(paneId, currentActiveTabId);
    } finally {
      closingTabIdRef.current = null;
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
      clearTimeout(sessionSwitchTimerRef.current);
      sessionSwitchTimerRef.current = window.setTimeout(() => setSessionSwitching(false), 50);
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
    if (tab.panelType === 'web-browser') {
      lastTitleRef.current = '';
      return;
    }
    if (connectedSessionRef.current === tab.sessionName) return;

    if (connectedSessionRef.current !== null) {
      setSessionSwitching(true);
      reset();
      lastTitleRef.current = '';
    }

    // 탭 전환 시 터미널 연결 상태만 리셋, 상태 WS가 관리하는 값은 보존
    useTabStore.getState().initTab(activeTabId, {
      terminalConnected: false,
      panelType: tab.panelType,
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
        deferredFocusInput(() => focusInputRef.current?.());
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

  const handleCreateTab = useCallback(async (panelType?: TPanelType, options?: { command?: string }) => {
    setIsCreating(true);
    const newTab = await createTabInPane(paneId, panelType, options?.command);
    if (newTab) {
      useTabStore.getState().initTab(newTab.id, { panelType, workspaceId: layoutWsId ?? '' });
      if (options?.command) {
        useTabStore.getState().setSessionView(newTab.id, 'check');
      }
      const currentTabId = activeTabIdRef.current;
      const currentTitle = currentTabId
        ? useTabMetadataStore.getState().metadata[currentTabId]?.title
        : null;
      if (currentTitle && panelType !== 'web-browser') {
        useTabMetadataStore.getState().setTitle(newTab.id, currentTitle);
      }
    }
    setIsCreating(false);
  }, [paneId, createTabInPane, layoutWsId]);

  const handleDeleteTab = useCallback(
    async (tabId: string) => {
      if (closingTabIdRef.current) return;
      const isLastTab = tabs.length === 1;
      if (isLastTab && paneCount > 1) {
        closePane(paneId);
        return;
      }
      closingTabIdRef.current = tabId;
      try {
        await deleteTabInPane(paneId, tabId);
      } finally {
        closingTabIdRef.current = null;
      }
    },
    [paneId, tabs, paneCount, deleteTabInPane, closePane],
  );

  const handleRestartTab = useCallback(
    async (tabId: string, command?: string) => {
      const ok = await useLayoutStore.getState().restartTabInPane(paneId, tabId, command);
      if (ok) reconnect();
    },
    [paneId, reconnect],
  );

  const autoRestartedTabsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (status !== 'disconnected' || disconnectReason !== 'session-not-found') return;
    if (!activeTabId || !activeTab) return;
    const effectivePanelType = activeTab.panelType ?? 'terminal';
    if (effectivePanelType !== 'terminal') return;
    if (activeTab.lastCommand) return;
    if (autoRestartedTabsRef.current.has(activeTabId)) return;
    autoRestartedTabsRef.current.add(activeTabId);
    handleRestartTab(activeTabId);
  }, [status, disconnectReason, activeTabId, activeTab, handleRestartTab]);

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

  const handleSwitchPanelType = useCallback((next: TPanelType) => {
    if (!activeTabId) return;
    setIsPanelTransitioning(true);
    updateTabPanelType(paneId, activeTabId, next);
  }, [paneId, activeTabId, updateTabPanelType]);

  const handleSendToClaude = useCallback((text: string) => {
    pendingClaudeInputRef.current = text;
    handleSwitchPanelType('claude-code');
  }, [handleSwitchPanelType]);

  useEffect(() => {
    if (activePanelType !== 'claude-code' || !pendingClaudeInputRef.current) return;
    const text = pendingClaudeInputRef.current;
    pendingClaudeInputRef.current = null;
    const timer = window.setTimeout(() => {
      setInputValueRef.current?.(text);
      focusInputRef.current?.();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [activePanelType]);

  const handleWebUrlChange = useCallback((url: string) => {
    if (!activeTabId || !layoutWsId) return;
    fetch(`/api/layout/pane/${paneId}/tabs/${activeTabId}?workspace=${layoutWsId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webUrl: url }),
    }).catch(() => {});
  }, [activeTabId, paneId, layoutWsId]);

  useEffect(() => {
    if (!activeTabId || claudeProcess !== true || activePanelType !== 'terminal') {
      setShowClaudeModePrompt(false);
      return;
    }
    if (claudeModeShownTabsRef.current.has(activeTabId)) return;

    claudeModeShownTabsRef.current.add(activeTabId);
    setShowClaudeModePrompt(true);
  }, [activeTabId, claudeProcess, activePanelType]);

  const {
    showPathInput,
    droppedFileHint,
    handleDragOver: handleTerminalDragOver,
    handleDrop: handleTerminalDrop,
    handlePathInputSubmit,
    handlePathInputDismiss,
  } = useFileDrop({
    sendStdin: (data) => wsActionsRef.current.sendStdin(data),
    focus,
    wsId: layoutWsId ?? undefined,
    tabId: activeTabId ?? undefined,
  });

  const buildClaudeCommand = useCallback((sessionId: string | null): string => {
    const dangerous = useConfigStore.getState().dangerouslySkipPermissions;
    const settings = '--settings ~/.purplemux/hooks.json';
    const prompt = layoutWsId ? `--append-system-prompt-file ~/.purplemux/workspaces/${layoutWsId}/claude-prompt.md` : '';
    const flags = [settings, prompt].filter(Boolean).join(' ');
    const base = sessionId
      ? `claude --resume ${sessionId} ${flags}`
      : `claude ${flags}`;
    return dangerous ? `${base} --dangerously-skip-permissions` : base;
  }, [layoutWsId]);

  const handleNewClaudeSession = useCallback(() => {
    if (status !== 'connected' || !activeTabId) return;
    useTabStore.getState().setSessionView(activeTabId, 'check');
    sendStdin(`${buildClaudeCommand(null)}\r`);
  }, [status, sendStdin, activeTabId, buildClaudeCommand]);

  const handleRestartClaudeSession = useCallback(() => {
    if (status !== 'connected' || !activeTabId) return;
    pendingRestartRef.current = buildClaudeCommand(null);
    useTabStore.getState().setSessionView(activeTabId, 'check');
    sendStdin('/exit\r');
  }, [status, sendStdin, activeTabId, buildClaudeCommand]);

  const handleSwitchToClaudeMode = useCallback(async () => {
    if (!activeTabId) return;
    setShowClaudeModePrompt(false);
    handleSwitchPanelType('claude-code');
    if (status !== 'connected') return;

    let resumeSessionId = claudeSessionId;
    if (!resumeSessionId) {
      const tab = tabsRef.current.find((t) => t.id === activeTabId);
      if (tab) {
        try {
          const res = await fetch(`/api/check-claude?session=${tab.sessionName}`);
          const data = await res.json();
          resumeSessionId = typeof data.sessionId === 'string' && data.resumable ? data.sessionId : null;
        } catch {
          // fall through with null
        }
      }
    }

    pendingRestartRef.current = buildClaudeCommand(resumeSessionId);
    useTabStore.getState().setSessionView(activeTabId, 'check');
    sendStdin('\x03');
    setTimeout(() => sendStdin('\x03'), 300);
  }, [activeTabId, status, sendStdin, claudeSessionId, buildClaudeCommand, handleSwitchPanelType]);

  useEffect(() => {
    if (!pendingRestartRef.current || claudeProcess === true) return;
    if (status !== 'connected') return;
    if (!isShellProcess(lastTitleRef.current)) return;
    const cmd = pendingRestartRef.current;
    pendingRestartRef.current = null;
    sendStdin(`${cmd}\r`);
  }, [claudeProcess, status, sendStdin]);

  const splitGroupRef = useRef<GroupImperativeHandle>(null);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
  const suppressTerminalSaveRef = useRef(false);

  const handleToggleTerminal = useCallback(() => {
    if (!splitGroupRef.current) return;
    setIsPanelTransitioning(true);
    const next = !isTerminalCollapsed;
    const ratio = activeTab?.terminalRatio ?? 30;
    setIsTerminalCollapsed(next);
    suppressTerminalSaveRef.current = true;
    splitGroupRef.current.setLayout(
      next
        ? { timeline: 100, 'terminal-area': 0 }
        : { timeline: 100 - ratio, 'terminal-area': ratio },
    );
    if (isClaudeCode && activeTabId) {
      updateTabTerminalLayout(paneId, activeTabId, { terminalCollapsed: next });
    }
    setTimeout(() => {
      setIsPanelTransitioning(false);
      suppressTerminalSaveRef.current = false;
      if (!isReady || status !== 'connected') return;
      const { cols, rows } = fit();
      wsActionsRef.current.sendResize(cols, rows);
    }, 150);
  }, [isTerminalCollapsed, isReady, status, fit, isClaudeCode, activeTabId, paneId, activeTab?.terminalRatio, updateTabTerminalLayout]);

  useEffect(() => {
    if (!splitGroupRef.current) return;
    suppressTerminalSaveRef.current = true;
    if (isClaudeCode) {
      const ratio = activeTab?.terminalRatio ?? 30;
      setIsTerminalCollapsed(effectiveTerminalCollapsed);
      splitGroupRef.current.setLayout(
        effectiveTerminalCollapsed
          ? { timeline: 100, 'terminal-area': 0 }
          : { timeline: 100 - ratio, 'terminal-area': ratio },
      );
      fetchAndUpdateCwd();
    } else {
      splitGroupRef.current.setLayout({ timeline: 0, 'terminal-area': 100 });
    }
    const timer = setTimeout(() => {
      setIsPanelTransitioning(false);
      suppressTerminalSaveRef.current = false;
      if (!isReady || status !== 'connected') return;
      const { cols, rows } = fit();
      wsActionsRef.current.sendResize(cols, rows);
      if (isFocused) {
        if (isClaudeCode) {
          if (claudeInputVisible) deferredFocusInput(() => focusInputRef.current?.());
        } else {
          focus();
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [isClaudeCode, activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFocused && isClaudeCode && claudeInputVisible) {
      deferredFocusInput(() => focusInputRef.current?.());
    }
  }, [claudeInputVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  const noTabs = tabs.length === 0;
  const ready = isReady && (status === 'connected' || hasEverConnected) && !noTabs && !sessionSwitching;
  const showInitialLoading =
    !noTabs &&
    (!isReady || !hasEverConnected);

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden',
        paneCount > 1 && 'border',
        paneCount > 1 && isFocused ? 'border-focus-indicator' : 'border-transparent',
      )}
      style={{
        opacity: !mounted ? 0 : undefined,
        transition: 'opacity 200ms ease-out, border-color 150ms',
      }}
      role="region"
      aria-label={`Pane ${paneNumber}`}
      aria-current={isFocused ? 'true' : undefined}
      onClick={handleFocusPane}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <PaneTabBar
        paneId={paneId}
        tabs={tabs}
        activeTabId={activeTabId}
        tabTitles={tabTitles}
        tabProcesses={tabProcesses}
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
        style={isWebBrowser || isDiff ? undefined : { backgroundColor: terminalTheme.colors.background }}
        onDragOver={isWebBrowser || isDiff ? undefined : handleTerminalDragOver}
        onDrop={isWebBrowser || isDiff ? undefined : handleTerminalDrop}
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
            onSendToClaude={handleSendToClaude}
          />
        )}

        <Group
          groupRef={splitGroupRef}
          orientation="vertical"
          defaultLayout={isClaudeCode
            ? (() => {
                const ratio = activeTab?.terminalRatio ?? 30;
                return effectiveTerminalCollapsed
                  ? { timeline: 100, 'terminal-area': 0 }
                  : { timeline: 100 - ratio, 'terminal-area': ratio };
              })()
            : { timeline: 0, 'terminal-area': 100 }
          }
          onLayoutChanged={(layout) => {
            if (suppressTerminalSaveRef.current) return;
            if (!isClaudeCode || !activeTabId) return;
            const area = layout['terminal-area'];
            if (area === undefined) return;
            const collapsed = area <= 0;
            const patch: { terminalRatio?: number; terminalCollapsed?: boolean } = {};
            if (collapsed !== effectiveTerminalCollapsed) {
              patch.terminalCollapsed = collapsed;
              setIsTerminalCollapsed(collapsed);
            }
            if (!collapsed) {
              const rounded = Math.round(area);
              const currentRatio = activeTab?.terminalRatio ?? 30;
              if (rounded !== currentRatio) patch.terminalRatio = rounded;
            }
            if (patch.terminalRatio !== undefined || patch.terminalCollapsed !== undefined) {
              updateTabTerminalLayout(paneId, activeTabId, patch);
            }
          }}
          className={cn('min-h-0 flex-1', (isWebBrowser || isDiff) && 'invisible absolute inset-0 pointer-events-none', isPanelTransitioning && '[&>[data-panel]]:[transition:flex-grow_150ms_ease-out]')}
        >
          <Panel
            id="timeline"
            minSize={0}
            collapsible
            collapsedSize={0}
            disabled={!isClaudeCode}
          >
            <div
              className={cn('flex h-full flex-col bg-card', isTerminalCollapsed && 'pb-3')}
              onDragOver={isClaudeCode ? handleTimelineDragOver : undefined}
              onDrop={isClaudeCode ? handleTimelineDrop : undefined}
            >
              {isClaudeCode && activeTab && !showInitialLoading && activeTabId && (
                <ClaudeCodePanel
                  key={activeTab.sessionName}
                  tabId={activeTabId}
                  sessionName={activeTab.sessionName}
                  claudeSessionId={activeTab.claudeSessionId}
                  cwd={activeTabCwd || activeTab.cwd}
                  onClose={() => handleSwitchPanelType('terminal')}
                  onNewSession={handleNewClaudeSession}
                  scrollToBottomRef={scrollToBottomRef}
                  addPendingMessageRef={addPendingMessageRef}
                  removePendingMessageRef={removePendingMessageRef}
                />
              )}
              {isClaudeCode && !showInitialLoading && claudeInputVisible && (
                <WebInputBar
                  key={activeTabId}
                  tabId={activeTabId ?? undefined}
                  wsId={layoutWsId ?? undefined}
                  sessionName={activeTab?.sessionName}
                  claudeSessionId={activeTab?.claudeSessionId}
                  cliState={claudeCliState}
                  sendStdin={sendWebStdin}
                  terminalWsConnected={status === 'connected'}
                  visible
                  focusTerminal={focus}
                  focusInputRef={focusInputRef}
                  setInputValueRef={setInputValueRef}
                  onRestartSession={handleRestartClaudeSession}
                  onSend={handleScrollToBottom}
                  onOptimisticSend={handleOptimisticSend}
                  onAddPendingMessage={handleAddPendingMessage}
                  onRemovePendingMessage={handleRemovePendingMessage}
                  attachFilesRef={attachFilesRef}
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
                minHeight={isClaudeCode ? 256 : undefined}
                className={cn(
                  'min-h-0 flex-1',
                  ready ? 'opacity-100' : 'opacity-0',
                  isClaudeCode && 'py-0 pl-2 pr-0.5',
                )}
              />
            </div>
          </Panel>
        </Group>

        {noTabs && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <Button className="gap-1.5" onClick={() => handleCreateTab()} disabled={isCreating}>
              {isCreating ? (
                <Spinner className="h-3 w-3" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {t('openNewTab')}
            </Button>
          </div>
        )}


        {!noTabs && activePanelType === 'terminal' && status === 'disconnected' && disconnectReason === 'session-not-found' && activeTabId && (
          <PaneDisconnectedOverlay
            cwd={activeTab?.cwd}
            lastCommand={activeTab?.lastCommand}
            onRestartWithCommand={(cmd) => handleRestartTab(activeTabId, cmd)}
            onRestartNew={() => handleRestartTab(activeTabId)}
          />
        )}

        {showClaudeModePrompt && (
          <PaneClaudeModePrompt
            onSwitch={handleSwitchToClaudeMode}
            onDismiss={() => setShowClaudeModePrompt(false)}
          />
        )}

        {showPathInput && (
          <PanePathInputOverlay
            hint={droppedFileHint}
            onSubmit={handlePathInputSubmit}
            onDismiss={handlePathInputDismiss}
          />
        )}

        {!noTabs && !isWebBrowser && !isDiff && (
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
