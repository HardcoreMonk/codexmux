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
  fit: () => ({ cols: 40, rows: 24 }),
  focus: () => {},
};

const NOOP_WS_ACTIONS: IWsActions = {
  sendStdin: () => {},
  sendResize: () => {},
};

type TClaudeActiveTab = 'timeline' | 'terminal';

interface IMobileSurfaceViewProps {
  paneId: string;
  tabs: ITab[];
  activeTabId: string | null;
  panelType: TPanelType;
  claudeActiveTab: TClaudeActiveTab;
  onCreateTab: (paneId: string) => Promise<ITab | null>;
  onDeleteTab: (paneId: string, tabId: string) => Promise<void>;
  onSwitchTab: (paneId: string, tabId: string) => void;
  onRemoveTabLocally: (paneId: string, tabId: string) => void;
  onUpdateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
  onCliStateChange?: (state: TCliState) => void;
}

const MOBILE_FONT_SIZE = 12;

const MobileSurfaceView = ({
  paneId,
  tabs,
  activeTabId,
  panelType,
  claudeActiveTab,
  onCreateTab,
  onDeleteTab,
  onSwitchTab,
  onRemoveTabLocally,
  onUpdateTabPanelType,
  onCliStateChange,
}: IMobileSurfaceViewProps) => {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isClaudeCode = panelType === 'claude-code';

  const { theme: terminalTheme } = useTerminalTheme();
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const termActionsRef = useRef<ITermActions>(NOOP_TERM_ACTIONS);
  const wsActionsRef = useRef<IWsActions>(NOOP_WS_ACTIONS);
  const connectedSessionRef = useRef<string | null>(null);
  const prevConnectedTabIdRef = useRef<string | null>(null);

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
  const processHintRef = useRef<((isClaudeRunning: boolean) => void) | undefined>(undefined);
  const manualToggleCooldownRef = useRef<Record<string, number>>({});
  const claudeCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCliStateChange = useCallback((state: TCliState) => {
    onCliStateChange?.(state);
  }, [onCliStateChange]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleInputVisibleChange = useCallback((_visible: boolean) => {}, []);

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
          onUpdateTabPanelType(paneId, tabId, 'claude-code');
        }
      }
    } catch { /* ignore */ }
  }, [paneId, onUpdateTabPanelType]);

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
    fontSize: isClaudeCode ? undefined : MOBILE_FONT_SIZE,
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
        delete manualToggleCooldownRef.current[tabId];
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
    return () => {
      if (claudeCheckTimerRef.current) clearTimeout(claudeCheckTimerRef.current);
    };
  }, []);

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
    sendResize,
  } = useTerminalWebSocket({
    onData: (data) => termActionsRef.current.write(data),
    onConnected: () => {
      setHasEverConnected(true);
      prevConnectedTabIdRef.current = activeTabIdRef.current;
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
    }, 300);
    return () => clearTimeout(timer);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isClaudeCode && claudeActiveTab === 'terminal' && isReady && status === 'connected') {
      const timer = setTimeout(() => {
        const { cols, rows } = fit();
        wsActionsRef.current.sendResize(cols, rows);
        focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [claudeActiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateTab = useCallback(async () => {
    setIsCreating(true);
    await onCreateTab(paneId);
    setIsCreating(false);
  }, [paneId, onCreateTab]);

  const noTabs = tabs.length === 0;
  const ready = isReady && status === 'connected' && !noTabs;
  const showInitialLoading =
    !noTabs &&
    (!isReady || (isReady && status === 'connecting' && !hasEverConnected));

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        backgroundColor: terminalTheme.colors.background,
        overscrollBehavior: 'none',
      }}
    >
      {isClaudeCode && activeTab ? (
        <MobileClaudeCodePanel
          sessionName={activeTab.sessionName}
          claudeSessionId={activeTab.claudeSessionId}
          claudeActiveTab={claudeActiveTab}
          terminalRef={terminalRef}
          terminalReady={ready}
          sendStdin={sendStdin}
          terminalWsConnected={status === 'connected'}
          focusTerminal={focus}
          focusInputRef={focusInputRef}
          processHintRef={processHintRef}
          onCliStateChange={handleCliStateChange}
          onInputVisibleChange={handleInputVisibleChange}
        />
      ) : (
        <TerminalContainer
          ref={terminalRef}
          className={cn(
            'min-h-0 flex-1 transition-opacity duration-150',
            ready ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}

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
              onClick={() => onDeleteTab(paneId, activeTabId)}
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
  );
};

export default MobileSurfaceView;
