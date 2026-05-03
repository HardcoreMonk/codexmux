import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, RefreshCw, TerminalSquare } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import TerminalContainer from '@/components/features/workspace/terminal-container';
import ConnectionStatus from '@/components/features/workspace/connection-status';
import useRemoteTerminalSources from '@/hooks/use-remote-terminal-sources';
import useTerminal from '@/hooks/use-terminal';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import useBrowserTitle from '@/hooks/use-browser-title';
import { cn } from '@/lib/utils';
import type { IRemoteTerminalStatus } from '@/types/remote-terminal';

interface ITermActions {
  write: (data: Uint8Array) => void;
  reset: () => void;
  fit: () => { cols: number; rows: number };
  focus: () => void;
}

const NOOP_TERM_ACTIONS: ITermActions = {
  write: () => {},
  reset: () => {},
  fit: () => ({ cols: 80, rows: 24 }),
  focus: () => {},
};

const terminalKey = (terminal: Pick<IRemoteTerminalStatus, 'sourceId' | 'terminalId'>) =>
  `${terminal.sourceId}:${terminal.terminalId}`;

const RemoteTerminalPage = () => {
  const t = useTranslations('terminal');
  const router = useRouter();
  const { theme } = useTerminalTheme();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const connectedKeyRef = useRef<string | null>(null);
  const termActionsRef = useRef<ITermActions>(NOOP_TERM_ACTIONS);

  useBrowserTitle(t('windowsTerminalTitle'));

  const {
    terminals,
    isLoading,
    error,
    refetch,
  } = useRemoteTerminalSources({ enabled: true });

  const selected = useMemo(() => {
    const querySource = typeof router.query.sourceId === 'string' ? router.query.sourceId : null;
    const queryTerminal = typeof router.query.terminalId === 'string' ? router.query.terminalId : null;
    const queryMatch = querySource
      ? terminals.find((terminal) =>
          terminal.sourceId === querySource && (!queryTerminal || terminal.terminalId === queryTerminal))
      : null;
    if (queryMatch) return queryMatch;
    if (querySource) {
      const now = new Date().toISOString();
      return {
        sourceId: querySource,
        terminalId: queryTerminal || 'main',
        sourceLabel: `${querySource} / pwsh`,
        host: querySource,
        shell: 'pwsh',
        cwd: null,
        cols: 80,
        rows: 24,
        commandSeq: 0,
        outputSeq: 0,
        pendingCommandCount: 0,
        outputBytes: 0,
        connectedClientCount: 0,
        createdAt: now,
        lastSeenAt: now,
        lastCommandAt: null,
        lastOutputAt: null,
      };
    }
    if (terminals.length === 0) return null;
    if (selectedKey) {
      const current = terminals.find((terminal) => terminalKey(terminal) === selectedKey);
      if (current) return current;
    }
    return terminals[0];
  }, [router.query.sourceId, router.query.terminalId, selectedKey, terminals]);

  const { terminalRef, write, reset, fit, focus, isReady } = useTerminal({
    theme: theme.colors,
    onInput: (data) => sendStdin(data),
    onResize: (cols, rows) => sendResize(cols, rows),
  });

  const {
    status,
    retryCount,
    disconnectReason,
    connect,
    reconnect,
    sendStdin,
    sendResize,
  } = useTerminalWebSocket({
    endpoint: '/api/remote/terminal',
    sourceId: selected?.sourceId,
    terminalId: selected?.terminalId,
    onData: (data) => termActionsRef.current.write(data),
    onConnected: () => {
      setHasEverConnected(true);
      const { cols, rows } = termActionsRef.current.fit();
      sendResize(cols, rows);
      termActionsRef.current.focus();
    },
  });

  useEffect(() => {
    termActionsRef.current = { write, reset, fit, focus };
  });

  useEffect(() => {
    if (!isReady || !selected) return;
    const nextKey = terminalKey(selected);
    if (connectedKeyRef.current === nextKey) return;
    connectedKeyRef.current = nextKey;
    reset();
    const { cols, rows } = fit();
    connect(`remote:${nextKey}`, cols, rows);
  }, [connect, fit, isReady, reset, selected]);

  useEffect(() => {
    if (!isReady || status !== 'connected') return;
    const timer = window.setTimeout(() => {
      const { cols, rows } = fit();
      sendResize(cols, rows);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [fit, isReady, sendResize, status]);

  const handleSelectTerminal = useCallback((terminal: IRemoteTerminalStatus) => {
    const key = terminalKey(terminal);
    setSelectedKey(key);
    void router.replace({
      pathname: router.pathname,
      query: {
        sourceId: terminal.sourceId,
        terminalId: terminal.terminalId,
      },
    }, undefined, { shallow: true });
  }, [router]);

  const ready = isReady && (status === 'connected' || hasEverConnected);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <TerminalSquare className="h-4 w-4 text-agent-active" />
        <h1 className="text-sm font-semibold">{t('windowsTerminalTitle')}</h1>
        <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto">
          {terminals.map((terminal) => (
            <Button
              key={terminalKey(terminal)}
              variant={selected && terminalKey(selected) === terminalKey(terminal) ? 'secondary' : 'ghost'}
              size="xs"
              className="shrink-0"
              title={terminal.sourceLabel}
              onClick={() => handleSelectTerminal(terminal)}
            >
              <Monitor className="h-3 w-3" />
              <span className="max-w-[140px] truncate">{terminal.sourceId}</span>
            </Button>
          ))}
          <Button variant="ghost" size="xs" onClick={() => void refetch()}>
            <RefreshCw className="h-3 w-3" />
            {t('retryAction')}
          </Button>
        </div>
      </div>

      {selected && (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{selected.sourceLabel}</span>
          {selected.cwd && <span className="min-w-0 truncate">{selected.cwd}</span>}
          <span className="ml-auto shrink-0 tabular-nums">
            {selected.cols}x{selected.rows}
          </span>
        </div>
      )}

      <div
        className="relative min-h-0 flex-1"
        style={{ backgroundColor: theme.colors.background }}
      >
        {isLoading && terminals.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-background">
            <Spinner className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('connecting')}</span>
          </div>
        )}
        {!selected && !isLoading && terminals.length === 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
            <Monitor className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">{t('windowsTerminalNoSource')}</p>
            <p className="max-w-xl text-xs text-muted-foreground">{t('windowsTerminalNoSourceHint')}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('retryAction')}
            </Button>
          </div>
        )}
        {error && terminals.length === 0 && (
          <div className="absolute inset-x-0 top-0 z-30 bg-ui-red/10 px-3 py-2 text-xs text-ui-red">
            {error}
          </div>
        )}
        <TerminalContainer
          ref={terminalRef}
          className={cn('min-h-0 flex-1', ready ? 'opacity-100' : 'opacity-0')}
        />
        {selected && status !== 'connected' && (
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

export default RemoteTerminalPage;
